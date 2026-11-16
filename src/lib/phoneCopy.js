// The phone's read-only copy of a Mac workspace (plan 04, task 3.3/3.4, decision D2).
//
// `ssb.phoneCopy` is a tiny record kept next to the workspace in localStorage:
// `{ syncedAt, fileCreatedAt, source }`. While it exists the workspace is read-only on this
// device (AppContext enforces that). It is written only after a replace has succeeded and it holds
// no financial data.

export const PHONE_COPY_KEY = 'ssb.phoneCopy';

export const READ_ONLY_MESSAGE =
  'This is a read-only copy from the Mac. Change it on the Mac, then use Receive from Mac to refresh this phone.';

export const STORAGE_FULL_MESSAGE =
  "This workspace is too large for this phone's storage in the current version. Nothing was replaced.";

export class PhoneStorageFullError extends Error {
  constructor(options) {
    super(STORAGE_FULL_MESSAGE, options);
    this.name = 'PhoneStorageFullError';
  }
}

function isTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** The stored record, or null when there is none (or it is unreadable: then the app stays editable). */
export function loadPhoneCopy(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PHONE_COPY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !isTimestamp(parsed.syncedAt)) return null;
    return {
      syncedAt: parsed.syncedAt,
      fileCreatedAt: isTimestamp(parsed.fileCreatedAt) ? parsed.fileCreatedAt : null,
      source: typeof parsed.source === 'string' ? parsed.source : null,
    };
  } catch {
    return null;
  }
}

export function clearPhoneCopyRecord(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(PHONE_COPY_KEY);
  } catch {
    // Nothing more to do: the caller resets in-memory state regardless.
  }
}

function restore(storage, key, previousRaw) {
  try {
    if (previousRaw === null) storage.removeItem(key);
    else storage.setItem(key, previousRaw);
  } catch {
    // The failed write did not change the stored value; there is nothing left to put back.
  }
}

/**
 * All-or-nothing save of a replacement workspace plus the phone-copy record. If either write
 * fails (typically the localStorage quota) the previous values are put back and
 * PhoneStorageFullError is thrown, so the old phone data stays intact. The record is written
 * last, after the workspace is safely stored.
 */
export function commitPhoneCopy({
  storage = globalThis.localStorage,
  storageKey,
  persistedState,
  record,
}) {
  const previousWorkspace = storage.getItem(storageKey);
  const previousRecord = storage.getItem(PHONE_COPY_KEY);
  try {
    storage.setItem(storageKey, JSON.stringify(persistedState));
    storage.setItem(PHONE_COPY_KEY, JSON.stringify(record));
  } catch (error) {
    restore(storage, storageKey, previousWorkspace);
    restore(storage, PHONE_COPY_KEY, previousRecord);
    throw new PhoneStorageFullError({ cause: error });
  }
}

const DAY_MS = 86_400_000;

function startOfDay(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago". */
export function formatRelativeDate(timestamp, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function formatShortDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function phoneCopyBannerText(record, now = Date.now()) {
  return `Copy from Mac, synced ${formatRelativeDate(record.syncedAt, now)} (${formatShortDate(record.syncedAt)}). Read-only on this phone.`;
}
