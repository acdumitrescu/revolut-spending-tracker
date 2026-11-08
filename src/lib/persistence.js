import { createPersistedAppState } from './appState';
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
  return JSON.stringify({
    ...persistedState,
    exportedAt: Date.now(),
  }, null, 2);
}

export function parseImportedAppState(text) {
  const parsed = JSON.parse(text);
  // Only the documented raw legacy shape may omit a version. Never recover
  // arbitrary imports using the permissive local-storage repair path.
  const result = parsed && Object.hasOwn(parsed, 'schemaVersion')
    ? PersistedAppStateSchema.safeParse(parsed)
    : AppDataSchema.safeParse(parsed);
  if (!result.success) throw new Error('Invalid or unsupported SimpleSafeBanking backup. Nothing was replaced.');
  return sanitizePersistedAppState(result.data);
}
