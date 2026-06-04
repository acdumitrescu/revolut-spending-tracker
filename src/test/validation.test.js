import { describe, it, expect } from 'vitest';
import { TransactionSchema, AppDataSchema, sanitizeAppData } from '../lib/validation';

describe('TransactionSchema', () => {
  const base = { date: '2024-01-15', desc: 'Uber', cat: 'Transport', sub: 'Taxi', amt: -15, flow: 'Debit', type: 'TOP_UP', ym: '2024-01', currency: 'RON', ref: 'abc' };

  it('validates a correct transaction', () => {
    expect(TransactionSchema.safeParse(base).success).toBe(true);
  });

  it('rejects missing date', () => {
    const { ...noDate } = base;
    delete noDate.date;
    expect(TransactionSchema.safeParse(noDate).success).toBe(false);
  });

  it('rejects invalid ym format', () => {
    expect(TransactionSchema.safeParse({ ...base, ym: '2024-13' }).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...base, ym: 'invalid' }).success).toBe(false);
  });

  it('rejects invalid flow value', () => {
    expect(TransactionSchema.safeParse({ ...base, flow: 'Other' }).success).toBe(false);
  });

  it('rejects non-number amt', () => {
    expect(TransactionSchema.safeParse({ ...base, amt: '15' }).success).toBe(false);
  });
});

describe('AppDataSchema', () => {
  it('validates valid app data', () => {
    const data = {
      transactions: [],
      customVendors: { uber: ['Transport', 'Taxi'] },
      accounts: [{ id: '1', name: 'Bank', balances: { '2024-01': 1000 }, monthlyContribution: 500 }],
      budgets: { '2024-01': { Groceries: 1200 } },
      goals: [{ id: 'goal-1', name: 'Emergency Fund', targetAmount: 10000, targetMonth: '2024-12' }],
      displayCurrency: 'EUR',
      lastUpdated: 1705312800000,
    };
    expect(AppDataSchema.safeParse(data).success).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(AppDataSchema.safeParse({}).success).toBe(false);
  });
});

describe('sanitizeAppData', () => {
  it('returns valid data unchanged', () => {
    const data = {
      transactions: [],
      customVendors: {},
      accounts: [],
      budgets: {},
      goals: [],
      displayCurrency: 'RON',
      lastUpdated: null,
    };
    expect(sanitizeAppData(data)).toEqual(data);
  });

  it('filters out invalid transactions', () => {
    const data = {
      transactions: [
        { date: '2024-01-15', desc: 'A', cat: 'X', sub: 'Y', amt: 10, flow: 'Credit', type: 'Z', ym: '2024-01' },
        { date: '', desc: 'B' },
      ],
      customVendors: {},
      accounts: [],
      goals: [],
      displayCurrency: 'RON',
      lastUpdated: null,
    };
    const result = sanitizeAppData(data);
    expect(result.transactions).toHaveLength(1);
  });

  it('falls back gracefully on garbage input', () => {
    const result = sanitizeAppData('garbage');
    expect(result.transactions).toEqual([]);
    expect(result.customVendors).toEqual({});
    expect(result.accounts).toEqual([]);
  });

  it('preserves valid data on mixed input', () => {
    const data = {
      transactions: [{ date: '2024-01', desc: 'A', cat: 'X', sub: 'Y', amt: 10, flow: 'Credit', type: 'Z', ym: '2024-01' }],
      customVendors: { test: ['Cat', 'Sub'] },
      accounts: [],
      goals: [],
      displayCurrency: 'USD',
      lastUpdated: 12345,
    };
    const result = sanitizeAppData(data);
    expect(result.lastUpdated).toBe(12345);
    expect(result.displayCurrency).toBe('USD');
  });

  it('migrates legacy flat budgets to the latest month', () => {
    const data = {
      transactions: [
        { date: '2024-01-15', desc: 'A', cat: 'Groceries', sub: 'Food', amt: -20, flow: 'Debit', type: 'CARD', ym: '2024-01' },
        { date: '2024-02-15', desc: 'B', cat: 'Shopping', sub: 'Other', amt: -50, flow: 'Debit', type: 'CARD', ym: '2024-02' },
      ],
      customVendors: {},
      accounts: [],
      budgets: { Groceries: 800 },
      lastUpdated: null,
    };
    const result = sanitizeAppData(data);
    expect(result.budgets).toEqual({ '2024-02': { Groceries: 800 } });
  });

  it('preserves account monthly contributions', () => {
    const data = {
      transactions: [],
      customVendors: {},
      accounts: [{ id: '1', name: 'Bank', balances: {}, monthlyContribution: 250 }],
      budgets: {},
      goals: [],
      displayCurrency: 'RON',
      lastUpdated: null,
    };
    const result = sanitizeAppData(data);
    expect(result.accounts[0].monthlyContribution).toBe(250);
  });
}); 
