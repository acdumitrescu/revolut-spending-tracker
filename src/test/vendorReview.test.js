import { describe, expect, it, vi } from 'vitest';
import { getOtherVendorGroups } from '../lib/vendorReview';

const matcher = {
  suggestCandidates: vi.fn((description) => ([{
    canonicalName: `${description} candidate`,
    category: 'Shopping',
    subcategory: 'Marketplace',
    alias: description,
    score: 0.1,
  }])),
};

describe('Other vendor review', () => {
  it('groups unresolved debit vendors locally and ranks them by spend', () => {
    const groups = getOtherVendorGroups([
      { desc: 'Test Market 1234', cat: 'Other', amt: -40, flow: 'Debit', currency: 'RON' },
      { desc: 'Test Market 5678', cat: 'Other', amt: -60, flow: 'Debit', currency: 'RON' },
      { desc: 'Small Vendor', cat: 'Other', amt: -10, flow: 'Debit', currency: 'RON' },
      { desc: 'Manual Other', cat: 'Other', amt: -500, flow: 'Debit', currency: 'RON', categorySource: 'manual' },
      { desc: 'Known Vendor', cat: 'Shopping', amt: -200, flow: 'Debit', currency: 'RON' },
    ], 'RON', { EUR: 5, USD: 4.6 }, matcher);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ vendorKey: 'test market', count: 2, total: 100 });
    expect(groups[0].samples).toEqual(['Test Market 1234', 'Test Market 5678']);
    expect(groups[0].suggestions[0].category).toBe('Shopping');
    expect(groups[1]).toMatchObject({ vendorKey: 'small vendor', count: 1, total: 10 });
    expect(matcher.suggestCandidates).toHaveBeenCalledTimes(2);
  });
});
