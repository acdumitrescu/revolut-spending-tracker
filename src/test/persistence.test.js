import { describe, expect, it, vi } from 'vitest';
import {
  clearLocalAppState,
  loadLocalAppState,
  parseImportedAppState,
  saveLocalAppState,
  serializeBackupState,
} from '../lib/persistence';
import { createPersistedAppState } from '../lib/appState';
import { resolveTransactionCategories } from '../lib/transactionCategories';

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

  it('restores saved custom mappings and reapplies them after reload', () => {
    let savedValue = null;
    const storage = {
      getItem: vi.fn(() => savedValue),
      setItem: vi.fn((...args) => {
        savedValue = args[1];
      }),
      removeItem: vi.fn(),
    };
    const persisted = createPersistedAppState({
      ...createPersistedAppState().data,
      transactions: [
        {
          date: '2026-06-01',
          desc: 'Synthetic Merchant Location',
          cat: 'Other',
          sub: '',
          amt: -20,
          flow: 'Debit',
          type: 'Card Payment',
          ym: '2026-06',
          currency: 'RON',
        },
      ],
      customVendors: {
        'Synthetic Merchant': ['Shopping', 'General'],
      },
    });

    saveLocalAppState('key', persisted, storage);
    const reloaded = loadLocalAppState('key', storage).persistedState;
    const [resolved] = resolveTransactionCategories(
      reloaded.data.transactions,
      reloaded.data.customVendors,
    );

    expect(reloaded.data.customVendors).toEqual(persisted.data.customVendors);
    expect(resolved.cat).toBe('Shopping');
    expect(resolved.categorySource).toBe('custom');
  });

  it('parses legacy raw backups and upgrades them into the versioned contract', () => {
    const parsed = parseImportedAppState(
      JSON.stringify({
        transactions: [],
        customVendors: {},
        accounts: [],
        budgets: {},
        goals: [],
        lastUpdated: null,
      }),
    );

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
