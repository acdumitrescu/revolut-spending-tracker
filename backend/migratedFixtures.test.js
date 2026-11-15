// @vitest-environment node
// The backend contract accepts every historical workspace once the client has migrated it, and
// still rejects everything it rejected before (it never migrates or repairs by itself).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrateState } from '../src/lib/migrations.js';
import { APP_STATE_SCHEMA_VERSION, sanitizePersistedAppState } from './appStateSchema.js';
import { validateState } from './validateState.js';

const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../src/test/fixtures/synthetic-workspace-${name}.json`, import.meta.url)),
  );

const FIXTURES = ['v0-initial', 'v0-fx', 'v1'];

describe.each(FIXTURES)('synthetic-workspace-%s', (name) => {
  it('passes validateState after the client migrates and loads it', () => {
    const loaded = sanitizePersistedAppState(migrateState(fixture(name)));
    const validated = validateState(loaded);
    expect(validated.schemaVersion).toBe(APP_STATE_SCHEMA_VERSION);
    expect(validated).toEqual(loaded);
  });
});

describe('what the backend still rejects', () => {
  it('rejects an unversioned legacy workspace that was not migrated', () => {
    expect(() => validateState(fixture('v0-initial'))).toThrow('Invalid versioned app state');
    expect(() => validateState({ data: fixture('v0-fx') })).toThrow('Invalid versioned app state');
  });

  it('rejects a newer schema version', () => {
    const newer = { ...fixture('v1'), schemaVersion: APP_STATE_SCHEMA_VERSION + 1 };
    expect(() => validateState(newer)).toThrow('Invalid versioned app state');
  });

  it('rejects unknown fields instead of stripping them', () => {
    const extra = fixture('v1');
    extra.data.accounts[0].monthlyContribution = 10;
    expect(() => validateState(extra)).toThrow('Unsupported field in app state');
  });
});
