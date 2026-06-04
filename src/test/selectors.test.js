import { describe, expect, it } from 'vitest';
import {
  getAccountTotalsByMonth,
  getBudgetEntries,
  getCurrencySummary,
  getDailySpend,
  getLatestMonth,
  getMonthlyExpense,
  getMonthlyIncome,
  getMonthlySummary,
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

  it('builds daily spend entries for the whole month', () => {
    const days = getDailySpend(transactions, '2024-01');
    expect(days).toHaveLength(31);
    expect(days.find((day) => day.date === '2024-01-02')?.spendNet).toBe(50);
    expect(days.find((day) => day.date === '2024-01-03')?.refunds).toBe(20);
  });

  it('aggregates account balances by month', () => {
    const balances = getAccountTotalsByMonth([
      { id: '1', name: 'A', balances: { '2024-01': 1000, '2024-02': 1200 }, monthlyContribution: 100 },
      { id: '2', name: 'B', balances: { '2024-02': 400 }, monthlyContribution: 50 },
    ]);
    expect(balances).toEqual([
      { month: '2024-01', total: 1000 },
      { month: '2024-02', total: 1600 },
    ]);
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

  it('detects mixed currencies safely', () => {
    const summary = getCurrencySummary([
      { currency: 'RON' },
      { currency: 'EUR' },
      { currency: 'RON' },
    ]);
    expect(summary.hasMixedCurrencies).toBe(true);
    expect(summary.currencies).toEqual(['EUR', 'RON']);
  });
});
