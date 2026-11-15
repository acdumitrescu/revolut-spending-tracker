import { createPersistedAppState } from './appState';
import { migrateState, NewerSchemaVersionError } from './migrations';
import { AppDataSchema, PersistedAppStateSchema, sanitizePersistedAppState } from './validation';

export function loadLocalAppState(storageKey, storage = localStorage) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return {
        persistedState: createPersistedAppState(undefined),
        issues: [],
      };
    }

    const parsed = JSON.parse(raw);
    return {
      persistedState: sanitizePersistedAppState(parsed),
      issues: [],
    };
  } catch (error) {
    if (error instanceof NewerSchemaVersionError) {
      // Written by a newer app: start empty and never save over the stored copy.
      console.error('Saved workspace uses a newer schema version:', error.message);
      return {
        persistedState: createPersistedAppState(undefined),
        issues: ['newer-local-state'],
        readOnly: true,
      };
    }
    console.error('Failed to load data from local storage', error);
    return {
      persistedState: createPersistedAppState(undefined),
      issues: ['corrupted-local-state'],
    };
  }
}

export function saveLocalAppState(storageKey, persistedState, storage = localStorage) {
  storage.setItem(storageKey, JSON.stringify(persistedState));
}

export function clearLocalAppState(storageKey, storage = localStorage) {
  storage.removeItem(storageKey);
}

export function serializeBackupState(persistedState) {
  return JSON.stringify(
    {
      ...persistedState,
      exportedAt: Date.now(),
    },
    null,
    2,
  );
}

/**
 * Strict check for a workspace from outside this browser (backup file, server snapshot): a
 * versioned envelope is migrated to the current version and must then match the schema; an
 * unversioned value must be the documented raw legacy AppData shape. Never repairs.
 * Throws NewerSchemaVersionError for a version newer than this app.
 */
export function validateStoredAppState(parsed) {
  return parsed && Object.hasOwn(parsed, 'schemaVersion')
    ? PersistedAppStateSchema.safeParse(migrateState(parsed))
    : AppDataSchema.safeParse(parsed);
}

export function parseImportedAppState(text) {
  const parsed = JSON.parse(text);
  // Only the documented raw legacy shape may omit a version. Never recover
  // arbitrary imports using the permissive local-storage repair path.
  let result;
  try {
    result = validateStoredAppState(parsed);
  } catch (error) {
    if (error instanceof NewerSchemaVersionError)
      throw new Error(`${error.message} Nothing was replaced.`, { cause: error });
    throw error;
  }
  if (!result.success)
    throw new Error('Invalid or unsupported SimpleSafeBanking backup. Nothing was replaced.');
  return sanitizePersistedAppState(result.data);
}
