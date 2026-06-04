import { describe, expect, it } from 'vitest';
import { detectRecurringTransactions } from '../lib/recurring';

describe('detectRecurringTransactions', () => {
  it('detects stable monthly charges', () => {
    const recurring = detectRecurringTransactions([
      { date: '2024-01-05', desc: 'Netflix', cat: 'Subscriptions', amt: -50, flow: 'Debit', currency: 'RON' },
      { date: '2024-02-05', desc: 'Netflix', cat: 'Subscriptions', amt: -49.5, flow: 'Debit', currency: 'RON' },
      { date: '2024-03-06', desc: 'Netflix', cat: 'Subscriptions', amt: -50.1, flow: 'Debit', currency: 'RON' },
      { date: '2024-01-10', desc: 'Coffee', cat: 'Food & Dining', amt: -12, flow: 'Debit', currency: 'RON' },
    ]);

    expect(recurring).toHaveLength(1);
    expect(recurring[0].label).toBe('Netflix');
    expect(recurring[0].avgInterval).toBeGreaterThanOrEqual(28);
    expect(recurring[0].currency).toBe('RON');
  });
});
