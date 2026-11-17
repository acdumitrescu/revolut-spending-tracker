// Password-protected workspace snapshot (`.ssbsnap`): carries a whole workspace from the Mac app
// to the phone web app as one file (AirDrop). Layout, crypto choices and versioning rules are in
// docs/snapshot-format.md; change the two together.
//
// Pure async functions over bytes. Only WebCrypto (`crypto.subtle`, `crypto.getRandomValues`)
// and `CompressionStream`/`DecompressionStream` are used, so the same code runs in Safari on
// iOS 16.4+, in the Tauri webview and in Node. No storage, no DOM, no network.
import { APP_STATE_SCHEMA_VERSION } from '../../backend/appStateSchema.js';
import { NEWER_SCHEMA_VERSION_MESSAGE, NewerSchemaVersionError } from './migrations.js';
import { validateStoredAppState } from './persistence.js';
import { sanitizePersistedAppState } from './validation.js';

export const SNAPSHOT_FILE_EXTENSION = '.ssbsnap';
export const SNAPSHOT_MIME_TYPE = 'application/octet-stream';

/** "SSBSNAP" followed by a zero byte. */
export const SNAPSHOT_MAGIC = Object.freeze([0x53, 0x53, 0x42, 0x53, 0x4e, 0x41, 0x50, 0x00]);
export const SNAPSHOT_FORMAT_VERSION = 1;

export const FLAG_GZIP = 0x01;
const KNOWN_FLAGS = FLAG_GZIP;

export const KDF_PBKDF2_SHA256 = 1;
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
/** Files below this are refused on read and on create: a weak or tampered header. */
export const MIN_PBKDF2_ITERATIONS = 100_000;
/** Files above this are refused on read so a tampered header cannot freeze the phone. */
export const MAX_PBKDF2_ITERATIONS = 10_000_000;

export const MIN_PASSWORD_LENGTH = 10;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
// magic(8) version(1) flags(1) kdfId(1) iterations(4, big-endian) salt(16) iv(12)
export const SNAPSHOT_HEADER_BYTES = SNAPSHOT_MAGIC.length + 1 + 1 + 1 + 4 + SALT_BYTES + IV_BYTES;

/** Upper bounds that keep a hostile or broken file from exhausting a phone's memory. */
export const MAX_SNAPSHOT_FILE_BYTES = 256 * 1024 * 1024;
export const MAX_SNAPSHOT_JSON_BYTES = 512 * 1024 * 1024;
const MAX_SOURCE_LABEL_LENGTH = 200;

export const SNAPSHOT_ERROR_CODES = Object.freeze({
  NOT_A_SNAPSHOT: 'not-a-snapshot',
  UNSUPPORTED_VERSION: 'unsupported-version',
  INVALID_HEADER: 'invalid-header',
  WRONG_PASSWORD_OR_DAMAGED: 'wrong-password-or-damaged',
  NEWER_APP_VERSION: 'newer-app-version',
  INVALID_CONTENTS: 'invalid-contents',
  PASSWORD_TOO_SHORT: 'password-too-short',
  TOO_LARGE: 'too-large',
  UNAVAILABLE: 'crypto-unavailable',
});

export class SnapshotError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SnapshotError';
    this.code = code;
  }
}

const MESSAGES = {
  'not-a-snapshot': 'This is not a SimpleSafeBanking snapshot file (.ssbsnap).',
  'invalid-header':
    'This snapshot file is incomplete or its header is damaged. Make a new snapshot on the Mac and send it again.',
  'wrong-password-or-damaged':
    'The password is wrong, or the file was damaged or changed on the way. The two cannot be told apart. Check the password; if it is right, make a new snapshot on the Mac and send it again.',
  'invalid-contents':
    'The snapshot opened, but what is inside is not a valid SimpleSafeBanking workspace. Nothing was replaced.',
  'password-too-short': `The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
  'crypto-unavailable':
    'This browser cannot open snapshot files (it lacks the Web Crypto API). Update the browser and try again.',
};

function fail(code, message = MESSAGES[code], options) {
  throw new SnapshotError(code, message, options);
}

function getCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== 'function')
    fail('crypto-unavailable');
  return cryptoApi;
}

export function isCompressionSupported() {
  return (
    typeof globalThis.CompressionStream === 'function' &&
    typeof globalThis.DecompressionStream === 'function'
  );
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  fail('not-a-snapshot');
}

/** Copy into a fresh, exactly-sized ArrayBuffer: WebCrypto in some engines rejects views. */
function exactBuffer(bytes) {
  return bytes.slice().buffer;
}

function normalizePassword(password) {
  // NFC so an "ă" typed on the Mac and on the iPhone keyboard derive the same key.
  return typeof password === 'string' ? password.normalize('NFC') : '';
}

function passwordLength(password) {
  return [...normalizePassword(password)].length;
}

// ---------------------------------------------------------------------------------------------
// Header

function writeHeader({ flags, iterations, salt, iv }) {
  const header = new Uint8Array(SNAPSHOT_HEADER_BYTES);
  const view = new DataView(header.buffer);
  let offset = 0;
  header.set(SNAPSHOT_MAGIC, offset);
  offset += SNAPSHOT_MAGIC.length;
  header[offset++] = SNAPSHOT_FORMAT_VERSION;
  header[offset++] = flags;
  header[offset++] = KDF_PBKDF2_SHA256;
  view.setUint32(offset, iterations, false);
  offset += 4;
  header.set(salt, offset);
  offset += SALT_BYTES;
  header.set(iv, offset);
  return header;
}

function hasMagic(bytes) {
  return (
    bytes.length >= SNAPSHOT_MAGIC.length &&
    SNAPSHOT_MAGIC.every((value, index) => bytes[index] === value)
  );
}

function parseHeader(input) {
  const bytes = toBytes(input);
  if (!hasMagic(bytes)) fail('not-a-snapshot');
  if (bytes.length < SNAPSHOT_MAGIC.length + 1) fail('invalid-header');

  const formatVersion = bytes[SNAPSHOT_MAGIC.length];
  if (formatVersion !== SNAPSHOT_FORMAT_VERSION)
    fail(
      'unsupported-version',
      formatVersion > SNAPSHOT_FORMAT_VERSION
        ? `This snapshot was made by a newer version of SimpleSafeBanking (file format ${formatVersion}; this app reads format ${SNAPSHOT_FORMAT_VERSION}). Update the app on this device and try again.`
        : `This snapshot uses an unknown file format (${formatVersion}).`,
    );
  if (bytes.length < SNAPSHOT_HEADER_BYTES) fail('invalid-header');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = SNAPSHOT_MAGIC.length + 1;
  const flags = bytes[offset++];
  const kdfId = bytes[offset++];
  const iterations = view.getUint32(offset, false);
  offset += 4;
  const salt = bytes.slice(offset, offset + SALT_BYTES);
  offset += SALT_BYTES;
  const iv = bytes.slice(offset, offset + IV_BYTES);

  if (flags & ~KNOWN_FLAGS)
    fail(
      'unsupported-version',
      'This snapshot uses a feature this version of SimpleSafeBanking does not know. Update the app on this device and try again.',
    );
  if (kdfId !== KDF_PBKDF2_SHA256)
    fail(
      'unsupported-version',
      `This snapshot uses an unknown password scheme (${kdfId}). Update the app on this device and try again.`,
    );
  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS)
    fail(
      'invalid-header',
      `This snapshot's password settings are outside the safe range (${iterations} rounds; allowed ${MIN_PBKDF2_ITERATIONS} to ${MAX_PBKDF2_ITERATIONS}). It was not opened.`,
    );

  return {
    bytes,
    header: bytes.subarray(0, SNAPSHOT_HEADER_BYTES),
    ciphertext: bytes.subarray(SNAPSHOT_HEADER_BYTES),
    formatVersion,
    compressed: Boolean(flags & FLAG_GZIP),
    kdf: { id: kdfId, name: 'PBKDF2-HMAC-SHA-256', iterations },
    salt,
    iv,
  };
}

/**
 * Reads only the plain header: format version, compression flag and password-derivation
 * settings. Holds nothing about the workspace. Throws the same SnapshotError codes as
 * readSnapshot for a file that is not a snapshot or that this app cannot open, so a screen can
 * say so before asking for the password.
 */
export function inspectSnapshotHeader(bytes) {
  const parsed = parseHeader(bytes);
  if (parsed.bytes.length > MAX_SNAPSHOT_FILE_BYTES) fail('too-large', tooLargeMessage());
  return {
    formatVersion: parsed.formatVersion,
    compressed: parsed.compressed,
    kdf: { ...parsed.kdf },
    byteLength: parsed.bytes.length,
  };
}

function tooLargeMessage() {
  return `This snapshot is larger than this app accepts (${Math.round(MAX_SNAPSHOT_FILE_BYTES / 1024 / 1024)} MB).`;
}

// ---------------------------------------------------------------------------------------------
// Crypto and compression

async function deriveKey(password, salt, iterations, usage) {
  const { subtle } = getCrypto();
  const baseKey = await subtle.importKey(
    'raw',
    exactBuffer(new TextEncoder().encode(normalizePassword(password))),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: exactBuffer(salt), iterations },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

async function readStream(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      fail('too-large', 'This snapshot unpacks to more data than this app accepts.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function streamOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function gzip(bytes) {
  return readStream(
    streamOf(bytes).pipeThrough(new globalThis.CompressionStream('gzip')),
    Number.MAX_SAFE_INTEGER,
  );
}

async function gunzip(bytes) {
  return readStream(
    streamOf(bytes).pipeThrough(new globalThis.DecompressionStream('gzip')),
    MAX_SNAPSHOT_JSON_BYTES,
  );
}

// ---------------------------------------------------------------------------------------------
// Payload

function firstAndLastDate(transactions) {
  let first = null;
  let last = null;
  for (const transaction of transactions) {
    const date = typeof transaction?.date === 'string' ? transaction.date.slice(0, 10) : '';
    if (!date) continue;
    if (first === null || date < first) first = date;
    if (last === null || date > last) last = date;
  }
  return { firstTransactionDate: first, lastTransactionDate: last };
}

/** Counts shown on the phone's preview screen, computed from a validated persisted state. */
export function summarizeAppState(persistedState) {
  const data = persistedState?.data ?? {};
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const budgets = data.budgets && typeof data.budgets === 'object' ? data.budgets : {};
  const count = (value) => (Array.isArray(value) ? value.length : 0);
  return {
    transactions: transactions.length,
    accounts: count(data.accounts),
    budgetMonths: Object.keys(budgets).length,
    goals: count(data.goals),
    subscriptions: count(data.subscriptions),
    creditRecords: count(data.creditRecords),
    portfolioHoldings: count(data.portfolioHoldings),
    incomes: count(data.moneyFlow?.incomes),
    transfers: count(data.moneyFlow?.transfers),
    carListings: count(data.carListings),
    customVendors: Object.keys(data.customVendors ?? {}).length,
    ...firstAndLastDate(transactions),
    lastUpdatedAt: typeof data.lastUpdated === 'number' ? data.lastUpdated : null,
  };
}

/**
 * The strict import path used for JSON backups (persistence.validateStoredAppState: migrate,
 * schema check, no repair), followed by the usual sanitize. Maps failures to snapshot codes.
 */
function acceptAppState(raw) {
  let result;
  try {
    result = validateStoredAppState(raw);
  } catch (error) {
    if (error instanceof NewerSchemaVersionError)
      fail('newer-app-version', `${NEWER_SCHEMA_VERSION_MESSAGE} Nothing was replaced.`, {
        cause: error,
      });
    fail('invalid-contents', undefined, { cause: error });
  }
  if (!result?.success) fail('invalid-contents', undefined, { cause: result?.error });
  try {
    return sanitizePersistedAppState(result.data);
  } catch (error) {
    fail('invalid-contents', undefined, { cause: error });
  }
}

function toTimestamp(now) {
  const value = now instanceof Date ? now.getTime() : (now ?? Date.now());
  if (!Number.isFinite(value)) throw new TypeError('now must be a Date or a millisecond timestamp');
  return value;
}

// ---------------------------------------------------------------------------------------------
// Public API

/**
 * Low-level sealer: encrypts any JSON-serialisable payload into a snapshot file. Exposed for
 * tests and future formats; app code calls createSnapshot, which validates the workspace first.
 */
export async function sealSnapshotPayload(
  payload,
  password,
  { iterations = DEFAULT_PBKDF2_ITERATIONS, compress = isCompressionSupported() } = {},
) {
  if (passwordLength(password) < MIN_PASSWORD_LENGTH) fail('password-too-short');
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  )
    throw new RangeError(
      `iterations must be an integer from ${MIN_PBKDF2_ITERATIONS} to ${MAX_PBKDF2_ITERATIONS}`,
    );
  if (compress && !isCompressionSupported())
    throw new Error('Compression was requested but CompressionStream is not available');

  const cryptoApi = getCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTES));
  const header = writeHeader({ flags: compress ? FLAG_GZIP : 0, iterations, salt, iv });

  const json = new TextEncoder().encode(JSON.stringify(payload));
  const plaintext = compress ? await gzip(json) : json;
  const key = await deriveKey(password, salt, iterations, 'encrypt');
  const ciphertext = new Uint8Array(
    await cryptoApi.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: exactBuffer(iv),
        additionalData: exactBuffer(header),
        tagLength: 128,
      },
      key,
      exactBuffer(plaintext),
    ),
  );

  const file = new Uint8Array(header.length + ciphertext.length);
  file.set(header, 0);
  file.set(ciphertext, header.length);
  if (file.length > MAX_SNAPSHOT_FILE_BYTES) fail('too-large', tooLargeMessage());
  return file;
}

/**
 * Low-level opener: checks the header, derives the key and decrypts. Returns the parsed JSON
 * payload without judging it.
 */
export async function openSnapshotPayload(bytes, password) {
  const parsed = parseHeader(bytes);
  if (parsed.bytes.length > MAX_SNAPSHOT_FILE_BYTES) fail('too-large', tooLargeMessage());
  if (parsed.compressed && !isCompressionSupported())
    fail(
      'unsupported-version',
      'This snapshot is compressed and this browser cannot unpack it. Update the browser (Safari 16.4 or later) and try again.',
    );
  // Nothing to try: an empty password never made a snapshot, and a body shorter than the
  // authentication tag cannot be genuine.
  if (!normalizePassword(password) || parsed.ciphertext.length < GCM_TAG_BYTES)
    fail('wrong-password-or-damaged');

  const key = await deriveKey(password, parsed.salt, parsed.kdf.iterations, 'decrypt');
  let plaintext;
  try {
    plaintext = new Uint8Array(
      await getCrypto().subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: exactBuffer(parsed.iv),
          additionalData: exactBuffer(parsed.header),
          tagLength: 128,
        },
        key,
        exactBuffer(parsed.ciphertext),
      ),
    );
  } catch (error) {
    fail('wrong-password-or-damaged', undefined, { cause: error });
  }

  let json;
  try {
    json = parsed.compressed ? await gunzip(plaintext) : plaintext;
  } catch (error) {
    if (error instanceof SnapshotError) throw error;
    fail('invalid-contents', undefined, { cause: error });
  }
  if (json.length > MAX_SNAPSHOT_JSON_BYTES)
    fail('too-large', 'This snapshot unpacks to more data than this app accepts.');
  try {
    return {
      payload: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json)),
      header: {
        formatVersion: parsed.formatVersion,
        compressed: parsed.compressed,
        kdf: { ...parsed.kdf },
      },
      jsonByteLength: json.length,
    };
  } catch (error) {
    fail('invalid-contents', undefined, { cause: error });
  }
}

/**
 * Builds a `.ssbsnap` file from a persisted workspace `{ schemaVersion, exportedAt, data }` (the
 * same object the JSON backup writes). The workspace is validated and brought to the current
 * schema first, so a file is never written that restore would refuse.
 *
 * @returns {Promise<Uint8Array>} the file bytes; wrap in a Blob to save.
 */
export async function createSnapshot({
  appState,
  password,
  now,
  source = null,
  iterations,
  compress,
} = {}) {
  if (passwordLength(password) < MIN_PASSWORD_LENGTH) fail('password-too-short');
  const createdAtMs = toTimestamp(now);
  const accepted = acceptAppState(appState);
  const persistedState = { ...accepted, exportedAt: createdAtMs };
  const meta = {
    kind: 'ssb-snapshot',
    createdAt: new Date(createdAtMs).toISOString(),
    source:
      typeof source === 'string' && source.trim()
        ? source.trim().slice(0, MAX_SOURCE_LABEL_LENGTH)
        : null,
    schemaVersion: persistedState.schemaVersion,
    summary: summarizeAppState(persistedState),
  };
  return sealSnapshotPayload({ meta, appState: persistedState }, password, {
    iterations,
    compress,
  });
}

/**
 * Opens a `.ssbsnap` file. Returns `{ appState, meta }`: `appState` is ready for the same restore
 * path as a JSON backup; `meta` is for the preview screen. Throws SnapshotError (see
 * SNAPSHOT_ERROR_CODES) and never returns a partial result.
 */
export async function readSnapshot(bytes, password) {
  const { payload, header, jsonByteLength } = await openSnapshotPayload(bytes, password);
  const storedMeta = payload?.meta;
  if (
    !payload ||
    typeof payload !== 'object' ||
    !storedMeta ||
    typeof storedMeta !== 'object' ||
    storedMeta.kind !== 'ssb-snapshot' ||
    typeof storedMeta.createdAt !== 'string' ||
    !('appState' in payload)
  )
    fail('invalid-contents');

  const appState = acceptAppState(payload.appState);
  return {
    appState,
    meta: {
      createdAt: storedMeta.createdAt,
      source: typeof storedMeta.source === 'string' ? storedMeta.source : null,
      // The version the Mac wrote, and the version after this app's migrations.
      writtenSchemaVersion: Number.isSafeInteger(storedMeta.schemaVersion)
        ? storedMeta.schemaVersion
        : null,
      schemaVersion: appState.schemaVersion ?? APP_STATE_SCHEMA_VERSION,
      // Recomputed from what will actually be restored, not trusted from the file.
      summary: summarizeAppState(appState),
      formatVersion: header.formatVersion,
      compressed: header.compressed,
      kdf: header.kdf,
      jsonByteLength,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Passphrase helper

/** Lowercase letters without i, l and o (easily confused with 1, I and 0). 23 symbols. */
export const PASSPHRASE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz';

/**
 * A random passphrase like `kdwq-mzfa-hpte-xrbn-cayu`: groups of lowercase letters only, so it
 * types without switching keyboards on an iPhone. Default 5 x 4 letters = log2(23) * 20 ≈ 90
 * bits. Uniform: rejection sampling over crypto.getRandomValues.
 */
export function generatePassphrase({ groups = 5, groupLength = 4, separator = '-' } = {}) {
  if (
    !Number.isSafeInteger(groups) ||
    groups < 1 ||
    !Number.isSafeInteger(groupLength) ||
    groupLength < 1
  )
    throw new RangeError('groups and groupLength must be positive integers');
  const cryptoApi = getCrypto();
  const size = PASSPHRASE_ALPHABET.length;
  const limit = 256 - (256 % size);
  const needed = groups * groupLength;
  const letters = [];
  while (letters.length < needed) {
    const random = cryptoApi.getRandomValues(new Uint8Array(needed * 2));
    for (const value of random) {
      if (value >= limit) continue;
      letters.push(PASSPHRASE_ALPHABET[value % size]);
      if (letters.length === needed) break;
    }
  }
  const parts = [];
  for (let index = 0; index < groups; index += 1)
    parts.push(letters.slice(index * groupLength, (index + 1) * groupLength).join(''));
  const passphrase = parts.join(separator);
  if (passwordLength(passphrase) < MIN_PASSWORD_LENGTH)
    throw new RangeError(`A passphrase must be at least ${MIN_PASSWORD_LENGTH} characters`);
  return passphrase;
}
