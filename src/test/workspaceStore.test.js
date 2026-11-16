// Client-only workspace store (IndexedDB layout, atomic replace, migration, fallback).
// Uses the in-memory backend from fixtures; synthetic data only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialAppData, createPersistedAppState } from '../lib/appState';
import { PHONE_COPY_KEY, PhoneStorageFullError } from '../lib/phoneCopy';
import {
  createBrowserWorkspaceStore,
  readStorageStatus,
  requestPersistentStorage,
  STORAGE_LOCATION_KEY,
  STORE_KEYS,
  WorkspaceStorageUnavailableError,
} from '../lib/workspaceStore';
import {
  createFakeBackend,
  createFakeStorageManager,
  createFakeStore,
  quotaError,
} from './fixtures/fakeWorkspaceBackend';

const KEY = 'simple_safe_banking_state_v1';
const BEFORE_RESTORE = `${KEY}_before_restore`;

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function workspace(accountName = 'Fake Savings', transactions = []) {
  return createPersistedAppState({
    ...createInitialAppData(),
    accounts: [
      { id: 'acc-fake', name: accountName, currency: 'RON', balances: { '2026-01': 1 }, notes: {} },
    ],
    transactions,
    lastUpdated: 1_000,
  });
}

const RECORD = { syncedAt: 1_700_000_000_000, fileCreatedAt: 1_690_000_000_000, source: 'Mac' };

function syntheticTransactions(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 28) + 1).padStart(2, '0');
    rows.push({
      date: `2025-${month}-${day}`,
      ym: `2025-${month}`,
      desc: `Synthetic Merchant ${i % 400} Example Street ${i % 90} Testville contactless card payment reference order ${i}`,
      cat: i % 3 ? 'Groceries' : 'Transport',
      sub: '',
      amt: -((i % 9000) / 100 + 1),
      flow: 'Debit',
      type: 'Card Payment',
      currency: 'RON',
    });
  }
  return rows;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('workspace store on IndexedDB', () => {
  it('round-trips a workspace as a structured-clone object and reloads it', async () => {
    const storage = memoryStorage();
    const { store, backend } = createFakeStore({ storage, storageKey: KEY });
    const first = await store.hydrate();
    expect(first.backend).toBe('indexeddb');
    expect(first.load.persistedState.data.accounts).toEqual([]);
    expect(first.phoneCopy).toBeNull();

    const saved = workspace();
    store.scheduleSave(saved);
    await store.whenSaved().catch(() => {});
    expect(typeof backend.values.get(STORE_KEYS.workspace)).toBe('object');
    expect(storage.values.get(STORAGE_LOCATION_KEY)).toBe('indexeddb');
    expect(storage.values.has(KEY)).toBe(false);

    const { store: reopened } = createFakeStore({ backend, storage, storageKey: KEY });
    const second = await reopened.hydrate();
    expect(second.load.persistedState).toEqual(saved);
  });

  it('starts the first write at once, without waiting for a timer', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    store.scheduleSave(workspace('Now'));
    expect(store.isBusy()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(backend.started).toBe(1);
    await store.whenSaved();
    expect(backend.values.get(STORE_KEYS.workspace).data.accounts[0].name).toBe('Now');
    expect(store.isBusy()).toBe(false);
  });

  it('coalesces changes made during an in-flight write into one follow-up write of the latest', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    const onSaved = vi.fn();
    store.setListener({ onSaved });
    const release = backend.hold();
    store.scheduleSave(workspace('One'));
    await vi.waitFor(() => expect(backend.started).toBe(1));
    store.scheduleSave(workspace('Two'));
    store.scheduleSave(workspace('Three'));
    expect(backend.writes).toHaveLength(0);
    release();
    await store.whenSaved();
    expect(backend.writes).toHaveLength(2);
    expect(backend.started).toBe(2);
    expect(onSaved.mock.calls.map(([state]) => state.data.accounts[0].name)).toEqual([
      'One',
      'Three',
    ]);
    expect(backend.values.get(STORE_KEYS.workspace).data.accounts[0].name).toBe('Three');
  });

  it('whenSaved waits for a slow write and rejects when the last save failed', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    const release = backend.hold();
    store.scheduleSave(workspace('Slow'));
    let settled = false;
    const waiting = store.whenSaved().then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release();
    await waiting;
    expect(settled).toBe(true);

    backend.failWrite = () => quotaError();
    store.scheduleSave(workspace('Fails'));
    await expect(store.whenSaved()).rejects.toMatchObject({ name: 'QuotaExceededError' });
    backend.failWrite = null;
    store.scheduleSave(workspace('Fine again'));
    await expect(store.whenSaved()).resolves.toBeUndefined();
  });

  it('reports busy changes only on idle/busy transitions', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    const onBusyChange = vi.fn();
    store.setListener({ onBusyChange });
    const release = backend.hold();
    store.scheduleSave(workspace('A'));
    store.scheduleSave(workspace('B'));
    const restored = store.saveBeforeRestore(workspace('C'));
    expect(store.isBusy()).toBe(true);
    release();
    await restored;
    await store.whenSaved();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reports a failed save and keeps the stored workspace', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    store.scheduleSave(workspace('Kept'));
    await store.whenSaved().catch(() => {});
    const onSaveError = vi.fn();
    store.setListener({ onSaveError });
    backend.failWrite = () => quotaError();
    store.scheduleSave(workspace('Lost'));
    await store.whenSaved().catch(() => {});
    expect(onSaveError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'QuotaExceededError' }),
    );
    expect(backend.values.get(STORE_KEYS.workspace).data.accounts[0].name).toBe('Kept');
  });

  it('refuses to save before hydration', () => {
    const { store } = createFakeStore({ storage: memoryStorage() });
    expect(() => store.scheduleSave(workspace())).toThrow(/before hydration/);
  });

  it('replaces workspace and phone-copy record in one transaction', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    await store.replaceWithPhoneCopy(workspace('From Mac'), RECORD);
    expect(backend.writes).toEqual([
      { put: [STORE_KEYS.workspace, STORE_KEYS.phoneCopy], remove: [] },
    ]);
    expect(backend.values.get(STORE_KEYS.phoneCopy)).toEqual(RECORD);
  });

  it('a quota abort during replace leaves the previous workspace and record untouched', async () => {
    const backend = createFakeBackend({
      [STORE_KEYS.workspace]: workspace('Old Phone'),
      [STORE_KEYS.phoneCopy]: { ...RECORD, source: 'old' },
    });
    const { store } = createFakeStore({ backend, storage: memoryStorage() });
    await store.hydrate();
    const before = structuredClone(Object.fromEntries(backend.values));
    backend.failWrite = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

    const failure = await store.replaceWithPhoneCopy(workspace('Too Big'), RECORD).catch((e) => e);
    expect(failure).toBeInstanceOf(PhoneStorageFullError);
    expect(failure.cause.name).toBe('AbortError');
    expect(Object.fromEntries(backend.values)).toEqual(before);
  });

  it('a pending save is written before the replace, never after it', async () => {
    const { store, backend } = createFakeStore({ storage: memoryStorage() });
    await store.hydrate();
    store.scheduleSave(workspace('Edited'));
    await store.replaceWithPhoneCopy(workspace('From Mac'), RECORD);
    await store.whenSaved();
    expect(backend.writes.map((w) => w.put)).toEqual([
      [STORE_KEYS.workspace],
      [STORE_KEYS.workspace, STORE_KEYS.phoneCopy],
    ]);
    expect(backend.values.get(STORE_KEYS.workspace).data.accounts[0].name).toBe('From Mac');
  });

  it('removes the phone copy together with the cleared workspace', async () => {
    const backend = createFakeBackend({
      [STORE_KEYS.workspace]: workspace('From Mac'),
      [STORE_KEYS.phoneCopy]: RECORD,
    });
    const { store } = createFakeStore({ backend, storage: memoryStorage() });
    expect((await store.hydrate()).phoneCopy).toEqual(RECORD);
    await store.removePhoneCopy(createPersistedAppState());
    expect(backend.writes).toEqual([
      { put: [STORE_KEYS.workspace], remove: [STORE_KEYS.phoneCopy] },
    ]);
    expect(backend.values.has(STORE_KEYS.phoneCopy)).toBe(false);
  });

  it('keeps the before-restore copy in IndexedDB', async () => {
    const storage = memoryStorage();
    const { store, backend } = createFakeStore({ storage, storageKey: KEY });
    await store.hydrate();
    await store.saveBeforeRestore(workspace('Before'));
    expect(backend.values.get(STORE_KEYS.beforeRestore).data.accounts[0].name).toBe('Before');
    expect(storage.values.has(BEFORE_RESTORE)).toBe(false);
  });
});

describe('one-time migration from localStorage', () => {
  it('copies workspace, record and before-restore copy, verifies, then clears localStorage', async () => {
    const old = workspace('Carried Over');
    const storage = memoryStorage({
      [KEY]: JSON.stringify(old),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
      [BEFORE_RESTORE]: JSON.stringify(workspace('Older')),
      'unrelated.key': 'stays',
    });
    const { store, backend } = createFakeStore({ storage, storageKey: KEY });
    const result = await store.hydrate();

    expect(result).toMatchObject({ backend: 'indexeddb', migrated: true, phoneCopy: RECORD });
    expect(result.load.persistedState).toEqual(old);
    expect(backend.writes[0].put.sort()).toEqual(
      [STORE_KEYS.workspace, STORE_KEYS.phoneCopy, STORE_KEYS.beforeRestore].sort(),
    );
    expect(backend.values.get(STORE_KEYS.beforeRestore).data.accounts[0].name).toBe('Older');
    expect(storage.values.has(KEY)).toBe(false);
    expect(storage.values.has(PHONE_COPY_KEY)).toBe(false);
    expect(storage.values.has(BEFORE_RESTORE)).toBe(false);
    expect(storage.values.get('unrelated.key')).toBe('stays');
    expect(storage.values.get(STORAGE_LOCATION_KEY)).toBe('indexeddb');
  });

  it('a failed copy keeps localStorage intact and falls back to it for this session', async () => {
    const raw = JSON.stringify(workspace('Stays Put'));
    const storage = memoryStorage({ [KEY]: raw, [PHONE_COPY_KEY]: JSON.stringify(RECORD) });
    const backend = createFakeBackend();
    backend.failWrite = () => quotaError();
    const { store } = createFakeStore({ backend, storage, storageKey: KEY });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await store.hydrate();
    expect(result.backend).toBe('localStorage');
    expect(result.fallbackReason).toMatch(/IndexedDB could not be used/);
    expect(result.load.persistedState.data.accounts[0].name).toBe('Stays Put');
    expect(result.phoneCopy).toEqual(RECORD);
    expect(storage.values.get(KEY)).toBe(raw);
    expect(storage.values.has(STORAGE_LOCATION_KEY)).toBe(false);
    expect(backend.values.size).toBe(0);

    // Later saves go to localStorage, as before.
    store.scheduleSave(workspace('Saved Locally'));
    await store.whenSaved().catch(() => {});
    expect(JSON.parse(storage.values.get(KEY)).data.accounts[0].name).toBe('Saved Locally');
  });

  it('a copy that does not read back the same is removed again and localStorage is kept', async () => {
    const raw = JSON.stringify(workspace('Verify Me'));
    const storage = memoryStorage({ [KEY]: raw });
    const backend = createFakeBackend();
    backend.readTransform = (key, value) =>
      key === STORE_KEYS.workspace && value ? { ...value, schemaVersion: -1 } : value;
    const { store } = createFakeStore({ backend, storage, storageKey: KEY });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await store.hydrate();
    expect(result.backend).toBe('localStorage');
    expect(storage.values.get(KEY)).toBe(raw);
    expect(backend.values.has(STORE_KEYS.workspace)).toBe(false);
  });

  it('cleans leftover localStorage copies once the marker says IndexedDB holds the data', async () => {
    const backend = createFakeBackend({ [STORE_KEYS.workspace]: workspace('In IDB') });
    const storage = memoryStorage({
      [KEY]: JSON.stringify(workspace('Stale')),
      [STORAGE_LOCATION_KEY]: 'indexeddb',
    });
    const { store } = createFakeStore({ backend, storage, storageKey: KEY });
    const result = await store.hydrate();
    expect(result.load.persistedState.data.accounts[0].name).toBe('In IDB');
    expect(storage.values.has(KEY)).toBe(false);
  });
});

describe('fallback when IndexedDB is unavailable', () => {
  it('uses localStorage when IndexedDB never held the workspace', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify(workspace('Old Browser')),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = createFakeStore({
      storage,
      storageKey: KEY,
      openError: Object.assign(new Error('blocked in private mode'), { name: 'InvalidStateError' }),
    });
    const result = await store.hydrate();
    expect(result.backend).toBe('localStorage');
    expect(result.fallbackReason).toContain('blocked in private mode');
    expect(result.load.persistedState.data.accounts[0].name).toBe('Old Browser');
    expect(result.phoneCopy).toEqual(RECORD);

    // Replace keeps the all-or-nothing localStorage behaviour.
    storage.setItem = (key, value) => {
      if (key === KEY) throw quotaError();
      storage.values.set(key, String(value));
    };
    await expect(store.replaceWithPhoneCopy(workspace('Too Big'), RECORD)).rejects.toBeInstanceOf(
      PhoneStorageFullError,
    );
    expect(JSON.parse(storage.values.get(KEY)).data.accounts[0].name).toBe('Old Browser');
  });

  it('never falls back to an empty copy when IndexedDB holds the workspace but fails to open', async () => {
    const storage = memoryStorage({ [STORAGE_LOCATION_KEY]: 'indexeddb' });
    const { store } = createFakeStore({
      storage,
      storageKey: KEY,
      openError: new Error('IndexedDB did not open in time.'),
    });
    await expect(store.hydrate()).rejects.toBeInstanceOf(WorkspaceStorageUnavailableError);
    expect(() => store.scheduleSave(workspace())).toThrow(/before hydration/);
  });

  it('createBrowserWorkspaceStore returns null without IndexedDB (jsdom)', () => {
    expect(typeof indexedDB).toBe('undefined');
    expect(createBrowserWorkspaceStore(KEY)).toBeNull();
  });
});

describe('browser storage status helpers', () => {
  it('feature-detects persist, persisted and estimate', async () => {
    expect(await requestPersistentStorage(undefined)).toBeNull();
    expect(await readStorageStatus(undefined)).toEqual({
      persisted: null,
      usage: null,
      quota: null,
    });
    expect(await readStorageStatus({ estimate: async () => ({ usage: 5 }) })).toEqual({
      persisted: null,
      usage: 5,
      quota: null,
    });
    const manager = createFakeStorageManager({ grant: true });
    expect(await requestPersistentStorage(manager)).toBe(true);
    expect(await readStorageStatus(manager)).toEqual({
      persisted: true,
      usage: 1_048_576,
      quota: 524_288_000,
    });
    expect(
      await requestPersistentStorage({
        persist: async () => {
          throw new Error('nope');
        },
      }),
    ).toBeNull();
  });

  it('the store asks for persistence only once', async () => {
    const { store, storageManager } = createFakeStore({ storage: memoryStorage() });
    await store.requestPersist();
    await store.requestPersist();
    expect(storageManager.persistCalls).toBe(1);
  });
});

describe('size check', () => {
  it('saves and reloads a synthetic 20,000-transaction workspace through the store', async () => {
    const big = createPersistedAppState({
      ...createInitialAppData(),
      transactions: syntheticTransactions(20_000),
      lastUpdated: 2_000,
    });
    const jsonBytes = new TextEncoder().encode(JSON.stringify(big)).length;
    expect(jsonBytes).toBeGreaterThan(5 * 1024 * 1024); // more than Safari's localStorage cap

    const storage = memoryStorage();
    const { store, backend } = createFakeStore({ storage, storageKey: KEY });
    await store.hydrate();
    await store.replaceWithPhoneCopy(big, RECORD);
    const { store: reopened } = createFakeStore({ backend, storage, storageKey: KEY });
    const reloaded = await reopened.hydrate();
    expect(reloaded.load.persistedState.data.transactions).toHaveLength(20_000);
    expect(reloaded.load.persistedState.data.transactions[19_999].desc).toBe(
      big.data.transactions[19_999].desc,
    );
    expect(reloaded.phoneCopy).toEqual(RECORD);
    expect(storage.values.has(KEY)).toBe(false);
  }, 30_000);
});
