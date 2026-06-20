import { describe, expect, it } from 'vitest';
import { buildSearchResults } from '../lib/globalSearch';

const transactions = [
  {
    id: 'one',
    date: '2026-05-10',
    desc: 'MEGA IMAGE 102',
    matchedVendor: 'Mega Image',
    cat: 'Groceries',
    sub: 'Supermarket',
  },
  {
    id: 'two',
    date: '2026-05-11',
    desc: 'Orange Romania',
    matchedVendor: 'Orange Romania',
    cat: 'Utilities',
    sub: 'Mobile',
  },
];

describe('global search index', () => {
  it('finds transactions and vendor insights without external inference', () => {
    const results = buildSearchResults(transactions, 'mega');
    expect(results.some((result) => result.type === 'transaction')).toBe(true);
    expect(results.some((result) => result.type === 'vendor' && result.title === 'Mega Image')).toBe(true);
  });

  it('finds categories and uses the insights hub destination', () => {
    const results = buildSearchResults(transactions, 'grocer');
    expect(results).toContainEqual(expect.objectContaining({
      type: 'category',
      title: 'Groceries',
      to: '/app/insights/categories',
    }));
  });

  it('does not open broad results for one-character input', () => {
    expect(buildSearchResults(transactions, 'm')).toEqual([]);
  });
});
