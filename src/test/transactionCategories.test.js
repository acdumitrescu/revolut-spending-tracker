import { describe, expect, it } from 'vitest';
import {
  compileCustomVendorMappings,
  resolveTransactionCategories,
  resolveTransactionCategory,
} from '../lib/transactionCategories';

const baseTransaction = {
  date: '2026-06-01',
  ym: '2026-06',
  desc: 'Mega Image Bucuresti',
  cat: 'Groceries',
  sub: 'Supermarket',
  baseCat: 'Groceries',
  baseSub: 'Supermarket',
  amt: -42,
  flow: 'Debit',
  type: 'Card Payment',
  currency: 'RON',
  matchSource: 'built-in-contains',
};

describe('effective transaction categories', () => {
  it('applies a saved custom mapping to existing transactions immediately', () => {
    const [resolved] = resolveTransactionCategories([baseTransaction], {
      'mega image': ['Shopping', 'Household'],
    });

    expect(resolved.cat).toBe('Shopping');
    expect(resolved.sub).toBe('Household');
    expect(resolved.categorySource).toBe('custom');
  });

  it('keeps a manual transaction edit above a vendor mapping', () => {
    const resolved = resolveTransactionCategory({
      ...baseTransaction,
      manualCat: 'Health',
      manualSub: 'Nutrition',
    }, {
      'mega image': ['Shopping', 'Household'],
    });

    expect(resolved.cat).toBe('Health');
    expect(resolved.sub).toBe('Nutrition');
    expect(resolved.categorySource).toBe('manual');
  });

  it('preserves legacy manual edits that predate explicit provenance fields', () => {
    const resolved = resolveTransactionCategory({
      ...baseTransaction,
      cat: 'Health',
      sub: 'Nutrition',
      baseCat: undefined,
      baseSub: undefined,
    }, {
      'mega image': ['Shopping', 'Household'],
    });

    expect(resolved.cat).toBe('Health');
    expect(resolved.sub).toBe('Nutrition');
    expect(resolved.baseCat).toBe('Groceries');
    expect(resolved.categorySource).toBe('manual');
  });

  it('falls back to the base category after a custom mapping is removed', () => {
    const resolved = resolveTransactionCategory({
      ...baseTransaction,
      cat: 'Shopping',
      sub: 'Household',
      matchSource: 'custom',
    }, {});

    expect(resolved.cat).toBe('Groceries');
    expect(resolved.sub).toBe('Supermarket');
    expect(resolved.categorySource).not.toBe('custom');
  });

  it('does not let a vendor mapping reclassify a system transfer', () => {
    const resolved = resolveTransactionCategory({
      ...baseTransaction,
      desc: 'Transfer to Mega Image',
      cat: 'Transfers',
      sub: 'Transfers',
      baseCat: 'Transfers',
      baseSub: 'Transfers',
      type: 'Bank Transfer',
    }, {
      'mega image': ['Shopping', 'Household'],
    });

    expect(resolved.cat).toBe('Transfers');
    expect(resolved.categorySource).not.toBe('custom');
  });

  it('prefers the longest matching custom vendor alias', () => {
    const resolved = resolveTransactionCategory({
      ...baseTransaction,
      desc: 'Fresh Market Bucuresti',
    }, {
      fresh: ['Shopping', 'General'],
      'fresh market': ['Groceries', 'Supermarket'],
    });

    expect(resolved.cat).toBe('Groceries');
    expect(resolved.sub).toBe('Supermarket');
    expect(resolved.matchedVendor).toBe('fresh market');
  });

  it('keeps an imported category when no manual or custom override applies', () => {
    const resolved = resolveTransactionCategory({
      ...baseTransaction,
      desc: 'Synthetic Neighborhood Merchant',
      cat: 'Fees',
      sub: 'Service Fee',
      baseCat: undefined,
      baseSub: undefined,
      matchSource: 'none',
    });

    expect(resolved.cat).toBe('Fees');
    expect(resolved.sub).toBe('Service Fee');
    expect(resolved.categorySource).toBe('imported');
  });

  it('compiles normalized mappings deterministically without transaction data', () => {
    expect(compileCustomVendorMappings({
      'Shop SRL POS 445566': ['Shopping', 'General'],
      'Shop Express': ['Groceries', 'Convenience'],
    })).toMatchObject([
      { vendor: 'Shop Express', normalizedVendor: 'shop express' },
      { vendor: 'Shop SRL POS 445566', normalizedVendor: 'shop' },
    ]);
  });

  it('resolves a synthetic large dataset within the regression budget', () => {
    const vendorNames = Array.from({ length: 65 }, (_, index) => {
      const first = String.fromCharCode(97 + Math.floor(index / 26));
      const second = String.fromCharCode(97 + (index % 26));
      return `synthetic vendor ${first}${second}`;
    });
    const mappings = Object.fromEntries(
      vendorNames.map((vendor) => [vendor, ['Shopping', 'Synthetic']])
    );
    const transactions = Array.from({ length: 7_500 }, (_, index) => ({
      date: '2026-06-01',
      ym: '2026-06',
      desc: index % 5 === 0
        ? `${vendorNames[index % vendorNames.length]} location`
        : `unmatched synthetic merchant ${index}`,
      cat: 'Other',
      sub: '',
      amt: -10,
      flow: 'Debit',
      type: 'Card Payment',
      currency: 'RON',
    }));

    const startedAt = performance.now();
    const resolved = resolveTransactionCategories(transactions, mappings);
    const duration = performance.now() - startedAt;

    expect(resolved).toHaveLength(7_500);
    expect(resolved.filter((transaction) => transaction.categorySource === 'custom')).toHaveLength(1_500);
    expect(duration).toBeLessThan(250);
  });
});

describe('currency exchange', () => {
  const exchange = (overrides) => ({ ...baseTransaction, desc: 'Exchanged to EUR', type: 'Exchange', cat: 'Other', sub: 'Other', baseCat: 'Other', baseSub: 'Other', ...overrides });

  it('is a transfer, never spending or income, even when stored as Other/Income by an older import', () => {
    const [out, back] = resolveTransactionCategories([
      exchange({ amt: -1000 }),
      exchange({ desc: 'Exchanged to RON', amt: 200, flow: 'Credit', cat: 'Income', sub: 'Income', baseCat: 'Income', baseSub: 'Income' }),
    ]);
    expect(out).toMatchObject({ cat: 'Transfers', baseCat: 'Transfers' });
    expect(back).toMatchObject({ cat: 'Transfers', baseCat: 'Transfers' });
  });

  it('still respects a manual category override', () => {
    const [row] = resolveTransactionCategories([exchange({ amt: -50, manualCat: 'Fees', manualSub: 'Fees' })]);
    expect(row.cat).toBe('Fees');
  });
});
