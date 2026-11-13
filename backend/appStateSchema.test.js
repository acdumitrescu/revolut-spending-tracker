import { describe, expect, it } from 'vitest';
import { TransactionSchema } from './appStateSchema.js';

describe('TransactionSchema', () => {
  it('keeps the original-currency field of a manual currency override (unknown keys are otherwise stripped)', () => {
    const parsed = TransactionSchema.parse({
      date: '2026-10-26',
      desc: 'Shop',
      cat: 'Shopping',
      sub: '',
      amt: 20,
      flow: 'Debit',
      type: 'card',
      ym: '2026-10',
      currency: 'EUR',
      baseCurrency: 'RON',
    });
    expect(parsed.baseCurrency).toBe('RON');
  });

  it('keeps the recorded amount and currency source columns', () => {
    const parsed = TransactionSchema.parse({
      date: '2026-10-26',
      desc: 'Shop',
      cat: 'Shopping',
      sub: '',
      amt: 20,
      flow: 'Debit',
      type: 'card',
      ym: '2026-10',
      currency: 'EUR',
      amountSource: 'amount',
      currencySource: 'currency_payment',
    });
    expect(parsed.amountSource).toBe('amount');
    expect(parsed.currencySource).toBe('currency_payment');
  });
});
