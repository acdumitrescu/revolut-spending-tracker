import { describe, expect, it, vi } from 'vitest';
import {
  clearLocalAppState,
  loadLocalAppState,
  parseImportedAppState,
  saveLocalAppState,
  serializeBackupState,
} from '../lib/persistence';
import { createPersistedAppState } from '../lib/appState';

describe('persistence', () => {
  it('recovers from corrupted local state without throwing', () => {
    const storage = {
      getItem: vi.fn(() => '{not-json'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    const result = loadLocalAppState('key', storage);
    expect(result.issues).toContain('corrupted-local-state');
    expect(result.persistedState.schemaVersion).toBe(1);
  });

  it('saves and clears the versioned local state contract', () => {
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const persisted = createPersistedAppState();

    saveLocalAppState('key', persisted, storage);
    clearLocalAppState('key', storage);

    expect(storage.setItem).toHaveBeenCalledWith('key', JSON.stringify(persisted));
    expect(storage.removeItem).toHaveBeenCalledWith('key');
  });

  it('parses legacy raw backups and upgrades them into the versioned contract', () => {
    const parsed = parseImportedAppState(JSON.stringify({
      transactions: [],
      customVendors: {},
      accounts: [],
      budgets: {},
      goals: [],
      lastUpdated: null,
    }));

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.data.displayCurrency).toBe('RON');
  });

  it('serializes a stable export contract for backups', () => {
    const persisted = createPersistedAppState();
    const text = serializeBackupState(persisted);
    const parsed = JSON.parse(text);

    expect(parsed.schemaVersion).toBe(1);
    expect(typeof parsed.exportedAt).toBe('number');
    expect(parsed.data).toBeTruthy();
  });
});
