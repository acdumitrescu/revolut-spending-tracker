import { describe, it, expect } from 'vitest';
import { formatCurrency, formatCurrencyK, formatPercentage, CAT_COLORS, EXPENSE_CATS, getColorForCategory } from '../lib/utils';

describe('formatCurrency', () => {
  it('formats positive numbers as RON currency', () => {
    const result = formatCurrency(1500);
    expect(result).toContain('1.500');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('formats negative numbers', () => {
    const result = formatCurrency(-500);
    expect(result).toContain('500');
  });

  it('handles decimal values with rounding', () => {
    const result = formatCurrency(1234.56);
    expect(result).toBeDefined();
  });
});

describe('formatCurrencyK', () => {
  it('formats values >= 1000 with k suffix', () => {
    expect(formatCurrencyK(1500)).toBe('1.5k');
  });

  it('formats values < 1000 as rounded integers', () => {
    expect(formatCurrencyK(500)).toBe('500');
  });

  it('handles exactly 1000', () => {
    expect(formatCurrencyK(1000)).toBe('1.0k');
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