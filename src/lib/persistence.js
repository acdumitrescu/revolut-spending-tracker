import { createPersistedAppState } from './appState';
import { sanitizePersistedAppState } from './validation';

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
  return sanitizePersistedAppState(parsed);
}
