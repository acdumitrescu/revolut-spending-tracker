import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyK, formatPercentage, CAT_COLORS, EXPENSE_CATS, getColorForCategory } from '../lib/utils';
import { convertAmount, convertAmountToDisplay, getEffectiveCurrency } from '../lib/fx';

describe('formatCurrency', () => {
  it('formats positive numbers as RON currency', () => {
    const result = formatCurrency(1500, 'RON');
    expect(result).toContain('1.500');
  });

  it('formats zero', () => {
    const result = formatCurrency(0, 'RON');
    expect(result).toContain('0');
  });

  it('formats negative numbers', () => {
    const result = formatCurrency(-500, 'RON');
    expect(result).toContain('500');
  });

  it('handles decimal values with rounding', () => {
    const result = formatCurrency(1234.56, 'RON');
    expect(result).toBeDefined();
  });

  it('supports alternate display currencies', () => {
    const result = formatCurrency(100, 'USD');
    expect(result).toContain('$');
  });
});

describe('formatCurrencyK', () => {
  it('formats values >= 1000 with k suffix', () => {
    expect(formatCurrencyK(1500, 'RON')).toBe('1.5k RON');
  });

  it('formats values < 1000 as rounded integers', () => {
    expect(formatCurrencyK(500, 'RON')).toBe('500 RON');
  });

  it('handles exactly 1000', () => {
    expect(formatCurrencyK(1000, 'RON')).toBe('1.0k RON');
  });
});

describe('formatPercentage', () => {
  it('calculates percentage correctly', () => {
    expect(formatPercentage(25, 100)).toBe('25.0%');
  });

  it('returns 0% when total is zero', () => {
    expect(formatPercentage(25, 0)).toBe('0%');
  });

  it('handles values greater than 100%', () => {
    expect(formatPercentage(150, 100)).toBe('150.0%');
  });
});

describe('CAT_COLORS', () => {
  it('has colors for all essential categories', () => {
    expect(CAT_COLORS['Shopping']).toBeDefined();
    expect(CAT_COLORS['Groceries']).toBeDefined();
    expect(CAT_COLORS['Income']).toBeDefined();
  });
});

describe('EXPENSE_CATS', () => {
  it('is a Set containing expense categories', () => {
    expect(EXPENSE_CATS.has('Groceries')).toBe(true);
    expect(EXPENSE_CATS.has('Income')).toBe(false);
  });
});

describe('getColorForCategory', () => {
  it('returns the right color for known categories', () => {
    expect(getColorForCategory('Shopping')).toBe(CAT_COLORS['Shopping']);
  });

  it('returns a default color for unknown categories', () => {
    const color = getColorForCategory('UnknownCategory');
    expect(color).toBe('#64748B');
  });
});

describe('fx helpers', () => {
  it('converts RON to EUR through the shared rates table', () => {
    expect(convertAmount(500, 'RON', 'EUR', { EUR: 5, USD: 4.6 })).toBe(100);
  });

  it('converts EUR to USD through RON', () => {
    expect(convertAmount(10, 'EUR', 'USD', { EUR: 5, USD: 4 })).toBe(12.5);
  });

  it('defaults missing transaction currency to RON', () => {
    expect(getEffectiveCurrency({ amt: 10 })).toBe('RON');
  });

  it('formats converted display amounts', () => {
    const result = formatCurrency(convertAmountToDisplay(500, 'RON', 'EUR', { EUR: 5, USD: 4.6 }), 'EUR');
    expect(result).toContain('100');
  });
});
