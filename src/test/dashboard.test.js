import { describe, expect, it } from 'vitest';
import { createInitialAppData } from '../lib/appState';
import {
  COMING_UP_DAYS,
  DASHBOARD_ROUTES,
  resolveDashboardPeriod,
  selectComingUp,
  selectCumulativeSpend,
  selectLeftInBudget,
  selectNeedsAttention,
  selectNetWorth,
  selectSpent,
  selectTopCategories,
  toDateKey,
} from '../lib/dashboard';
import { getMonthlyExpense } from '../lib/selectors';

// Synthetic fixture builders only. Fixed `now`; no real clock, no time zone dependence.
const NOW = '2026-11-16';

const txn = (date, amt, overrides = {}) => ({
  date,
  desc: 'Synthetic Shop',
  amt,
  flow: amt < 0 ? 'Debit' : 'Credit',
  type: 'Card Payment',
  ym: date.slice(0, 7),
  cat: 'Shopping',
  sub: '',
  currency: 'RON',
  ...overrides,
});
const account = (id, balances, overrides = {}) => ({
  id,
  name: `Account ${id}`,
  currency: 'RON',
  group: 'bank',
  balances,
  notes: {},
  ...overrides,
});
const sub = (id, nextRenewal, overrides = {}) => ({
  id,
  name: `Plan ${id}`,
  amount: 10,
  currency: 'RON',
  cycle: 'monthly',
  nextRenewal,
  status: 'active',
  notes: '',
  icon: '',
  ...overrides,
});
const workspace = (overrides = {}) => ({
  ...createInitialAppData(),
  fxRates: { EUR: 5, USD: 4 },
  ...overrides,
});
const period = (kind = 'this-month', now = NOW, extra = {}) =>
  resolveDashboardPeriod({ kind, now, ...extra });

describe('resolveDashboardPeriod', () => {
  it('this month runs from the 1st to today; previous is the whole previous month', () => {
    expect(period()).toMatchObject({
      kind: 'this-month',
      start: '2026-11-01',
      end: '2026-11-16',
      previousStart: '2026-10-01',
      previousEnd: '2026-10-31',
      days: 16,
      previousDays: 31,
      previousToDateEnd: '2026-10-16',
      inProgress: true,
      fallback: false,
    });
  });

  it('last month is a whole month and handles 28 and 31 day months and year change', () => {
    expect(period('last-month', '2026-03-10')).toMatchObject({
      start: '2026-02-01',
      end: '2026-02-28',
      previousStart: '2026-01-01',
      previousEnd: '2026-01-31',
      days: 28,
      previousDays: 31,
      inProgress: false,
    });
    expect(period('last-month', '2024-03-10')).toMatchObject({ end: '2024-02-29', days: 29 });
    expect(period('last-month', '2027-01-05')).toMatchObject({
      start: '2026-12-01',
      end: '2026-12-31',
      previousStart: '2026-11-01',
    });
  });

  it('this month on the first and last day of a month', () => {
    expect(period('this-month', '2026-12-01')).toMatchObject({
      start: '2026-12-01',
      end: '2026-12-01',
      days: 1,
      previousEnd: '2026-11-30',
    });
    expect(period('this-month', '2026-12-31')).toMatchObject({ end: '2026-12-31', days: 31 });
  });

  it('last 3 months covers the current month and two before, across a year change', () => {
    expect(period('last-3-months', '2027-01-20')).toMatchObject({
      start: '2026-11-01',
      end: '2027-01-20',
      previousStart: '2026-08-01',
      previousEnd: '2026-10-31',
      previousDays: 92,
    });
  });

  it('year to date compares with the same span last year, including 29 Feb', () => {
    expect(period('year-to-date')).toMatchObject({
      start: '2026-01-01',
      end: NOW,
      previousStart: '2025-01-01',
      previousEnd: '2025-11-16',
    });
    expect(period('year-to-date', '2024-02-29')).toMatchObject({
      start: '2024-01-01',
      previousEnd: '2023-02-28',
    });
  });

  it('custom ranges: previous is the same length right before; reversed dates are swapped', () => {
    expect(period('custom', NOW, { from: '2026-05-10', to: '2026-05-19' })).toMatchObject({
      start: '2026-05-10',
      end: '2026-05-19',
      previousStart: '2026-04-30',
      previousEnd: '2026-05-09',
      days: 10,
      previousDays: 10,
      inProgress: false,
    });
    expect(period('custom', NOW, { from: '2026-05-19', to: '2026-05-10' }).start).toBe(
      '2026-05-10',
    );
  });

  it('falls back to this month for an invalid custom range or unknown kind', () => {
    expect(period('custom', NOW, { from: 'nope', to: '2026-05-10' })).toMatchObject({
      kind: 'this-month',
      fallback: true,
    });
    expect(period('weekly')).toMatchObject({ kind: 'this-month', fallback: true });
    expect(period('custom', NOW, { from: '2026-02-30', to: '2026-03-01' }).fallback).toBe(true);
  });

  it('accepts a Date (local calendar day) and rejects an invalid now', () => {
    expect(resolveDashboardPeriod({ now: new Date(2026, 10, 16, 12) }).end).toBe(NOW);
    expect(toDateKey(new Date('invalid'))).toBeNull();
    expect(toDateKey(42)).toBeNull();
    expect(() => resolveDashboardPeriod({ kind: 'this-month', now: 'x' })).toThrow(TypeError);
    expect(() => resolveDashboardPeriod()).toThrow(TypeError);
  });
});

describe('selectNetWorth', () => {
  it('handles an empty workspace', () => {
    const result = selectNetWorth(workspace(), period());
    expect(result).toMatchObject({
      hasData: false,
      current: 0,
      previous: null,
      delta: null,
      deltaPct: null,
      unconverted: [],
    });
  });

  it('returns the current total, the delta vs the previous period end and the composition', () => {
    const data = workspace({
      accounts: [
        account('a', { '2026-09': 1000, '2026-10': 1200, '2026-11': 1500 }),
        account('b', { '2026-10': 300 }, { group: 'cash' }),
      ],
      creditRecords: [
        { id: 'v', kind: 'vendor', name: 'Shop', remainingBalance: 100, currency: 'RON' },
      ],
    });
    const result = selectNetWorth(data, period());
    expect(result.asOfMonth).toBe('2026-11');
    expect(result.previousMonth).toBe('2026-10');
    expect(result.current).toBe(1500 + 300 - 100);
    expect(result.previous).toBe(1200 + 300 - 100);
    expect(result.delta).toBe(300);
    expect(result.deltaPct).toBeCloseTo(300 / 1400);
    expect(result.composition).toMatchObject({ accounts: 1800, vendorDebt: -100, portfolio: 0 });
    expect(result.composition.groups).toEqual([
      { group: 'bank', total: 1500, accounts: 1 },
      { group: 'cash', total: 300, accounts: 1 },
    ]);
    expect(result.accountCounts).toEqual({ updated: 1, carried: 1, missing: 0 });
  });

  it('is as of the end of a past period and has no previous before the first balance', () => {
    const data = workspace({ accounts: [account('a', { '2026-10': 500 })] });
    const lastMonth = selectNetWorth(data, period('last-month'));
    expect(lastMonth.asOfMonth).toBe('2026-10');
    expect(lastMonth.current).toBe(500);
    expect(lastMonth.previous).toBeNull();
  });

  it('converts mixed currencies and optionally includes the portfolio', () => {
    const data = workspace({
      accounts: [
        account('a', { '2026-11': 100 }),
        account('e', { '2026-11': 10 }, { currency: 'EUR' }),
      ],
      portfolioHoldings: [
        { id: 'h', ticker: 'X', quantity: 2, currentPrice: 10, avgCost: 5, currency: 'USD' },
      ],
    });
    expect(selectNetWorth(data, period()).current).toBe(150);
    expect(selectNetWorth(data, period(), { includePortfolio: true }).current).toBe(150 + 80);
    expect(selectNetWorth(data, period(), { displayCurrency: 'EUR' }).current).toBe(30);
  });

  it('never throws on a missing FX rate and reports the excluded amounts', () => {
    const data = workspace({
      accounts: [
        account('a', { '2026-11': 100 }),
        account('g', { '2026-11': 40 }, { currency: 'GBP' }),
      ],
      creditRecords: [
        { id: 'v', kind: 'vendor', name: 'Shop', remainingBalance: 25, currency: 'CHF' },
      ],
      portfolioHoldings: [
        { id: 'h', ticker: 'X', quantity: 2, currentPrice: 10, avgCost: 5, currency: 'JPY' },
      ],
    });
    const result = selectNetWorth(data, period(), { includePortfolio: true });
    expect(result.current).toBe(100);
    expect(result.unconverted).toEqual([
      { currency: 'GBP', amount: 40, count: 1, source: 'account' },
      { currency: 'CHF', amount: -25, count: 1, source: 'vendorDebt' },
      { currency: 'JPY', amount: 20, count: 1, source: 'portfolio' },
    ]);
  });

  it('excludes everything but same-currency amounts when the display currency has no rate', () => {
    const data = workspace({ accounts: [account('a', { '2026-11': 100 })] });
    const result = selectNetWorth(data, period(), { displayCurrency: 'GBP' });
    expect(result.current).toBe(0);
    expect(result.unconverted).toEqual([
      { currency: 'RON', amount: 100, count: 1, source: 'account' },
    ]);
  });

  it('tolerates a workspace missing optional fields', () => {
    expect(() => selectNetWorth({}, period())).not.toThrow();
    expect(selectNetWorth(undefined, period()).current).toBe(0);
  });
});

describe('selectSpent', () => {
  const data = workspace({
    transactions: [
      txn('2026-11-01', -100),
      txn('2026-11-16', -50, { cat: 'Groceries' }),
      txn('2026-11-17', -999), // after today: outside the period
      txn('2026-11-05', 20, { flow: 'Credit', cat: 'Refunds' }),
      txn('2026-11-06', -500, { cat: 'Transfers' }), // transfers are not spend
      txn('2026-11-06', -500, { cat: 'Savings' }),
      txn('2026-11-07', 3000, { flow: 'Credit', cat: 'Income' }),
      txn('2026-10-01', -200),
      txn('2026-10-31', -100),
      txn('2026-10-20', -400),
    ],
  });

  it('is zero for an empty workspace', () => {
    expect(selectSpent(workspace(), period())).toMatchObject({
      current: 0,
      previous: 0,
      changePct: null,
      budget: null,
      unconverted: [],
    });
  });

  it('nets refunds, ignores transfers and compares with the previous period', () => {
    const result = selectSpent(data, period());
    expect(result.current).toBe(130);
    expect(result.previous).toBe(700);
    expect(result.previousToDate).toBe(200); // 1-16 Oct
    expect(result.change).toBe(-70);
    expect(result.changePct).toBeCloseTo(-0.35);
  });

  it('matches the Monthly page rule for a whole month', () => {
    const lastMonth = selectSpent(data, period('last-month'));
    expect(lastMonth.current).toBe(getMonthlyExpense(data.transactions, '2026-10'));
  });

  it('first and last day of the period are included', () => {
    const result = selectSpent(data, period('last-month'));
    expect(result.current).toBe(700);
  });

  it('sums several currencies in the display currency', () => {
    const mixed = workspace({
      transactions: [txn('2026-11-02', -10, { currency: 'EUR' }), txn('2026-11-03', -10)],
    });
    expect(selectSpent(mixed, period()).current).toBe(60);
    expect(selectSpent(mixed, period(), { displayCurrency: 'EUR' }).current).toBe(12);
  });

  it('excludes a currency with no rate and lists it instead of treating it as RON', () => {
    const mixed = workspace({
      transactions: [
        txn('2026-11-02', -10, { currency: 'GBP' }),
        txn('2026-11-02', -5, { currency: 'GBP' }),
        txn('2026-11-03', -10),
        txn('2026-10-03', -7, { currency: 'GBP' }),
      ],
    });
    const result = selectSpent(mixed, period());
    expect(result.current).toBe(10);
    expect(result.unconverted).toEqual([{ currency: 'GBP', amount: 15, count: 2 }]);
    expect(result.previousUnconverted).toEqual([{ currency: 'GBP', amount: 7, count: 1 }]);
  });

  it('reports the budget for the period and the bar ratio, also when over budget', () => {
    const withBudget = {
      ...data,
      budgets: { '2026-11': { Shopping: 100, Groceries: 100 }, '2026-10': { Shopping: 1 } },
    };
    const under = selectSpent(withBudget, period());
    expect(under.budget).toEqual({
      total: 200,
      months: ['2026-11'],
      ratio: 130 / 200,
      remaining: 70,
      over: false,
    });
    const over = selectSpent({ ...data, budgets: { '2026-11': { Shopping: 50 } } }, period());
    expect(over.budget).toMatchObject({ total: 50, over: true, remaining: -80 });
    expect(over.budget.ratio).toBe(2.6);
  });

  it('sums the budgets of every month a multi-month period touches', () => {
    const withBudget = {
      ...data,
      budgets: {
        '2026-09': { Shopping: 7 },
        '2026-10': { Shopping: 10 },
        '2026-11': { Shopping: 20 },
      },
    };
    expect(selectSpent(withBudget, period('last-3-months')).budget).toMatchObject({
      total: 37,
      months: ['2026-09', '2026-10', '2026-11'],
    });
  });

  it('converts the budget to the display currency and survives a display currency with no rate', () => {
    const withBudget = { ...data, budgets: { '2026-11': { Shopping: 100 } } };
    expect(selectSpent(withBudget, period(), { displayCurrency: 'EUR' }).budget.total).toBe(20);
    const noRate = selectSpent(withBudget, period(), { displayCurrency: 'GBP' });
    expect(noRate.budget).toBeNull();
    expect(noRate.budgetUnconverted).toEqual([{ currency: 'RON', amount: 100, count: 1 }]);
    expect(noRate.current).toBe(0);
  });
});

describe('selectLeftInBudget', () => {
  const data = workspace({
    transactions: [
      txn('2026-11-02', -60),
      txn('2026-11-03', -30, { cat: 'Groceries' }),
      txn('2026-11-04', -45, { cat: 'Travel' }),
    ],
    budgets: { '2026-11': { Shopping: 100, Groceries: 20 } },
  });

  it('has an empty state with no budgets', () => {
    expect(selectLeftInBudget(workspace(), period())).toMatchObject({
      hasBudget: false,
      remaining: null,
      categories: [],
    });
    expect(selectLeftInBudget(data, period('last-month')).hasBudget).toBe(false);
  });

  it('counts only spending in budgeted categories and reports unbudgeted spend', () => {
    const result = selectLeftInBudget(data, period());
    expect(result).toMatchObject({
      hasBudget: true,
      budgeted: 120,
      spent: 90,
      remaining: 30,
      over: false,
      unbudgetedSpend: 45,
      months: ['2026-11'],
    });
    expect(result.categories).toEqual([
      { cat: 'Groceries', budgeted: 20, spent: 30, remaining: -10, over: true },
      { cat: 'Shopping', budgeted: 100, spent: 60, remaining: 40, over: false },
    ]);
  });

  it('goes negative when over budget', () => {
    const over = { ...data, budgets: { '2026-11': { Shopping: 10 } } };
    expect(selectLeftInBudget(over, period())).toMatchObject({ remaining: -50, over: true });
  });

  it('does not throw with unconvertible rows and reports them', () => {
    const mixed = {
      ...data,
      transactions: [...data.transactions, txn('2026-11-05', -9, { currency: 'GBP' })],
    };
    const result = selectLeftInBudget(mixed, period());
    expect(result.spent).toBe(90);
    expect(result.unconverted).toEqual([{ currency: 'GBP', amount: 9, count: 1 }]);
  });
});

describe('selectCumulativeSpend', () => {
  const data = workspace({
    transactions: [
      txn('2026-11-01', -10),
      txn('2026-11-03', -20),
      txn('2026-11-03', 5, { flow: 'Credit', cat: 'Refunds' }),
      txn('2026-10-02', -100),
      txn('2026-10-31', -50),
    ],
  });

  it('aligns both periods by day index and stops the current line at today', () => {
    const { points, currentTotal, previousTotal } = selectCumulativeSpend(data, period());
    expect(points).toHaveLength(31);
    expect(points[0]).toMatchObject({
      day: 1,
      date: '2026-11-01',
      previousDate: '2026-10-01',
      current: 10,
      previous: 0,
    });
    expect(points[1]).toMatchObject({ current: 10, previous: 100 });
    expect(points[2]).toMatchObject({ day: 3, date: '2026-11-03', current: 25 });
    expect(points[15]).toMatchObject({ day: 16, date: '2026-11-16', current: 25 });
    expect(points[16]).toMatchObject({ day: 17, date: null, current: null, previous: 100 });
    expect(points[30]).toMatchObject({ previousDate: '2026-10-31', previous: 150 });
    expect(currentTotal).toBe(25);
    expect(previousTotal).toBe(150);
  });

  it('ends the previous line when the previous month is shorter', () => {
    // Last month = Feb 2027 (28 days) vs January (31 days).
    const feb = workspace({ transactions: [txn('2027-02-28', -5), txn('2027-01-31', -9)] });
    const { points } = selectCumulativeSpend(feb, period('last-month', '2027-03-05'));
    expect(points).toHaveLength(31);
    expect(points[27]).toMatchObject({ day: 28, date: '2027-02-28', current: 5 });
    expect(points[28]).toMatchObject({ day: 29, date: null, current: null, previous: 0 });
    expect(points[30]).toMatchObject({ previous: 9, previousDate: '2027-01-31' });
  });

  it('is empty-safe and reports unconverted rows per period', () => {
    const empty = selectCumulativeSpend(workspace(), period());
    expect(empty.points.every((point) => point.current === null || point.current === 0)).toBe(true);
    const gbp = workspace({
      transactions: [
        txn('2026-11-02', -3, { currency: 'GBP' }),
        txn('2026-10-02', -4, { currency: 'GBP' }),
      ],
    });
    const result = selectCumulativeSpend(gbp, period());
    expect(result.unconverted).toEqual([{ currency: 'GBP', amount: 3, count: 1 }]);
    expect(result.previousUnconverted).toEqual([{ currency: 'GBP', amount: 4, count: 1 }]);
  });

  it('never goes below zero when refunds exceed spend so far', () => {
    const refundFirst = workspace({
      transactions: [
        txn('2026-11-01', 50, { flow: 'Credit', cat: 'Refunds' }),
        txn('2026-11-02', -20),
      ],
    });
    expect(selectCumulativeSpend(refundFirst, period()).points.slice(0, 2)).toMatchObject([
      { current: 0 },
      { current: 0 },
    ]);
  });
});

describe('selectTopCategories', () => {
  const rows = [
    ['Groceries', 100],
    ['Shopping', 80],
    ['Travel', 60],
    ['Health', 40],
    ['Fees', 30],
    ['Cash', 20],
    ['Utilities', 10],
  ].map(([cat, amount], index) => txn(`2026-11-0${index + 1}`, -amount, { cat }));

  it('is empty for an empty workspace', () => {
    expect(selectTopCategories(workspace(), period())).toEqual({
      total: 0,
      categories: [],
      other: null,
      unconverted: [],
    });
  });

  it('returns the top 5 with shares and groups the rest as other', () => {
    const result = selectTopCategories(workspace({ transactions: rows }), period());
    expect(result.total).toBe(340);
    expect(result.categories.map((entry) => entry.category)).toEqual([
      'Groceries',
      'Shopping',
      'Travel',
      'Health',
      'Fees',
    ]);
    expect(result.categories[0].share).toBeCloseTo(100 / 340);
    expect(result.other).toMatchObject({ amount: 30, count: 2 });
    expect(result.other.share).toBeCloseTo(30 / 340);
    const sum = result.categories.reduce((total, entry) => total + entry.share, 0);
    expect(sum + result.other.share).toBeCloseTo(1);
  });

  it('has no other group with five or fewer categories, and excludes transfers and refunds', () => {
    const result = selectTopCategories(
      workspace({
        transactions: [
          ...rows.slice(0, 5),
          txn('2026-11-09', -500, { cat: 'Transfers' }),
          txn('2026-11-09', 10, { flow: 'Credit', cat: 'Refunds' }),
        ],
      }),
      period(),
    );
    expect(result.other).toBeNull();
    expect(result.categories).toHaveLength(5);
    expect(result.total).toBe(310);
  });

  it('breaks ties by name and reports unconverted rows', () => {
    const result = selectTopCategories(
      workspace({
        transactions: [
          txn('2026-11-01', -10, { cat: 'B' }),
          txn('2026-11-01', -10, { cat: 'A' }),
          txn('2026-11-01', -10, { cat: 'C', currency: 'GBP' }),
        ],
      }),
      period(),
    );
    expect(result.categories.map((entry) => entry.category)).toEqual(['A', 'B']);
    expect(result.unconverted).toEqual([{ currency: 'GBP', amount: 10, count: 1 }]);
  });
});

describe('selectComingUp', () => {
  it('is empty with no subscriptions', () => {
    expect(selectComingUp(workspace(), NOW)).toMatchObject({
      items: [],
      total: 0,
      needsReview: 0,
      unconverted: [],
      days: COMING_UP_DAYS,
    });
    expect(selectComingUp({}, NOW).items).toEqual([]);
    expect(selectComingUp(workspace(), 'bad').items).toEqual([]);
  });

  it('includes today and exactly day 14 but not day 15, past dates or inactive plans', () => {
    const data = workspace({
      subscriptions: [
        sub('today', '2026-11-16'),
        sub('edge', '2026-11-30', { name: 'Edge' }),
        sub('late', '2026-12-01'),
        sub('past', '2026-11-15'),
        sub('paused', '2026-11-20', { status: 'paused' }),
        sub('cancelled', '2026-11-20', { status: 'cancelled' }),
        sub('eur', '2026-11-20', { currency: 'EUR', amount: 4 }),
      ],
    });
    const result = selectComingUp(data, NOW);
    expect(result.items.map((item) => [item.id, item.daysUntil])).toEqual([
      ['today', 0],
      ['eur', 4],
      ['edge', 14],
    ]);
    expect(result.to).toBe('2026-11-30');
    expect(result.needsReview).toBe(1);
    expect(result.total).toBe(10 + 20 + 10);
    expect(result.items[1]).toMatchObject({ amount: 4, currency: 'EUR', amountDisplay: 20 });
    expect(result.href).toBe('/app/activity/subscriptions');
  });

  it('crosses a year boundary and reports plans it cannot convert', () => {
    const data = workspace({
      subscriptions: [
        sub('a', '2027-01-05'),
        sub('g', '2027-01-02', { currency: 'GBP', amount: 7 }),
      ],
    });
    const result = selectComingUp(data, '2026-12-25');
    expect(result.items.map((item) => item.id)).toEqual(['g', 'a']);
    expect(result.items[0].amountDisplay).toBeNull();
    expect(result.total).toBe(10);
    expect(result.unconverted).toEqual([{ currency: 'GBP', amount: 7, count: 1 }]);
  });
});

describe('selectNeedsAttention', () => {
  it('is empty when nothing needs attention', () => {
    expect(selectNeedsAttention(workspace(), NOW)).toEqual([]);
    expect(selectNeedsAttention(workspace(), 'bad')).toEqual([]);
    expect(selectNeedsAttention(undefined, NOW)).toEqual([]);
  });

  it('counts uncategorised debits but not manual ones or other categories', () => {
    const data = workspace({
      transactions: [
        txn('2026-11-01', -1, { cat: 'Other' }),
        txn('2026-11-02', -1, { cat: 'Other' }),
        txn('2026-11-03', -1, { cat: 'Other', categorySource: 'manual' }),
        txn('2026-11-03', -1, { cat: 'Other', manualCat: 'Other' }),
        txn('2026-11-04', 1, { cat: 'Other' }),
        txn('2026-11-05', -1, { cat: 'Shopping' }),
      ],
    });
    expect(selectNeedsAttention(data, NOW)).toEqual([
      { id: 'uncategorised', count: 2, severity: 'low', href: '/app/insights/vendors#mappings' },
    ]);
  });

  it('flags balances older than 35 days: 35 is fine, 36 is stale', () => {
    // Balance month 2026-09 ends 2026-09-30. 35 days later is 2026-11-04.
    const data = workspace({ accounts: [account('a', { '2026-09': 1 })] });
    expect(selectNeedsAttention(data, '2026-11-04')).toEqual([]);
    const stale = selectNeedsAttention(data, '2026-11-05');
    expect(stale).toEqual([
      {
        id: 'stale-balances',
        count: 1,
        severity: 'medium',
        href: '/app/accounts/balances',
        accounts: [{ id: 'a', name: 'Account a', lastDate: '2026-09-30', ageDays: 36 }],
      },
    ]);
  });

  it('uses the reconciliation date when it is newer, and skips accounts without balances', () => {
    const data = workspace({
      accounts: [
        account('old', { '2026-01': 1 }, { reconciledOn: '2026-11-01' }),
        account('stale', { '2026-01': 1 }, { reconciledOn: '2026-02-01' }),
        account('empty', {}),
        account('current', { '2026-11': 1 }),
      ],
    });
    const [item] = selectNeedsAttention(data, NOW);
    expect(item.accounts.map((entry) => entry.id)).toEqual(['stale']);
    expect(item.accounts[0].lastDate).toBe('2026-02-01');
  });

  it('adds a backup item only when a backup time is supplied and older than 35 days', () => {
    const at = (date) => Date.parse(`${date}T12:00:00Z`);
    expect(selectNeedsAttention(workspace(), NOW)).toEqual([]);
    expect(selectNeedsAttention(workspace(), NOW, { lastBackupAt: at('2026-10-12') })).toEqual([]);
    expect(selectNeedsAttention(workspace(), NOW, { lastBackupAt: at('2026-10-11') })).toEqual([
      {
        id: 'backup-age',
        value: 36,
        count: 1,
        severity: 'medium',
        href: '/app/import',
      },
    ]);
  });

  it('flags suspect-currency import batches first, using the Phase 0.2 audit', () => {
    const data = workspace({
      transactions: [
        txn('2026-11-01', -1, {
          importBatchId: 'b1',
          amountSource: 'amount',
          currencySource: 'currency_payment',
        }),
        txn('2026-11-02', -1, { cat: 'Other' }),
      ],
      importMeta: {
        latestSummary: null,
        history: [
          {
            batchId: 'b1',
            detectedProfileId: 'revolut-personal-raw',
            detectedProfileLabel: 'Revolut',
            status: 'active',
            importedAt: 1,
          },
        ],
      },
    });
    expect(selectNeedsAttention(data, NOW).map((item) => [item.id, item.severity])).toEqual([
      ['suspect-currency', 'high'],
      ['uncategorised', 'low'],
    ]);
    expect(selectNeedsAttention(data, NOW)[0]).toMatchObject({ count: 1, href: '/app/import' });
  });
});

describe('routes', () => {
  it('come from navigation.js, not invented', () => {
    expect(DASHBOARD_ROUTES).toEqual({
      transactions: '/app/activity/transactions',
      balances: '/app/accounts/balances',
      mappings: '/app/insights/vendors#mappings',
      subscriptions: '/app/activity/subscriptions',
      importAndBackup: '/app/import',
    });
  });
});
