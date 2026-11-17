// Client-only workspace storage on this device (plan 04, tasks 2.1 and 2.2).
//
// Layout: one IndexedDB database (`simple-safe-banking`), one object store (`workspace`), out-of-line
// keys. The values are structured-clone objects, not JSON strings: no multi-MB JSON.stringify on
// every save and no JSON.parse at start, and the browser's IndexedDB quota is far larger than the
// ~5 MB localStorage cap in Safari.
//   workspace               the persisted app state ({ schemaVersion, exportedAt, data })
//   phoneCopy               the phone-copy record (phoneCopy.js), written with the workspace
//   workspaceBeforeRestore  the copy kept before a backup restore (importBackup)
//
// Only the client-only profile uses this; private-sync, encrypted storage and the desktop app keep
// their own paths. Small preferences live inside the workspace already, so nothing else moves.
//
// The IndexedDB code is kept thin behind a two-method backend ({ read, write }, one transaction
// each), so tests use an in-memory backend with the same contract.
import { loadLocalAppState, loadStoredAppState, saveLocalAppState } from './persistence';
import {
  clearPhoneCopyRecord,
  commitPhoneCopy,
  loadPhoneCopy,
  parsePhoneCopyRecord,
  PHONE_COPY_KEY,
  PhoneStorageFullError,
} from './phoneCopy';

export const WORKSPACE_DB_NAME = 'simple-safe-banking';
export const WORKSPACE_DB_VERSION = 1;
export const WORKSPACE_OBJECT_STORE = 'workspace';
export const STORE_KEYS = Object.freeze({
  workspace: 'workspace',
  phoneCopy: 'phoneCopy',
  beforeRestore: 'workspaceBeforeRestore',
});
/** Tiny localStorage marker set once the workspace lives in IndexedDB (see hydrate). */
export const STORAGE_LOCATION_KEY = 'ssb.workspaceStore';
const OPEN_TIMEOUT_MS = 8000;

export const STORAGE_UNAVAILABLE_MESSAGE =
  'The workspace on this device could not be opened. Nothing was changed. Close the app completely, open it again, and retry.';

export const SAVE_FAILED_MESSAGE =
  'The change could not be saved on this device (its storage may be full). It is only in this window: export a backup before closing the app.';

/** A change is in memory but could not be stored on this device. */
export class WorkspaceSaveError extends Error {
  constructor(options) {
    super(SAVE_FAILED_MESSAGE, options);
    this.name = 'WorkspaceSaveError';
  }
}

/** IndexedDB holds the workspace but cannot be opened now: never fall back to an empty copy. */
export class WorkspaceStorageUnavailableError extends Error {
  constructor(options) {
    super(STORAGE_UNAVAILABLE_MESSAGE, options);
    this.name = 'WorkspaceStorageUnavailableError';
  }
}

function settle(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * The real IndexedDB backend. read(keys) and write({ put, remove }) each run in ONE transaction and
 * settle only when it completes or aborts, so a write is all-or-nothing (a quota error aborts the
 * whole transaction and leaves every key as it was).
 */
export async function openIndexedDbBackend(
  factory = globalThis.indexedDB,
  timeoutMs = OPEN_TIMEOUT_MS,
) {
  if (!factory?.open) throw new Error('IndexedDB is not available in this browser.');
  const request = factory.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(WORKSPACE_OBJECT_STORE))
      db.createObjectStore(WORKSPACE_OBJECT_STORE);
  };
  let timer;
  const db = await Promise.race([
    settle(request),
    new Promise((_, reject) => {
      request.onblocked = () => reject(new Error('IndexedDB is blocked by another open tab.'));
      timer = setTimeout(() => reject(new Error('IndexedDB did not open in time.')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  db.onversionchange = () => db.close();

  function transact(mode, run) {
    return new Promise((resolve, reject) => {
      let finish;
      try {
        const tx = db.transaction(WORKSPACE_OBJECT_STORE, mode);
        tx.oncomplete = () => resolve(finish());
        tx.onabort = () =>
          reject(
            tx.error || Object.assign(new Error('Transaction aborted'), { name: 'AbortError' }),
          );
        try {
          finish = run(tx.objectStore(WORKSPACE_OBJECT_STORE));
        } catch (error) {
          tx.onabort = null;
          tx.abort();
          throw error;
        }
      } catch (error) {
        reject(error); // e.g. DataCloneError, or the database was closed
      }
    });
  }

  return {
    kind: 'indexeddb',
    read(keys) {
      return transact('readonly', (store) => {
        const requests = keys.map((key) => [key, store.get(key)]);
        return () => Object.fromEntries(requests.map(([key, req]) => [key, req.result]));
      });
    },
    write({ put = {}, remove = [] }) {
      return transact('readwrite', (store) => {
        for (const [key, value] of Object.entries(put)) store.put(value, key);
        for (const key of remove) store.delete(key);
        return () => undefined;
      });
    },
    close() {
      db.close();
    },
  };
}

function describeError(error) {
  return error?.message || String(error);
}

function readLegacyValues(storage, storageKey) {
  // Only values that parse are carried over; anything unreadable stays where it is.
  const sources = {
    [STORE_KEYS.workspace]: storageKey,
    [STORE_KEYS.phoneCopy]: PHONE_COPY_KEY,
    [STORE_KEYS.beforeRestore]: `${storageKey}_before_restore`,
  };
  const values = {};
  const legacyKeys = [];
  for (const [storeKey, lsKey] of Object.entries(sources)) {
    try {
      const raw = storage.getItem(lsKey);
      if (!raw) continue;
      values[storeKey] = JSON.parse(raw);
      legacyKeys.push(lsKey);
    } catch {
      // keep it in localStorage
    }
  }
  return { values, legacyKeys };
}

/**
 * The client-only workspace store. hydrate() decides where the data lives (IndexedDB, or the
 * localStorage fallback) and returns it; later calls go to the same place.
 * - Saves start at once when no write is running. Changes that arrive while a write is running
 *   are coalesced: only the latest state is written, right after the current write. All writes
 *   (saves, replace, remove, before-restore) run one at a time, in order.
 * - whenSaved() resolves once every write queued so far is stored, or rejects with the error of
 *   the last failed save; isBusy()/onBusyChange tell whether anything is still unwritten.
 * - replaceWithPhoneCopy() writes workspace + record together (one transaction) or throws
 *   PhoneStorageFullError with the previous values intact.
 */
export function createWorkspaceStore({
  openBackend,
  storage = globalThis.localStorage,
  storageKey,
  storageManager = globalThis.navigator?.storage,
}) {
  let backend = null;
  let mode = null; // 'indexeddb' | 'localStorage'
  let fallbackReason = '';
  let hydrating = null;
  let pending = null; // latest state not yet handed to a write
  let saveQueued = false; // a save step is waiting in the queue and will take `pending`
  let lastSaveError = null; // error of the most recent save step, cleared by a successful one
  let active = 0; // queued + running writes
  let chain = Promise.resolve();
  let listener = {};
  let persistAsked = false;

  function setActive(delta) {
    const wasBusy = active > 0;
    active += delta;
    if (wasBusy !== active > 0) listener.onBusyChange?.(active > 0);
  }

  function enqueue(task) {
    setActive(1);
    const run = chain.then(task);
    chain = run.catch(() => {}).finally(() => setActive(-1));
    return run;
  }

  function markIndexedDb() {
    try {
      if (storage.getItem(STORAGE_LOCATION_KEY) !== 'indexeddb')
        storage.setItem(STORAGE_LOCATION_KEY, 'indexeddb');
    } catch {
      // localStorage full or blocked; the marker only guards against a silent empty fallback
    }
  }

  function removeLegacy(keys) {
    for (const key of keys) {
      try {
        storage.removeItem(key);
      } catch {
        // already gone
      }
    }
  }

  function switchToLocalStorage(reason) {
    backend = null;
    mode = 'localStorage';
    fallbackReason = reason;
    return {
      backend: mode,
      fallbackReason,
      migrated: false,
      load: loadLocalAppState(storageKey, storage),
      phoneCopy: loadPhoneCopy(storage),
    };
  }

  function fallBack(error) {
    let marker = null;
    try {
      marker = storage.getItem(STORAGE_LOCATION_KEY);
    } catch {
      // treat as unset
    }
    if (marker === 'indexeddb') throw new WorkspaceStorageUnavailableError({ cause: error });
    console.warn('IndexedDB unavailable, using localStorage:', describeError(error));
    return switchToLocalStorage(`IndexedDB could not be used (${describeError(error)}).`);
  }

  /** One-time carry-over: copy, read back and compare, then clear the localStorage copies. */
  async function migrate(opened) {
    const { values, legacyKeys } = readLegacyValues(storage, storageKey);
    if (!legacyKeys.length) return false;
    const keys = Object.keys(values);
    await opened.write({ put: values });
    const readBack = await opened.read(keys);
    const same = keys.every((key) => JSON.stringify(readBack[key]) === JSON.stringify(values[key]));
    if (!same) {
      await opened.write({ remove: keys }).catch(() => {});
      throw new Error('The copied workspace did not read back the same.');
    }
    markIndexedDb();
    removeLegacy(legacyKeys);
    markIndexedDb(); // in case localStorage was too full to take the marker before
    return true;
  }

  async function doHydrate() {
    let opened;
    try {
      opened = await openBackend();
    } catch (error) {
      return fallBack(error);
    }
    try {
      let stored = await opened.read([STORE_KEYS.workspace, STORE_KEYS.phoneCopy]);
      let migrated = false;
      if (
        stored[STORE_KEYS.workspace] === undefined &&
        stored[STORE_KEYS.phoneCopy] === undefined
      ) {
        migrated = await migrate(opened);
        if (migrated) stored = await opened.read([STORE_KEYS.workspace, STORE_KEYS.phoneCopy]);
      } else {
        let marker = null;
        try {
          marker = storage.getItem(STORAGE_LOCATION_KEY);
        } catch {
          // unset
        }
        // Leftovers from a verified migration whose clean-up was interrupted.
        if (marker === 'indexeddb')
          removeLegacy([storageKey, PHONE_COPY_KEY, `${storageKey}_before_restore`]);
      }
      backend = opened;
      mode = 'indexeddb';
      fallbackReason = '';
      return {
        backend: mode,
        fallbackReason,
        migrated,
        load: loadStoredAppState(stored[STORE_KEYS.workspace]),
        phoneCopy: parsePhoneCopyRecord(stored[STORE_KEYS.phoneCopy]),
      };
    } catch (error) {
      opened.close?.();
      return fallBack(error);
    }
  }

  async function writeWorkspace(state) {
    if (mode === 'indexeddb') {
      await backend.write({ put: { [STORE_KEYS.workspace]: state } });
      markIndexedDb();
    } else saveLocalAppState(storageKey, state, storage);
  }

  async function saveStep() {
    saveQueued = false;
    const state = pending;
    pending = null;
    if (!state) return;
    try {
      await writeWorkspace(state);
      lastSaveError = null;
    } catch (error) {
      lastSaveError = error;
      listener.onSaveError?.(error);
      return;
    }
    listener.onSaved?.(state);
  }

  /** Resolves when everything queued so far is written; rejects if the last save failed. */
  async function whenSaved() {
    let seen;
    do {
      seen = chain;
      await seen;
    } while (seen !== chain);
    if (lastSaveError) throw lastSaveError;
  }

  return {
    get mode() {
      return mode;
    },
    get fallbackReason() {
      return fallbackReason;
    },
    storageManager,
    setListener(next) {
      listener = next || {};
    },
    /** Loads the workspace once; concurrent calls share the same promise. Rejects only with WorkspaceStorageUnavailableError. */
    hydrate() {
      if (!hydrating)
        hydrating = doHydrate().catch((error) => {
          hydrating = null; // allow a retry
          throw error;
        });
      return hydrating;
    },
    scheduleSave(state) {
      if (!mode) throw new Error('Workspace store used before hydration.');
      pending = state;
      if (!saveQueued) {
        saveQueued = true;
        enqueue(saveStep);
      }
    },
    whenSaved,
    isBusy: () => active > 0,
    async replaceWithPhoneCopy(state, record) {
      return enqueue(async () => {
        if (mode === 'indexeddb') {
          try {
            await backend.write({
              put: { [STORE_KEYS.workspace]: state, [STORE_KEYS.phoneCopy]: record },
            });
          } catch (error) {
            throw new PhoneStorageFullError({ cause: error });
          }
          markIndexedDb();
        } else commitPhoneCopy({ storage, storageKey, persistedState: state, record });
      });
    },
    async removePhoneCopy(state) {
      return enqueue(async () => {
        if (mode === 'indexeddb') {
          await backend.write({
            put: { [STORE_KEYS.workspace]: state },
            remove: [STORE_KEYS.phoneCopy],
          });
        } else {
          saveLocalAppState(storageKey, state, storage);
          clearPhoneCopyRecord(storage);
        }
      });
    },
    saveBeforeRestore(state) {
      return enqueue(async () => {
        if (mode === 'indexeddb')
          await backend.write({ put: { [STORE_KEYS.beforeRestore]: state } });
        else saveLocalAppState(`${storageKey}_before_restore`, state, storage);
      });
    },
    /** Asks once per store for persistent storage. Resolves true/false, or null when unsupported. */
    async requestPersist() {
      if (persistAsked) return null;
      persistAsked = true;
      return requestPersistentStorage(storageManager);
    },
  };
}

/** The store for this browser, or null when IndexedDB does not exist at all (then AppContext keeps
 * its synchronous localStorage path). */
export function createBrowserWorkspaceStore(storageKey) {
  const factory = typeof indexedDB === 'undefined' ? null : indexedDB;
  if (!factory) return null;
  return createWorkspaceStore({
    openBackend: () => openIndexedDbBackend(factory),
    storageKey,
  });
}

export async function requestPersistentStorage(storageManager = globalThis.navigator?.storage) {
  if (typeof storageManager?.persist !== 'function') return null;
  try {
    return Boolean(await storageManager.persist());
  } catch {
    return null;
  }
}

/** { persisted: boolean|null, usage: number|null, quota: number|null }; null = not reported. */
export async function readStorageStatus(storageManager = globalThis.navigator?.storage) {
  const status = { persisted: null, usage: null, quota: null };
  try {
    if (typeof storageManager?.persisted === 'function')
      status.persisted = Boolean(await storageManager.persisted());
  } catch {
    // not reported
  }
  try {
    if (typeof storageManager?.estimate === 'function') {
      const estimate = await storageManager.estimate();
      if (Number.isFinite(estimate?.usage)) status.usage = estimate.usage;
      if (Number.isFinite(estimate?.quota)) status.quota = estimate.quota;
    }
  } catch {
    // not reported
  }
  return status;
}
