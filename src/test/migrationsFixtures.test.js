// One synthetic saved workspace per historical schema version must load to the current shape
// with no data loss, through every client entry point (localStorage, backup restore).
import { describe, expect, it, vi } from 'vitest';
import { txKey } from '../lib/csvParser';
import { loadLocalAppState, parseImportedAppState } from '../lib/persistence';
import {
  APP_STATE_SCHEMA_VERSION,
  PersistedAppStateSchema,
  sanitizeAppData,
  sanitizePersistedAppState,
} from '../lib/validation';
import legacyInitial from './fixtures/synthetic-workspace-v0-initial.json';
import legacyFx from './fixtures/synthetic-workspace-v0-fx.json';
import currentV1 from './fixtures/synthetic-workspace-v1.json';

// Version 0 = no `schemaVersion` (bare AppData, before commit 61645f3), in its two released
// shapes: the first public release and the FX/multicurrency release. Version 1 = current.
const FIXTURES = [
  { name: 'v0 initial release', version: 0, raw: legacyInitial, data: legacyInitial },
  { name: 'v0 fx release', version: 0, raw: legacyFx, data: legacyFx },
  { name: 'v1 current', version: 1, raw: currentV1, data: currentV1.data },
];

function storageWith(value) {
  return { getItem: vi.fn(() => value), setItem: vi.fn(), removeItem: vi.fn() };
}

function loaders(raw) {
  return {
    sanitize: sanitizePersistedAppState(structuredClone(raw)),
    localStorage: loadLocalAppState('fake-key', storageWith(JSON.stringify(raw))),
    backup: parseImportedAppState(JSON.stringify(raw)),
  };
}

function expectNoDataLoss(source, loaded) {
  expect(loaded.transactions).toHaveLength(source.transactions.length);
  expect(loaded.transactions.map(txKey)).toEqual(source.transactions.map(txKey));
  loaded.transactions.forEach((transaction, index) => {
    const original = source.transactions[index];
    expect(transaction).toMatchObject({
      date: original.date,
      desc: original.desc,
      amt: original.amt,
      currency: original.currency,
      flow: original.flow,
      cat: original.cat,
      ym: original.ym,
    });
  });
  expect(loaded.accounts.map(({ id, name, balances }) => ({ id, name, balances }))).toEqual(
    source.accounts.map(({ id, name, balances }) => ({ id, name, balances })),
  );
  source.accounts.forEach((account, index) => {
    if (account.currency) expect(loaded.accounts[index].currency).toBe(account.currency);
  });
  expect(loaded.customVendors).toEqual(source.customVendors);
  expect(loaded.budgets).toEqual(source.budgets);
  expect(loaded.goals).toEqual(source.goals);
  expect(loaded.lastUpdated).toBe(source.lastUpdated);
  for (const key of ['displayCurrency', 'fxRates', 'fxUpdatedAt', 'fxSource'])
    if (key in source) expect(loaded[key]).toEqual(source[key]);
}

describe.each(FIXTURES)('$name fixture', ({ version, raw, data }) => {
  it('is synthetic and declares the version it represents', () => {
    expect(raw.schemaVersion ?? 0).toBe(version);
    expect(JSON.stringify(raw)).toMatch(/Synthetic|Fake/);
  });

  it('loads to the current schema shape through localStorage, backup restore and sanitize', () => {
    const results = loaders(raw);
    expect(results.localStorage.issues).toEqual([]);
    expect(results.localStorage.persistedState).toEqual(results.sanitize);
    expect(results.backup).toEqual(results.sanitize);
    expect(results.sanitize.schemaVersion).toBe(APP_STATE_SCHEMA_VERSION);
    expect(PersistedAppStateSchema.safeParse(results.sanitize).success).toBe(true);
    // Loading the result again changes nothing: the next save writes exactly this.
    expect(sanitizePersistedAppState(results.sanitize)).toEqual(results.sanitize);
  });

  it('keeps every row, amount, currency and id', () => {
    expectNoDataLoss(data, sanitizePersistedAppState(structuredClone(raw)).data);
  });
});

describe('legacy (v0) fixtures', () => {
  it.each([legacyInitial, legacyFx])(
    'load exactly as before the migration framework existed',
    (raw) => {
      // The pre-framework legacy branch of sanitizePersistedAppState, inlined.
      expect(sanitizePersistedAppState(structuredClone(raw))).toEqual({
        schemaVersion: 1,
        exportedAt: null,
        data: sanitizeAppData(structuredClone(raw)),
      });
    },
  );

  it('fills fields added since v0 with defaults and suggests account groups', () => {
    const loaded = sanitizePersistedAppState(structuredClone(legacyInitial)).data;
    expect(loaded.accounts.map((account) => [account.currency, account.group])).toEqual([
      ['RON', 'other'],
      ['RON', 'other'],
    ]);
    expect(loaded).toMatchObject({
      subscriptions: [],
      creditRecords: [],
      portfolioHoldings: [],
      moneyFlow: { incomes: [], transfers: [] },
      importMeta: { latestSummary: null, history: [] },
      themeMode: 'dark',
    });
  });

  // Pre-existing behaviour, unchanged by this framework: the retired account field
  // `monthlyContribution` (removed from the schema in 37ad139/ab1a2d3) is not kept.
  it('drops only the retired monthlyContribution account field', () => {
    const loaded = sanitizePersistedAppState(structuredClone(legacyInitial)).data;
    expect(loaded.accounts.every((account) => !('monthlyContribution' in account))).toBe(true);
  });
});

describe('v1 fixture', () => {
  it('round-trips byte for byte', () => {
    expect(sanitizePersistedAppState(structuredClone(currentV1))).toEqual(currentV1);
  });
});
