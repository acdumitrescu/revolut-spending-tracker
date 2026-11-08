import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UnknownVendorReview from '../components/UnknownVendorReview';
import { reviewableObservations } from '../lib/vendorReview';

const obs = (name, extra = {}) => ({ normalizedDescription: name.toLowerCase(), rawSamples: [name], count: 3, lastSeenAt: '2026-10-01', status: 'pending', suggestedCandidates: [], ...extra });

describe('unknown vendor review', () => {
  it('hides exchanges, resolved, ignored and already-mapped vendors', () => {
    const list = [obs('Exchanged to RON'), obs('Google One'), obs('Ignored Shop', { status: 'ignored' }), obs('Mapped Shop'), obs('Top-up by card')];
    const names = reviewableObservations(list, { 'mapped shop': ['Other', ''] }).map((item) => item.rawSamples[0]);
    expect(names).toEqual(['Google One']);
  });

  it('offers map, choose category and ignore without any public-override action', () => {
    const onApply = vi.fn(); const onMap = vi.fn(); const onIgnore = vi.fn();
    const top = { canonicalName: 'Google', category: 'Subscriptions', subcategory: 'Cloud', alias: 'google', score: 0.1 };
    const item = obs('Google One', { suggestedCandidates: [top] });
    render(<UnknownVendorReview observations={[item]} customVendors={{}} onApply={onApply} onMap={onMap} onIgnore={onIgnore} />);
    expect(screen.queryByText(/public override/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map to Subscriptions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose category…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
    expect(onApply).toHaveBeenCalledWith(item, top);
    expect(onMap).toHaveBeenCalledWith(item);
    expect(onIgnore).toHaveBeenCalledWith(item);
  });

  it('pages and searches beyond the first 12', () => {
    const list = Array.from({ length: 30 }, (_, i) => obs(`Shop ${String.fromCharCode(65 + (i % 26))}${i}`));
    render(<UnknownVendorReview observations={list} customVendors={{}} onApply={vi.fn()} onMap={vi.fn()} onIgnore={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(30);
    fireEvent.change(screen.getByLabelText('Search unknown vendors'), { target: { value: 'Shop B1' } });
    expect(screen.getAllByRole('listitem').length).toBeLessThan(5);
  });
});
