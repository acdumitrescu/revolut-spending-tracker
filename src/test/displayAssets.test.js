import { describe, expect, it } from 'vitest';
import { getCurrencyBadge, getVendorVisual, normalizeVisualLabel } from '../lib/displayAssets';

describe('display assets', () => {
  it('normalizes labels for matching', () => {
    expect(normalizeVisualLabel('Netflix, Inc.')).toBe('netflix inc');
  });

  it('matches vendor visuals case-insensitively', () => {
    expect(getVendorVisual('SPOTIFY AB')).toMatchObject({
      className: 'bill-logo spotify',
      text: 'S',
    });
  });

  it('prefers strong known vendor aliases', () => {
    expect(getVendorVisual('Microsoft 365')).toMatchObject({
      className: 'bill-logo microsoft',
      text: 'M',
    });
  });

  it('falls back to a generic vendor badge', () => {
    expect(getVendorVisual('Unknown Vendor')).toMatchObject({
      className: 'bill-logo generic',
      text: 'U',
    });
  });

  it('returns local currency badges', () => {
    expect(getCurrencyBadge('EUR')).toMatchObject({
      code: 'EUR',
      className: 'currency-badge eur',
    });
    expect(getCurrencyBadge('RON')).toMatchObject({
      code: 'RON',
      className: 'currency-badge ron',
    });
  });
});
