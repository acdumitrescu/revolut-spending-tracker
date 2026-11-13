import { describe, expect, it } from 'vitest';
import { NO_ICON, resolveSubscriptionIcon } from '../lib/subscriptionIcons';
import { SubscriptionSchema } from '../lib/validation';

const base = {
  id: '1',
  amount: 10,
  currency: 'RON',
  cycle: 'monthly',
  nextRenewal: '2026-10-07',
  status: 'active',
  notes: '',
};

describe('subscription icons', () => {
  it('auto-matches bundled brands by name, preferring the longest alias', () => {
    expect(resolveSubscriptionIcon({ ...base, name: 'Spotify', icon: '' })?.key).toBe('spotify');
    expect(resolveSubscriptionIcon({ ...base, name: 'GoogleDrive(TATA)', icon: '' })?.key).toBe(
      'googledrive',
    );
    expect(resolveSubscriptionIcon({ ...base, name: 'Apple Music', icon: '' })?.key).toBe(
      'applemusic',
    );
  });

  it('falls back to the letter avatar for unknown names or when disabled', () => {
    expect(resolveSubscriptionIcon({ ...base, name: 'AI', icon: '' })).toBeNull();
    expect(resolveSubscriptionIcon({ ...base, name: 'Spotify', icon: NO_ICON })).toBeNull();
  });

  it('keeps an explicit bundled choice or uploaded image over auto-match', () => {
    expect(resolveSubscriptionIcon({ ...base, name: 'Music', icon: 'tidal' })?.key).toBe('tidal');
    const src = 'data:image/png;base64,AAAA';
    expect(resolveSubscriptionIcon({ ...base, name: 'Spotify', icon: src })).toEqual({
      kind: 'image',
      src,
    });
  });

  it('accepts old records without an icon and rejects non-image data URLs', () => {
    expect(SubscriptionSchema.parse({ ...base, name: 'Old' }).icon).toBe('');
    expect(
      SubscriptionSchema.safeParse({ ...base, name: 'X', icon: 'data:text/html;base64,AAAA' })
        .success,
    ).toBe(false);
    expect(SubscriptionSchema.safeParse({ ...base, name: 'X', icon: 'spotify' }).success).toBe(
      true,
    );
  });
});
