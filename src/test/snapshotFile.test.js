// @vitest-environment node
// The `.ssbsnap` handoff file (docs/snapshot-format.md). Synthetic data only. Tests use the
// lowest accepted PBKDF2 round count to stay fast; one test checks that the default is the real
// value by reading the header.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseImportedAppState } from '../lib/persistence';
import { NEWER_SCHEMA_VERSION_MESSAGE } from '../lib/migrations';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  FLAG_GZIP,
  MIN_PASSWORD_LENGTH,
  MIN_PBKDF2_ITERATIONS,
  MAX_PBKDF2_ITERATIONS,
  PASSPHRASE_ALPHABET,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_HEADER_BYTES,
  SnapshotError,
  createSnapshot,
  generatePassphrase,
  inspectSnapshotHeader,
  readSnapshot,
  sealSnapshotPayload,
} from '../lib/snapshotFile';
import currentV1 from './fixtures/synthetic-workspace-v1.json';

const PASSWORD = 'correct-horse-battery';
const FAST = MIN_PBKDF2_ITERATIONS;
const NOW = Date.UTC(2026, 10, 16, 9, 30, 0);
const FLAGS_OFFSET = 9;
const ITERATIONS_OFFSET = 11;

function make(options = {}) {
  return createSnapshot({
    appState: structuredClone(currentV1),
    password: PASSWORD,
    now: NOW,
    source: 'Synthetic Mac',
    iterations: FAST,
    ...options,
  });
}

async function expectCode(promiseOrFn, code) {
  let caught;
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SnapshotError);
  expect(caught.code).toBe(code);
  expect(caught.message.length).toBeGreaterThan(20);
  return caught;
}

function withIterations(bytes, iterations) {
  const copy = bytes.slice();
  new DataView(copy.buffer).setUint32(ITERATIONS_OFFSET, iterations, false);
  return copy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('snapshot round trip', () => {
  it('restores exactly what a JSON backup restore would, with matching meta', async () => {
    const file = await make();
    const { appState, meta } = await readSnapshot(file, PASSWORD);

    const viaJsonBackup = parseImportedAppState(JSON.stringify({ ...currentV1, exportedAt: NOW }));
    expect(appState).toEqual(viaJsonBackup);

    expect(meta).toMatchObject({
      createdAt: '2026-11-16T09:30:00.000Z',
      source: 'Synthetic Mac',
      schemaVersion: 1,
      writtenSchemaVersion: 1,
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      compressed: true,
      kdf: { id: 1, iterations: FAST },
    });
    expect(meta.summary).toEqual({
      transactions: 4,
      accounts: 3,
      budgetMonths: 1,
      goals: currentV1.data.goals.length,
      subscriptions: currentV1.data.subscriptions.length,
      creditRecords: currentV1.data.creditRecords.length,
      portfolioHoldings: currentV1.data.portfolioHoldings.length,
      incomes: 0,
      transfers: 0,
      carListings: 1,
      customVendors: Object.keys(currentV1.data.customVendors).length,
      firstTransactionDate: '2026-02-03',
      lastTransactionDate: '2026-03-01',
      lastUpdatedAt: currentV1.data.lastUpdated,
    });
  });

  it('upgrades a legacy (unversioned) workspace before writing it', async () => {
    const file = await make({ appState: structuredClone(currentV1.data) });
    const { appState, meta } = await readSnapshot(file, PASSWORD);
    expect(appState.schemaVersion).toBe(1);
    expect(meta.writtenSchemaVersion).toBe(1);
    expect(appState.data.transactions).toHaveLength(4);
  });

  it('keeps everything about the workspace inside the encryption', async () => {
    const file = await make();
    const text = new TextDecoder('latin1').decode(file);
    for (const secret of ['ssb-snapshot', 'Synthetic', 'transactions', '2026-02-03', 'createdAt'])
      expect(text).not.toContain(secret);
    expect(inspectSnapshotHeader(file)).toEqual({
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      compressed: true,
      kdf: { id: 1, name: 'PBKDF2-HMAC-SHA-256', iterations: FAST },
      byteLength: file.length,
    });
  });

  it('uses a fresh salt and IV for every file', async () => {
    const [first, second] = [await make(), await make()];
    expect(first.subarray(15, SNAPSHOT_HEADER_BYTES)).not.toEqual(
      second.subarray(15, SNAPSHOT_HEADER_BYTES),
    );
  });

  it('defaults to the real PBKDF2 round count', async () => {
    expect(DEFAULT_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const file = await createSnapshot({
      appState: structuredClone(currentV1),
      password: PASSWORD,
      now: NOW,
    });
    expect(inspectSnapshotHeader(file).kdf.iterations).toBe(DEFAULT_PBKDF2_ITERATIONS);
  });

  it('accepts a password typed in another Unicode normal form', async () => {
    const composed = 'parolă-sigură-1';
    const file = await make({ password: composed });
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);
    await expect(readSnapshot(file, decomposed)).resolves.toHaveProperty('appState');
  });
});

describe('compression fallback', () => {
  it('writes an uncompressed file with the flag cleared when asked', async () => {
    const file = await make({ compress: false });
    expect(file[FLAGS_OFFSET] & FLAG_GZIP).toBe(0);
    const { meta } = await readSnapshot(file, PASSWORD);
    expect(meta.compressed).toBe(false);
  });

  it('falls back to uncompressed where CompressionStream is missing, and says so on read', async () => {
    const compressed = await make();
    vi.stubGlobal('CompressionStream', undefined);
    vi.stubGlobal('DecompressionStream', undefined);

    const plain = await make();
    expect(inspectSnapshotHeader(plain).compressed).toBe(false);
    await expect(readSnapshot(plain, PASSWORD)).resolves.toHaveProperty('appState');
    await expectCode(readSnapshot(compressed, PASSWORD), 'unsupported-version');
  });
});

describe('refusals', () => {
  it('refuses a wrong password', async () => {
    const error = await expectCode(
      readSnapshot(await make(), 'wrong-password-123'),
      'wrong-password-or-damaged',
    );
    expect(error.message).toMatch(/cannot be told apart/);
    await expectCode(readSnapshot(await make(), ''), 'wrong-password-or-damaged');
  });

  it('refuses a flipped byte in the ciphertext', async () => {
    const file = await make();
    file[file.length - 40] ^= 0x01;
    await expectCode(readSnapshot(file, PASSWORD), 'wrong-password-or-damaged');
  });

  it('refuses a changed header byte through the GCM additional data', async () => {
    // The flags byte does not feed the key, so only the AAD check can catch this change.
    const file = await make();
    file[FLAGS_OFFSET] ^= FLAG_GZIP;
    expect(inspectSnapshotHeader(file).compressed).toBe(false);
    await expectCode(readSnapshot(file, PASSWORD), 'wrong-password-or-damaged');
  });

  it('refuses truncated files', async () => {
    const file = await make();
    await expectCode(
      readSnapshot(file.slice(0, file.length - 1), PASSWORD),
      'wrong-password-or-damaged',
    );
    await expectCode(
      readSnapshot(file.slice(0, SNAPSHOT_HEADER_BYTES + 5), PASSWORD),
      'wrong-password-or-damaged',
    );
    await expectCode(readSnapshot(file.slice(0, 20), PASSWORD), 'invalid-header');
    await expectCode(readSnapshot(file.slice(0, 4), PASSWORD), 'not-a-snapshot');
  });

  it('refuses a file without the magic bytes', async () => {
    const file = await make();
    file[0] = 0x00;
    await expectCode(() => inspectSnapshotHeader(file), 'not-a-snapshot');
    const jsonBackup = new TextEncoder().encode(JSON.stringify(currentV1));
    await expectCode(readSnapshot(jsonBackup, PASSWORD), 'not-a-snapshot');
    await expectCode(readSnapshot(new Uint8Array(0), PASSWORD), 'not-a-snapshot');
  });

  it('refuses an unsupported format version, flag or KDF', async () => {
    const newer = await make();
    newer[8] = SNAPSHOT_FORMAT_VERSION + 1;
    const error = await expectCode(() => inspectSnapshotHeader(newer), 'unsupported-version');
    expect(error.message).toMatch(/newer version/);

    const unknownFlag = await make();
    unknownFlag[FLAGS_OFFSET] |= 0x80;
    await expectCode(readSnapshot(unknownFlag, PASSWORD), 'unsupported-version');

    const unknownKdf = await make();
    unknownKdf[10] = 9;
    await expectCode(readSnapshot(unknownKdf, PASSWORD), 'unsupported-version');
  });

  it('refuses out-of-range iteration counts before deriving anything', async () => {
    const file = await make();
    const deriveSpy = vi.spyOn(globalThis.crypto.subtle, 'deriveKey');
    for (const iterations of [
      0,
      1000,
      MIN_PBKDF2_ITERATIONS - 1,
      MAX_PBKDF2_ITERATIONS + 1,
      0xffffffff,
    ])
      await expectCode(readSnapshot(withIterations(file, iterations), PASSWORD), 'invalid-header');
    expect(deriveSpy).not.toHaveBeenCalled();
    deriveSpy.mockRestore();
    await expect(make({ iterations: 1000 })).rejects.toThrow(RangeError);
  });

  it('refuses a too-short password on create', async () => {
    await expectCode(make({ password: 'short' }), 'password-too-short');
    await expectCode(make({ password: 'a'.repeat(MIN_PASSWORD_LENGTH - 1) }), 'password-too-short');
    await expectCode(make({ password: undefined }), 'password-too-short');
    await expect(make({ password: 'a'.repeat(MIN_PASSWORD_LENGTH) })).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });

  it('refuses a workspace from a newer app version, with the migrations message', async () => {
    const newer = { schemaVersion: 99, exportedAt: null, data: structuredClone(currentV1.data) };
    await expectCode(make({ appState: newer }), 'newer-app-version');

    const file = await sealSnapshotPayload(
      { meta: { kind: 'ssb-snapshot', createdAt: new Date(NOW).toISOString() }, appState: newer },
      PASSWORD,
      { iterations: FAST },
    );
    const error = await expectCode(readSnapshot(file, PASSWORD), 'newer-app-version');
    expect(error.message).toContain(NEWER_SCHEMA_VERSION_MESSAGE);
    expect(error.cause?.code).toBe('newer-schema-version');
  });

  it('refuses contents that decrypt but are not a valid workspace', async () => {
    const meta = { kind: 'ssb-snapshot', createdAt: new Date(NOW).toISOString() };
    const cases = [
      { meta, appState: { schemaVersion: 1, exportedAt: null, data: { transactions: 'nope' } } },
      { meta, appState: null },
      { appState: structuredClone(currentV1) },
      'just a string',
    ];
    for (const payload of cases) {
      const file = await sealSnapshotPayload(payload, PASSWORD, { iterations: FAST });
      await expectCode(readSnapshot(file, PASSWORD), 'invalid-contents');
    }
    await expectCode(make({ appState: { nope: true } }), 'invalid-contents');
  });
});

describe('generatePassphrase', () => {
  it('makes grouped lowercase letters from the unambiguous alphabet', () => {
    const passphrase = generatePassphrase();
    expect(passphrase).toMatch(/^[a-z]{4}(-[a-z]{4}){4}$/);
    expect(passphrase).toHaveLength(24);
    for (const letter of passphrase.replaceAll('-', ''))
      expect(PASSPHRASE_ALPHABET).toContain(letter);
    expect(PASSPHRASE_ALPHABET).not.toMatch(/[ilo]/);
  });

  it('honours sizing options, stays above the minimum and varies', () => {
    expect(generatePassphrase({ groups: 6, groupLength: 5, separator: ' ' })).toMatch(
      /^[a-z]{5}( [a-z]{5}){5}$/,
    );
    expect(() => generatePassphrase({ groups: 1, groupLength: 4 })).toThrow(RangeError);
    expect(() => generatePassphrase({ groups: 0 })).toThrow(RangeError);
    const seen = new Set(Array.from({ length: 50 }, () => generatePassphrase()));
    expect(seen.size).toBe(50);
  });
});
