import { describe, expect, it } from 'vitest';
import { GoalSchema } from '../lib/validation';
import { applyWorkspaceChanges } from '../../backend/workspaceChanges';
import { createPersistedAppState } from '../lib/appState';
import { parseImportedAppState, serializeBackupState } from '../lib/persistence';
import { addMonths, assignGoalAccounts, computeGoal, computeGoals, getGoalChart } from '../lib/goals';

const now = new Date(2026, 9, 15); // 2026-10
const fxRates = { EUR: 5, USD: 4 };
const account = (id, name, balances, extra = {}) => ({ id, name, currency: 'RON', balances, notes: {}, ...extra });
const goal = (extra = {}) => ({ id: 'g1', name: 'Fund', targetAmount: 1000, targetMonth: '2027-04', createdAt: '2026-06-01', ...extra });

describe('goal schema', () => {
  it('still accepts the original goal shape and keeps every new field', () => {
    expect(GoalSchema.safeParse({ id: 'a', name: 'Old', targetAmount: 100, targetMonth: '2026-12' }).success).toBe(true);
    const full = goal({ currency: 'EUR', note: 'n', linkedAccountIds: ['x'], contributions: [{ id: 'c', date: '2026-10-01', amount: -20, note: '' }] });
    expect(GoalSchema.parse(full)).toEqual(full);
    expect(GoalSchema.safeParse(goal({ contributions: [{ id: 'c', date: '2026-10-01', amount: 0 }] })).success).toBe(false);
  });

  it('survives backup export/import and the encrypted-workspace change path with all new fields', () => {
    const full = goal({ currency: 'EUR', linkedAccountIds: ['x'], contributions: [{ id: 'c', date: '2026-10-01', amount: 5, note: 'gift' }] });
    const state = createPersistedAppState();
    state.data.goals = [full];
    expect(parseImportedAppState(serializeBackupState(state)).data.goals).toEqual([full]);
    const updated = applyWorkspaceChanges({ version: 1, data: createPersistedAppState() }, { version: 1, changes: [{ field: 'goals', value: [full] }] });
    expect(updated.data.goals).toEqual([full]);
  });
});

describe('account assignment', () => {
  it('lets the first goal keep an account, skips credit accounts and unknown ids', () => {
    const accounts = [account('a', 'Savings', {}), account('c', 'ING Credit', {}), account('b', 'Cash', {})];
    const map = assignGoalAccounts([
      goal({ id: '1', linkedAccountIds: ['a', 'c', 'gone'] }),
      goal({ id: '2', linkedAccountIds: ['a', 'b'] }),
    ], accounts);
    expect(map.get('1').map((item) => item.id)).toEqual(['a']);
    expect(map.get('2').map((item) => item.id)).toEqual(['b']);
  });
});

describe('computeGoal', () => {
  it('adds linked balances and contributions and measures progress per goal', () => {
    const linked = [account('a', 'Savings', { '2026-07': 100, '2026-10': 400 })];
    const result = computeGoal(goal({ contributions: [{ id: 'c', date: '2026-09-10', amount: 100 }] }), linked, { fxRates, now });
    expect(result).toMatchObject({ saved: 500, remaining: 500, linkedSaved: 400, contributed: 100, progress: 0.5, monthsLeft: 6 });
    expect(result.requiredMonthly).toBeCloseTo(500 / 6);
  });

  it('computes pace from real data points and flags on track or behind', () => {
    const linked = [account('a', 'Savings', { '2026-07': 100, '2026-10': 400 })];
    const onTrack = computeGoal(goal({ targetAmount: 1000, targetMonth: '2027-04' }), linked, { fxRates, now });
    expect(onTrack.pace).toBe(100);
    expect(onTrack.status).toBe('on-track');
    expect(onTrack.projectedMonth).toBe('2027-04');
    const behind = computeGoal(goal({ targetAmount: 5000, targetMonth: '2026-12' }), linked, { fxRates, now });
    expect(behind.status).toBe('behind');
  });

  it('does not call a goal behind when there is no history', () => {
    const one = computeGoal(goal(), [account('a', 'Savings', { '2026-10': 400 })], { fxRates, now });
    expect(one.pace).toBeNull();
    expect(one.status).toBe('no-history');
    expect(computeGoal(goal(), [], { fxRates, now }).status).toBe('no-history');
  });

  it('handles complete, overdue and open-ended goals', () => {
    const rich = [account('a', 'Savings', { '2026-09': 900, '2026-10': 1200 })];
    expect(computeGoal(goal(), rich, { fxRates, now })).toMatchObject({ status: 'complete', progress: 1, remaining: 0, requiredMonthly: null });
    const poor = [account('a', 'Savings', { '2026-09': 10, '2026-10': 20 })];
    expect(computeGoal(goal({ targetMonth: '2026-08' }), poor, { fxRates, now }).status).toBe('overdue');
    const open = computeGoal(goal({ targetMonth: '' }), poor, { fxRates, now });
    expect(open.requiredMonthly).toBeNull();
    expect(open.status).toBe('progressing');
  });

  it('converts linked balances into the goal currency', () => {
    const eurGoal = goal({ currency: 'EUR', targetAmount: 1000 });
    const result = computeGoal(eurGoal, [account('a', 'RON savings', { '2026-10': 1000 })], { fxRates, now });
    expect(result.saved).toBeCloseTo(200);
    expect(result.currency).toBe('EUR');
  });

  it('computes every goal against its own accounts', () => {
    const accounts = [account('a', 'A', { '2026-10': 300 }), account('b', 'B', { '2026-10': 100 })];
    const [first, second] = computeGoals([goal({ id: '1', linkedAccountIds: ['a'] }), goal({ id: '2', linkedAccountIds: ['b'] })], accounts, { fxRates, now });
    expect([first.saved, second.saved]).toEqual([300, 100]);
  });
});

describe('chart and months', () => {
  it('adds months across years', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('builds aligned series with actuals only up to now', () => {
    const linked = [account('a', 'Savings', { '2026-07': 100, '2026-10': 400 })];
    const g = goal({ targetAmount: 1000, targetMonth: '2027-02' });
    const result = computeGoal(g, linked, { fxRates, now });
    const chart = getGoalChart(g, linked, result, { fxRates });
    expect(chart.actual).toHaveLength(chart.months.length);
    expect(chart.actual.at(-1)).toBeNull();
    expect(chart.actual[chart.months.indexOf('2026-10')]).toBe(400);
    expect(chart.projected[chart.months.indexOf('2026-11')]).toBe(500);
    expect(chart.needed.filter((value) => value !== null).at(-1)).toBe(1000);
  });
});
