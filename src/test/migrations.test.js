// Unit tests for the persisted-workspace upgrade path (src/lib/migrations.js).
import { describe, expect, it } from 'vitest';
import {
  detectSchemaVersion,
  isNewerSchemaVersion,
  migrateState,
  MIGRATIONS,
  NEWER_SCHEMA_VERSION_MESSAGE,
  NewerSchemaVersionError,
} from '../lib/migrations';
import { APP_STATE_SCHEMA_VERSION, PersistedAppStateSchema } from '../lib/validation';
import legacyInitial from './fixtures/synthetic-workspace-v0-initial.json';
import currentV1 from './fixtures/synthetic-workspace-v1.json';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

const frozenClone = (value) => deepFreeze(structuredClone(value));

describe('the production chain', () => {
  it('is contiguous from 0 up to the current schema version', () => {
    expect(APP_STATE_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS.map(({ from, to }) => [from, to])).toEqual(
      Array.from({ length: APP_STATE_SCHEMA_VERSION }, (_, from) => [from, from + 1]),
    );
  });
});

describe('detectSchemaVersion', () => {
  it.each([
    [{ transactions: [] }, 0],
    [{ data: {} }, 0],
    [{ schemaVersion: undefined, data: {} }, 0],
    [{ schemaVersion: 1, data: {} }, 1],
    [{ schemaVersion: 7, data: {} }, 7],
    [{ schemaVersion: '1', data: {} }, null],
    [{ schemaVersion: 0, data: {} }, null],
    [{ schemaVersion: -2, data: {} }, null],
    [{ schemaVersion: 1.5, data: {} }, null],
    [{ schemaVersion: null, data: {} }, null],
    [null, null],
    [[], null],
    ['workspace', null],
    [42, null],
  ])('%j -> %j', (value, expected) => {
    expect(detectSchemaVersion(value)).toBe(expected);
  });

  it('flags only integer versions above the current one as newer', () => {
    expect(isNewerSchemaVersion({ schemaVersion: APP_STATE_SCHEMA_VERSION + 1 })).toBe(true);
    expect(isNewerSchemaVersion({ schemaVersion: APP_STATE_SCHEMA_VERSION })).toBe(false);
    expect(isNewerSchemaVersion({ schemaVersion: '99' })).toBe(false);
    expect(isNewerSchemaVersion(null)).toBe(false);
    expect(isNewerSchemaVersion({ transactions: [] })).toBe(false);
    expect(isNewerSchemaVersion({ schemaVersion: 2 }, 2)).toBe(false);
  });
});

describe('step 0 -> 1 (legacy unversioned workspace)', () => {
  const step = MIGRATIONS[0];

  it('wraps bare AppData in the versioned envelope without changing the data', () => {
    const raw = frozenClone(legacyInitial);
    const migrated = step.migrate(raw);
    expect(migrated).toEqual({ schemaVersion: 1, exportedAt: null, data: raw });
    expect(migrated.data).toBe(raw);
  });

  it('unwraps an inner data object and keeps a numeric exportedAt', () => {
    const raw = frozenClone({ exportedAt: 1234, data: { transactions: [] } });
    expect(step.migrate(raw)).toEqual({
      schemaVersion: 1,
      exportedAt: 1234,
      data: { transactions: [] },
    });
  });

  it('drops a non-numeric exportedAt and ignores a non-object data field', () => {
    const raw = frozenClone({ exportedAt: 'yesterday', data: 'nope', transactions: [] });
    expect(step.migrate(raw)).toEqual({ schemaVersion: 1, exportedAt: null, data: raw });
  });
});

describe('migrateState', () => {
  it('runs the chain for a legacy state and produces the current schema shape', () => {
    const migrated = migrateState(frozenClone(legacyInitial));
    expect(migrated.schemaVersion).toBe(APP_STATE_SCHEMA_VERSION);
    expect(PersistedAppStateSchema.safeParse(migrated).success).toBe(true);
  });

  it('returns a current-version state unchanged (same reference) and is idempotent', () => {
    const current = frozenClone(currentV1);
    expect(migrateState(current)).toBe(current);
    const once = migrateState(frozenClone(legacyInitial));
    expect(migrateState(once)).toBe(once);
  });

  it('never mutates its input', () => {
    const raw = structuredClone(legacyInitial);
    const before = structuredClone(raw);
    migrateState(raw);
    expect(raw).toEqual(before);
  });

  it('refuses a newer schema version with a readable error', () => {
    const newer = frozenClone({ ...currentV1, schemaVersion: APP_STATE_SCHEMA_VERSION + 98 });
    let error;
    try {
      migrateState(newer);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(NewerSchemaVersionError);
    expect(error).toMatchObject({
      code: 'newer-schema-version',
      version: APP_STATE_SCHEMA_VERSION + 98,
      supportedVersion: APP_STATE_SCHEMA_VERSION,
    });
    expect(error.message).toMatch(/newer version of SimpleSafeBanking/);
    expect(error.message).toMatch(/left untouched/);
    expect(NEWER_SCHEMA_VERSION_MESSAGE).toMatch(/nothing will be saved over it/);
  });

  it.each([null, undefined, [], 'text', 42, true, { schemaVersion: 'x' }, { schemaVersion: 0 }])(
    'passes unrecognisable input through untouched for validation to judge: %j',
    (value) => {
      expect(migrateState(value)).toBe(value);
    },
  );

  it('fails loudly when the chain has a gap or a step returns the wrong version', () => {
    expect(() => migrateState({ data: {} }, { migrations: [], currentVersion: 1 })).toThrow(
      'No migration from workspace schema version 0',
    );
    const skipping = [{ from: 0, to: 2, migrate: (raw) => ({ ...raw, schemaVersion: 2 }) }];
    expect(() => migrateState({ data: {} }, { migrations: skipping, currentVersion: 2 })).toThrow(
      'No migration from workspace schema version 0',
    );
    const wrong = [{ from: 0, to: 1, migrate: (raw) => ({ data: raw }) }];
    expect(() => migrateState({ data: {} }, { migrations: wrong, currentVersion: 1 })).toThrow(
      'Migration 0 -> 1 did not produce version 1',
    );
  });
});

// TEST-ONLY. There is no schema version 2 in production. This proves the chain mechanism works
// for a future bump: a pure step that renames a field, run after the real 0 -> 1 step.
describe('example future migration (test-only v1 -> v2)', () => {
  const exampleV1ToV2 = {
    from: 1,
    to: 2,
    migrate: (state) => {
      const { themeMode, ...data } = state.data;
      return { ...state, schemaVersion: 2, data: { ...data, appearance: { theme: themeMode } } };
    },
  };
  const options = { migrations: [...MIGRATIONS, exampleV1ToV2], currentVersion: 2 };

  it('upgrades a v1 state through the extra step', () => {
    const migrated = migrateState(frozenClone(currentV1), options);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.data.appearance).toEqual({ theme: currentV1.data.themeMode });
    expect(migrated.data).not.toHaveProperty('themeMode');
    expect(migrated.data.transactions).toEqual(currentV1.data.transactions);
  });

  it('chains 0 -> 1 -> 2 for a legacy state', () => {
    const migrated = migrateState(frozenClone({ ...legacyInitial, themeMode: 'dark' }), options);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.data.appearance).toEqual({ theme: 'dark' });
    expect(migrated.data.accounts).toEqual(legacyInitial.accounts);
  });

  it('leaves a v2 state alone and refuses v3', () => {
    const v2 = migrateState(frozenClone(currentV1), options);
    expect(migrateState(v2, options)).toBe(v2);
    expect(() => migrateState({ ...v2, schemaVersion: 3 }, options)).toThrow(
      NewerSchemaVersionError,
    );
  });
});
