import { describe, expect, it } from 'vitest';
import {
  convertAmount,
  getEffectiveCurrency,
  getRateForCurrency,
  normalizeFxRates,
} from '../lib/fx';

describe('fx rules', () => {
  it('normalizes currency codes from strings and transactions, defaulting to RON', () => {
    expect(getEffectiveCurrency(' eur ')).toBe('EUR');
    expect(getEffectiveCurrency({ currency: 'usd' })).toBe('USD');
    expect(getEffectiveCurrency({})).toBe('RON');
    expect(getEffectiveCurrency('')).toBe('RON');
  });

  it('ignores invalid rates and keeps the defaults', () => {
    const rates = normalizeFxRates({ EUR: -1, USD: 'abc', GBP: 5 });
    expect(rates.EUR).toBeGreaterThan(0);
    expect(rates.USD).toBeGreaterThan(0);
    expect(rates.GBP).toBeUndefined();
    expect(normalizeFxRates(null)).toEqual(normalizeFxRates(undefined));
  });

  it('treats a non-numeric amount as zero', () => {
    expect(convertAmount('not a number', 'EUR', 'RON')).toBe(0);
  });

  it('blocks a conversion when a rate is missing instead of guessing', () => {
    expect(getRateForCurrency('GBP')).toBeNull();
    expect(() => convertAmount(10, 'GBP', 'RON')).toThrow(/Missing FX rate for GBP/);
    expect(() => convertAmount(10, 'RON', 'GBP')).toThrow(/Missing FX rate for GBP/);
  });
});
