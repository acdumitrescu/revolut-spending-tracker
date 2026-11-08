import { describe, expect, it } from 'vitest';
import { createInitialAppData, createPersistedAppState, appReducer } from '../lib/appState';
import { CreditRecordSchema, sanitizeAppData } from '../lib/validation';
import { getCreditOverview, isIngCreditAccount, creditDateStatus } from '../lib/credit';
import { parseImportedAppState, serializeBackupState } from '../lib/persistence';
import { shouldLoadRemoteAtBootstrap } from '../lib/serverSync';

const vendor = { id: 'v', kind: 'vendor', name: 'Synthetic shop', currency: 'EUR', remainingBalance: 100, monthlyPayment: 20, dueDate: '2026-10-15', notes: '' };
const plan = { id: 'p', kind: 'planned', name: 'Synthetic car lease', currency: 'RON', amountFinanced: 30000, monthlyPayment: 800, dueDate: '2027-01-01', termMonths: 48, notes: '' };
const accounts = [
  { id: 'card', name: 'ING CREDIT CARD', currency: 'RON', balances: { '2026-08': -900, '2026-09': -600 } },
  { id: 'debit', name: 'ING DEBIT', currency: 'RON', balances: { '2026-09': 5000 } },
];

describe('credit register', () => {
  it('auto-links only explicit ING credit accounts and uses the latest debt without mutating accounts', () => {
    const data = { ...createInitialAppData(), accounts };
    const before = JSON.stringify(data);
    const result = getCreditOverview(data);
    expect(isIngCreditAccount(accounts[1])).toBe(false);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({ accountId: 'card', remainingBalance: 600, latestMonth: '2026-09' });
    expect(result.outstanding).toBe(600);
    expect(result.missingPayments).toBe(1);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('combines actual debts with FX conversion and excludes future plans from both actual totals', () => {
    const data = { ...createInitialAppData(), accounts, creditRecords: [vendor, plan, { id: 'c', kind: 'card', accountId: 'card', monthlyPayment: 50, dueDate: '', notes: '' }] };
    const result = getCreditOverview(data);
    expect(result.cards).toHaveLength(1);
    expect(result.outstanding).toBe(1100);
    expect(result.monthlyPayments).toBe(150);
    expect(result.plans).toHaveLength(1);
  });
  it('does not turn positive, missing or deleted account balances into debt', () => {
    const result = getCreditOverview({ ...createInitialAppData(), accounts: [{ ...accounts[0], balances: { '2026-10': 20 } }], creditRecords: [{ id: 'missing', kind: 'card', accountId: 'gone', monthlyPayment: 10, dueDate: '', notes: '' }] });
    expect(result.outstanding).toBe(0);
    expect(result.missingBalances).toBe(1);
    expect(result.cards.find((card) => card.accountId === 'gone')).toMatchObject({ remainingBalance: null, missingAccount: true });
    const empty = getCreditOverview({ ...createInitialAppData(), accounts: [{ ...accounts[0], balances: {} }] });
    expect(empty.cards[0].remainingBalance).toBeNull();
  });
  it('adds, edits and removes records without altering accounts, budgets or transactions', () => {
    const initial = createPersistedAppState({ ...createInitialAppData(), accounts });
    const added = appReducer(initial, { type: 'upsert_credit_record', record: vendor });
    const edited = appReducer(added, { type: 'upsert_credit_record', record: { ...vendor, remainingBalance: 60 } });
    expect(edited.data.creditRecords).toHaveLength(1);
    expect(edited.data.creditRecords[0].remainingBalance).toBe(60);
    expect(edited.data.accounts).toEqual(initial.data.accounts);
    expect(edited.data.transactions).toEqual(initial.data.transactions);
    expect(edited.data.budgets).toEqual(initial.data.budgets);
    expect(appReducer(edited, { type: 'remove_credit_record', id: 'v' }).data.creditRecords).toEqual([]);
  });
  it('prevents duplicate card links and rejects invalid records', () => {
    const initial = createPersistedAppState({ ...createInitialAppData(), accounts });
    const first = appReducer(initial, { type: 'upsert_credit_record', record: { id: 'c1', kind: 'card', accountId: 'card' } });
    const second = appReducer(first, { type: 'upsert_credit_record', record: { id: 'c2', kind: 'card', accountId: 'card', monthlyPayment: 30 } });
    expect(second.data.creditRecords).toHaveLength(1);
    expect(appReducer(second, { type: 'upsert_credit_record', record: { ...vendor, remainingBalance: -1 } })).toBe(second);
    expect(appReducer(second, { type: 'upsert_credit_record', record: { id: 'bad', kind: 'card', accountId: 'missing' } })).toBe(second);
  });
  it('preserves new records through backup, restore, legacy loading and fallback repair', () => {
    const state = createPersistedAppState({ ...createInitialAppData(), accounts, creditRecords: [vendor, plan] });
    expect(parseImportedAppState(serializeBackupState(state)).data).toEqual(state.data);
    const legacy = createInitialAppData(); delete legacy.creditRecords;
    expect(sanitizeAppData(legacy).creditRecords).toEqual([]);
    expect(sanitizeAppData({ ...state.data, transactions: [{ broken: true }] }).creditRecords).toEqual(state.data.creditRecords);
    expect(shouldLoadRemoteAtBootstrap(createPersistedAppState(), state, Date.now())).toBe(false);
  });
  it('treats credit-only workspaces as populated during sync bootstrap', () => {
    const populated = createPersistedAppState({ ...createInitialAppData(), creditRecords: [vendor] });
    expect(shouldLoadRemoteAtBootstrap(createPersistedAppState(), populated, Date.now())).toBe(false);
    expect(shouldLoadRemoteAtBootstrap(populated, createPersistedAppState(), 0)).toBe(true);
  });
  it.each([{ remainingBalance: -1 }, { monthlyPayment: -1 }, { dueDate: '2026-02-31' }, { currency: 'XYZ' }, { name: '  ' }])('rejects invalid vendor fields %j', (invalid) => {
    expect(CreditRecordSchema.safeParse({ ...vendor, ...invalid }).success).toBe(false);
  });
  it('labels dates as needing review rather than claiming a missed payment', () => {
    expect(creditDateStatus('2026-10-01', '2026-10-03')).toBe('Past date — review');
    expect(creditDateStatus('2026-10-03', '2026-10-03')).toBe('Due today');
    expect(creditDateStatus('', '2026-10-03')).toBe('Date not set');
  });
});
