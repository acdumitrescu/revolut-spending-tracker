// In-memory stand-in for the IndexedDB backend of workspaceStore.js ({ read, write }, one
// transaction each). Values are structured-cloned on the way in and out, like IndexedDB, and a
// write either applies completely or not at all. Synthetic data only.
import { createWorkspaceStore } from '../../lib/workspaceStore';

export function quotaError() {
  return Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
}

export function createFakeBackend(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]));
  const backend = {
    kind: 'indexeddb',
    values,
    reads: 0,
    writes: [],
    /** When set, (request) => Error|null decides whether a write transaction aborts. */
    failWrite: null,
    /** When set, (key, value) => value changes what a read returns (to simulate a bad read-back). */
    readTransform: null,
    /** Writes started while held wait until release() (a slow device). */
    gate: null,
    started: 0,
    hold() {
      let release;
      backend.gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        backend.gate = null;
        release();
      };
    },
    async read(keys) {
      backend.reads += 1;
      await Promise.resolve();
      return Object.fromEntries(
        keys.map((key) => {
          const value = values.has(key) ? structuredClone(values.get(key)) : undefined;
          return [key, backend.readTransform ? backend.readTransform(key, value) : value];
        }),
      );
    },
    async write({ put = {}, remove = [] }) {
      backend.started += 1;
      await Promise.resolve();
      if (backend.gate) await backend.gate;
      const request = { put: Object.keys(put), remove: [...remove] };
      const failure = backend.failWrite?.(request);
      if (failure) throw failure; // aborted: nothing applied
      const cloned = Object.entries(put).map(([key, value]) => [key, structuredClone(value)]);
      for (const [key, value] of cloned) values.set(key, value);
      for (const key of remove) values.delete(key);
      backend.writes.push(request);
    },
    close() {},
  };
  return backend;
}

export function createFakeStorageManager({
  persisted = false,
  grant = true,
  usage = 1_048_576,
  quota = 524_288_000,
} = {}) {
  const manager = {
    persistCalls: 0,
    async persist() {
      manager.persistCalls += 1;
      if (grant) persisted = true;
      return grant;
    },
    async persisted() {
      return persisted;
    },
    async estimate() {
      return { usage, quota };
    },
  };
  return manager;
}

/** A client-only store over the fake backend (or a failing open, when `openError` is given). */
export function createFakeStore({
  backend = createFakeBackend(),
  openError = null,
  storage = globalThis.localStorage,
  storageKey = 'simple_safe_banking_state_v1',
  storageManager = createFakeStorageManager(),
} = {}) {
  const store = createWorkspaceStore({
    openBackend: async () => {
      if (openError) throw openError;
      return backend;
    },
    storage,
    storageKey,
    storageManager,
  });
  return { store, backend, storageManager };
}
