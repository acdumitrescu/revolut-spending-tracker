import { describe, expect, it } from 'vitest';
import {
  getAccountTotalsByMonth,
  getAccountCurrency,
  getAccountEntryMonths,
  getLatestAccountTotalsByCurrency,
  getBudgetEntries,
  getBudgetComparison,
  getBudgetSummary,
  getRolling12MonthSummary,
  getCurrencySummary,
  getDailySpend,
  filterTransactionsByPeriod,
  getLatestMonth,
  getMonthlyExpense,
  getMonthlyIncome,
  getMonthlySummary,
  getPortfolioSummary,
  getUniqueYears,
  shiftMonth,
} from '../lib/selectors';

const transactions = [
  { date: '2024-01-01', ym: '2024-01', desc: 'Salary', cat: 'Income', sub: 'Income', amt: 5000, flow: 'Credit', type: 'Bank Transfer' },
  { date: '2024-01-02', ym: '2024-01', desc: 'Uber', cat: 'Transport', sub: 'Taxi', amt: -50, flow: 'Debit', type: 'Card Payment' },
  { date: '2024-01-03', ym: '2024-01', desc: 'Refund', cat: 'Refunds', sub: 'Refunds', amt: 20, flow: 'Credit', type: 'Refund' },
  { date: '2024-02-01', ym: '2024-02', desc: 'Salary', cat: 'Income', sub: 'Income', amt: 5500, flow: 'Credit', type: 'Bank Transfer' },
  { date: '2024-02-04', ym: '2024-02', desc: 'Groceries', cat: 'Groceries', sub: 'Food', amt: -100, flow: 'Debit', type: 'Card Payment' },
];

describe('selectors', () => {
  it('finds the latest month', () => {
    expect(getLatestMonth(transactions)).toBe('2024-02');
  });

  it('calculates monthly income and expense with refunds excluded from income', () => {
    expect(getMonthlyIncome(transactions, '2024-01')).toBe(5000);
    expect(getMonthlyExpense(transactions, '2024-01')).toBe(30);
  });

  it('builds monthly summaries', () => {
    expect(getMonthlySummary(transactions)).toEqual([
      { month: '2024-01', inc: 5000, exp: 30, net: 4970 },
      { month: '2024-02', inc: 5500, exp: 100, net: 5400 },
    ]);
  });

  it('builds a rolling 12-month summary ending with the provided current month', () => {
    expect(getRolling12MonthSummary(transactions, new Date('2024-06-15'))).toEqual([
      { month: '2023-07', inc: 0, exp: 0, net: 0 },
      { month: '2023-08', inc: 0, exp: 0, net: 0 },
      { month: '2023-09', inc: 0, exp: 0, net: 0 },
      { month: '2023-10', inc: 0, exp: 0, net: 0 },
      { month: '2023-11', inc: 0, exp: 0, net: 0 },
      { month: '2023-12', inc: 0, exp: 0, net: 0 },
      { month: '2024-01', inc: 5000, exp: 30, net: 4970 },
      { month: '2024-02', inc: 5500, exp: 100, net: 5400 },
      { month: '2024-03', inc: 0, exp: 0, net: 0 },
      { month: '2024-04', inc: 0, exp: 0, net: 0 },
      { month: '2024-05', inc: 0, exp: 0, net: 0 },
      { month: '2024-06', inc: 0, exp: 0, net: 0 },
    ]);
  });

  it('builds daily spend entries for the whole month', () => {
    const days = getDailySpend(transactions, '2024-01');
    expect(days).toHaveLength(31);
    expect(days.find((day) => day.date === '2024-01-02')?.spendNet).toBe(50);
    expect(days.find((day) => day.date === '2024-01-03')?.refunds).toBe(20);
  });

  it('aggregates account balances by month', () => {
    const balances = getAccountTotalsByMonth([
      { id: '1', name: 'A', currency: 'RON', balances: { '2024-01': 1000, '2024-02': 1200 } },
      { id: '2', name: 'B', currency: 'RON', balances: { '2024-02': 400 } },
    ]);
    expect(balances).toEqual([
      { month: '2024-01', total: 1000 },
      { month: '2024-02', total: 1600 },
    ]);
  });

  it('converts multicurrency account balances into the selected display currency', () => {
    const balances = getAccountTotalsByMonth([
      { id: '1', name: 'RON Savings', currency: 'RON', balances: { '2024-02': 1000 } },
      { id: '2', name: 'EUR Vault', currency: 'EUR', balances: { '2024-02': 100 } },
    ], { displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4.6 } });
    expect(balances).toEqual([
      { month: '2024-02', total: 1500 },
    ]);
  });

  it('summarizes each currency using every account latest recorded balance', () => {
    expect(getLatestAccountTotalsByCurrency([
      { id: '1', name: 'USD Broker', currency: 'USD', balances: { '2026-08': 100, '2026-09': 120 } },
      { id: '2', name: 'USD Cash', currency: 'USD', balances: { '2026-08': 20 } },
      { id: '3', name: 'RON Bank', currency: 'RON', balances: { '2026-09': 500 } },
    ])).toEqual([
      { currency: 'RON', total: 500, accounts: 1 },
      { currency: 'USD', total: 140, accounts: 2 },
    ]);
  });

  it('shows account-entry months from the earliest saved month through December', () => {
    expect(getAccountEntryMonths([
      { balances: { '2026-08': 100, '2026-09': 120 }, notes: {} },
    ], new Date('2026-09-26T00:00:00Z'))).toEqual([
      '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
  });

  it('defaults missing account currency to RON', () => {
    expect(getAccountCurrency({ name: 'Legacy', balances: {} })).toBe('RON');
  });

  it('builds month-aware budget entries', () => {
    const entries = getBudgetEntries({ '2024-02': { Groceries: 500 } }, '2024-02', transactions);
    expect(entries[0]).toMatchObject({
      cat: 'Groceries',
      budgeted: 500,
      spent: 100,
      remaining: 400,
      over: false,
    });
  });

  it('moves between planning months across year boundaries', () => {
    expect(shiftMonth('2024-01', -1)).toBe('2023-12');
    expect(shiftMonth('2024-12', 1)).toBe('2025-01');
  });

  it('supports empty future plans without inventing income', () => {
    expect(getBudgetSummary({}, '2030-01', [])).toEqual({
      importedIncome: 0,
      assigned: 0,
      totalSpending: 0,
      plannedCategorySpending: 0,
      remaining: 0,
      unbudgetedSpending: 0,
      unassignedIncome: null,
    });
  });

  it('summarizes refunds, custom plans, overspend, and mixed currencies', () => {
    const mixedTransactions = [
      { date: '2024-03-01', ym: '2024-03', desc: 'Salary', cat: 'Income', sub: '', amt: 100, flow: 'Credit', type: 'Bank Transfer', currency: 'EUR' },
      { date: '2024-03-02', ym: '2024-03', desc: 'Groceries', cat: 'Groceries', sub: '', amt: -30, flow: 'Debit', type: 'Card Payment', currency: 'USD' },
      { date: '2024-03-03', ym: '2024-03', desc: 'Other spending', cat: 'Other', sub: '', amt: -50, flow: 'Debit', type: 'Card Payment', currency: 'RON' },
      { date: '2024-03-04', ym: '2024-03', desc: 'Refund', cat: 'Refunds', sub: '', amt: 10, flow: 'Credit', type: 'Refund', currency: 'RON' },
      { date: '2024-03-05', ym: '2024-03', desc: 'Pet supplies', cat: 'Pet fund', sub: '', amt: -20, flow: 'Debit', type: 'Card Payment', currency: 'RON' },
    ];
    const budgets = { '2024-03': { Groceries: 100, 'Pet fund': 50 } };
    const options = { displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4 } };

    expect(getBudgetSummary(budgets, '2024-03', mixedTransactions, options)).toEqual({
      importedIncome: 500,
      assigned: 150,
      totalSpending: 180,
      plannedCategorySpending: 140,
      remaining: 10,
      unbudgetedSpending: 40,
      unassignedIncome: 350,
    });
    expect(getBudgetEntries(budgets, '2024-03', mixedTransactions, options)).toEqual([
      expect.objectContaining({ cat: 'Groceries', budgeted: 100, spent: 120, remaining: -20, over: true }),
      expect.objectContaining({ cat: 'Pet fund', budgeted: 50, spent: 20, remaining: 30, over: false }),
    ]);
  });

  it('leaves unassigned income unavailable when a month has no imported income', () => {
    const summary = getBudgetSummary(
      { '2024-04': { Groceries: 500 } },
      '2024-04',
      [{ date: '2024-04-01', ym: '2024-04', desc: 'Groceries', cat: 'Groceries', sub: '', amt: -600, flow: 'Debit', type: 'Card Payment' }]
    );
    expect(summary.unassignedIncome).toBeNull();
    expect(summary.remaining).toBe(-100);
  });

  it('compares monthly budget totals and planned categories', () => {
    const comparisonTransactions = [
      { date: '2024-04-01', ym: '2024-04', desc: 'Salary', cat: 'Income', sub: '', amt: 1000, flow: 'Credit', type: 'Bank Transfer' },
      { date: '2024-04-02', ym: '2024-04', desc: 'Groceries', cat: 'Groceries', sub: '', amt: -80, flow: 'Debit', type: 'Card Payment' },
      { date: '2024-04-03', ym: '2024-04', desc: 'Utilities', cat: 'Utilities', sub: '', amt: -100, flow: 'Debit', type: 'Bank Transfer' },
      { date: '2024-05-01', ym: '2024-05', desc: 'Salary', cat: 'Income', sub: '', amt: 1200, flow: 'Credit', type: 'Bank Transfer' },
      { date: '2024-05-02', ym: '2024-05', desc: 'Groceries', cat: 'Groceries', sub: '', amt: -120, flow: 'Debit', type: 'Card Payment' },
      { date: '2024-05-03', ym: '2024-05', desc: 'Pet supplies', cat: 'Pet fund', sub: '', amt: -20, flow: 'Debit', type: 'Card Payment' },
      { date: '2024-05-04', ym: '2024-05', desc: 'Unplanned', cat: 'Other', sub: '', amt: -30, flow: 'Debit', type: 'Card Payment' },
    ];
    const comparison = getBudgetComparison({
      '2024-04': { Groceries: 100, Utilities: 200 },
      '2024-05': { Groceries: 150, 'Pet fund': 50 },
    }, '2024-05', comparisonTransactions);

    expect(comparison.deltas).toEqual({
      importedIncome: 200,
      assigned: -100,
      totalSpending: -10,
      plannedCategorySpending: -40,
      remaining: -60,
      unbudgetedSpending: 30,
      unassignedIncome: 300,
    });
    expect(comparison.categories).toEqual([
      expect.objectContaining({ category: 'Groceries', assignedDelta: 50, spendingDelta: 40 }),
      expect.objectContaining({ category: 'Pet fund', assignedDelta: 50, spendingDelta: 20 }),
      expect.objectContaining({ category: 'Utilities', assignedDelta: -200, spendingDelta: -100 }),
    ]);
  });

  it('does not invent an unassigned-income delta for empty comparison months', () => {
    expect(getBudgetComparison({}, '2030-01', []).deltas.unassignedIncome).toBeNull();
  });

  it('detects mixed currencies safely', () => {
    const summary = getCurrencySummary([
      { currency: 'RON' },
      { currency: 'EUR' },
      { currency: 'RON' },
    ]);
    expect(summary.hasMixedCurrencies).toBe(true);
    expect(summary.currencies).toEqual(['EUR', 'RON']);
  });

  it('builds unique year filters in descending order', () => {
    expect(getUniqueYears(transactions)).toEqual(['2024']);
  });

  it('filters transactions by selected year', () => {
    const filtered = filterTransactionsByPeriod([
      ...transactions,
      { date: '2023-12-01', ym: '2023-12', desc: 'Legacy', cat: 'Groceries', sub: 'Food', amt: -20, flow: 'Debit', type: 'Card Payment' },
    ], 'ALL TIME', '2024');

    expect(filtered).toHaveLength(transactions.length);
    expect(filtered.every((txn) => txn.date.startsWith('2024'))).toBe(true);
  });

  it('converts transaction summaries into the selected display currency', () => {
    const mixedTransactions = [
      { date: '2024-01-01', ym: '2024-01', desc: 'Salary', cat: 'Income', sub: 'Income', amt: 5000, flow: 'Credit', type: 'Bank Transfer', currency: 'RON' },
      { date: '2024-01-02', ym: '2024-01', desc: 'Freelance', cat: 'Income', sub: 'Income', amt: 100, flow: 'Credit', type: 'Bank Transfer', currency: 'EUR' },
      { date: '2024-01-03', ym: '2024-01', desc: 'Groceries', cat: 'Groceries', sub: 'Food', amt: -50, flow: 'Debit', type: 'Card Payment', currency: 'USD' },
    ];
    const summary = getMonthlySummary(mixedTransactions, { displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4 } });
    expect(summary).toEqual([
      { month: '2024-01', inc: 5500, exp: 200, net: 5300 },
    ]);
  });

  it('converts RON budgets into the selected display currency', () => {
    const entries = getBudgetEntries(
      { '2024-02': { Groceries: 500 } },
      '2024-02',
      transactions,
      { displayCurrency: 'EUR', fxRates: { EUR: 5, USD: 4.6 } }
    );
    expect(entries[0]).toMatchObject({
      budgeted: 100,
      spent: 20,
      remaining: 80,
    });
  });

  it('does not count transfers, savings top-ups, or cash movement as monthly expenses', () => {
    const trustTransactions = [
      { date: '2024-03-01', ym: '2024-03', desc: 'Transfer out', cat: 'Transfers', sub: 'Transfers', amt: -500, flow: 'Debit', type: 'Bank Transfer' },
      { date: '2024-03-02', ym: '2024-03', desc: 'Top up', cat: 'Savings', sub: 'Top Up', amt: -300, flow: 'Debit', type: 'Top Up' },
      { date: '2024-03-03', ym: '2024-03', desc: 'ATM', cat: 'Cash', sub: 'Cash Withdrawal', amt: -100, flow: 'Debit', type: 'Cash Withdrawal' },
      { date: '2024-03-04', ym: '2024-03', desc: 'Groceries', cat: 'Groceries', sub: 'Food', amt: -80, flow: 'Debit', type: 'Card Payment' },
    ];
    expect(getMonthlyExpense(trustTransactions, '2024-03')).toBe(180);
  });

  it('defaults missing transaction currency to RON during summary conversion', () => {
    const summary = getMonthlySummary([
      { date: '2024-04-01', ym: '2024-04', desc: 'Legacy salary', cat: 'Income', sub: 'Income', amt: 1000, flow: 'Credit', type: 'Bank Transfer' },
      { date: '2024-04-02', ym: '2024-04', desc: 'Legacy food', cat: 'Groceries', sub: 'Food', amt: -100, flow: 'Debit', type: 'Card Payment' },
    ], { displayCurrency: 'EUR', fxRates: { EUR: 5, USD: 4.6 } });

    expect(summary).toEqual([
      { month: '2024-04', inc: 200, exp: 20, net: 180 },
    ]);
  });

  it('blocks aggregates when a transaction currency has no FX rate', () => {
    const unsupportedCurrency = [{
      date: '2024-04-01',
      ym: '2024-04',
      desc: 'Synthetic GBP purchase',
      cat: 'Groceries',
      sub: 'Food',
      amt: -10,
      flow: 'Debit',
      type: 'Card Payment',
      currency: 'GBP',
    }];

    expect(() => getMonthlySummary(
      unsupportedCurrency,
      { displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4.6 } }
    )).toThrow('Missing FX rate for GBP');
  });

  it('summarizes synthetic manual portfolio holdings across currencies', () => {
    const summary = getPortfolioSummary([
      { id: 'ron', ticker: 'RONX', name: 'RON Holding', assetClass: 'Stock', quantity: 2, avgCost: 100, currentPrice: 120, currency: 'RON' },
      { id: 'eur', ticker: 'EURX', name: 'EUR Holding', assetClass: 'ETF', quantity: 1, avgCost: 10, currentPrice: 12, currency: 'EUR' },
    ], { displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4.6 } });

    expect(summary.totalMarketValue).toBe(300);
    expect(summary.totalCostBasis).toBe(250);
    expect(summary.unrealizedGainLoss).toBe(50);
    expect(summary.byAssetClass).toEqual({ Stock: 240, ETF: 60 });
  });
});
