// Upgrade path for the persisted workspace envelope `{ schemaVersion, exportedAt, data }`.
//
// Every step is a pure function from version N to N+1: no I/O, no clock, and the input is never
// mutated. `migrateState` runs the steps a saved state needs to reach APP_STATE_SCHEMA_VERSION.
// It only upgrades the shape; repairing malformed values stays in `sanitizePersistedAppState`
// (backend/appStateSchema.js), which runs on the migrated result.
//
// To change the persisted shape: bump APP_STATE_SCHEMA_VERSION in backend/appStateSchema.js,
// append a `{ from: N, to: N + 1, migrate }` step here, and add a
// `src/test/fixtures/synthetic-workspace-v<N+1>.json` fixture with a load test.
import { APP_STATE_SCHEMA_VERSION } from '../../backend/appStateSchema.js';

export const NEWER_SCHEMA_VERSION_MESSAGE =
  'Your saved workspace was written by a newer version of SimpleSafeBanking. It was left untouched and nothing will be saved over it. Update SimpleSafeBanking to open it.';

export class NewerSchemaVersionError extends Error {
  constructor(version, supportedVersion = APP_STATE_SCHEMA_VERSION) {
    super(
      `This workspace was saved by a newer version of SimpleSafeBanking (data format ${version}; this app reads up to ${supportedVersion}). It was left untouched. Update SimpleSafeBanking to open it.`,
    );
    this.name = 'NewerSchemaVersionError';
    this.code = 'newer-schema-version';
    this.version = version;
    this.supportedVersion = supportedVersion;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * v0 -> v1. Before commit 61645f3 the app stored the bare AppData object (no envelope, no
 * version). Wrap it exactly as the old legacy branch of sanitizePersistedAppState did: an inner
 * `data` object wins, otherwise the value itself is the data.
 */
function legacyToV1(raw) {
  return {
    schemaVersion: 1,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : null,
    data: isPlainObject(raw.data) ? raw.data : raw,
  };
}

/** Ordered steps. `from` must be contiguous from 0 up to APP_STATE_SCHEMA_VERSION - 1. */
export const MIGRATIONS = Object.freeze([Object.freeze({ from: 0, to: 1, migrate: legacyToV1 })]);

/**
 * 0 for a legacy (unversioned) object, the integer version for a versioned one, or null when the
 * value is not a recognisable workspace (not an object, or a version marker that is not a
 * positive integer). Null values are passed through untouched for validation or repair to judge.
 */
export function detectSchemaVersion(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.schemaVersion === undefined) return 0;
  return Number.isSafeInteger(raw.schemaVersion) && raw.schemaVersion >= 1
    ? raw.schemaVersion
    : null;
}

export function isNewerSchemaVersion(raw, currentVersion = APP_STATE_SCHEMA_VERSION) {
  const version = detectSchemaVersion(raw);
  return version !== null && version > currentVersion;
}

/**
 * Upgrades a saved state to `currentVersion`. Returns the input itself when it is already
 * current (or unrecognisable). Throws NewerSchemaVersionError for a version this app does not
 * know, so callers can refuse it without touching what is stored.
 */
export function migrateState(
  raw,
  { migrations = MIGRATIONS, currentVersion = APP_STATE_SCHEMA_VERSION } = {},
) {
  const startVersion = detectSchemaVersion(raw);
  if (startVersion === null) return raw;
  if (startVersion > currentVersion)
    throw new NewerSchemaVersionError(startVersion, currentVersion);

  let state = raw;
  for (let version = startVersion; version < currentVersion; version += 1) {
    const step = migrations.find((candidate) => candidate.from === version);
    if (!step || step.to !== version + 1)
      throw new Error(`No migration from workspace schema version ${version}`);
    state = step.migrate(state);
    if (state?.schemaVersion !== step.to)
      throw new Error(`Migration ${step.from} -> ${step.to} did not produce version ${step.to}`);
  }
  return state;
}
