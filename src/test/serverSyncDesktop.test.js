import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: {
    privateSyncAutoAuth: false,
    localUsers: false,
    apiBasePath: '/api',
  },
}));

import {
  getDesktopSyncToken,
  getSyncAccessToken,
  getSyncAuthorizationHeaders,
  hasPrivateSyncAccess,
} from '../lib/serverSync';

const DESKTOP_TOKEN = 'd'.repeat(64);

afterEach(() => {
  delete window.__SSB_DESKTOP__;
  window.sessionStorage.clear();
});

describe('desktop shell token injection', () => {
  it('has no desktop token in a normal browser', () => {
    expect(getDesktopSyncToken()).toBe('');
    expect(hasPrivateSyncAccess()).toBe(false);
  });

  it('uses the injected token for bearer authorization without persisting it', () => {
    window.__SSB_DESKTOP__ = Object.freeze({ syncToken: DESKTOP_TOKEN });

    expect(hasPrivateSyncAccess()).toBe(true);
    expect(getSyncAuthorizationHeaders({ Accept: 'application/json' })).toEqual({
      Accept: 'application/json',
      Authorization: `Bearer ${DESKTOP_TOKEN}`,
    });
    expect(window.sessionStorage.getItem('simple_safe_banking_sync_token')).toBeNull();
  });

  it('prefers the injected token over a stored one', () => {
    window.sessionStorage.setItem('simple_safe_banking_sync_token', 'stored-token-value');
    window.__SSB_DESKTOP__ = { syncToken: DESKTOP_TOKEN };
    expect(getSyncAccessToken()).toBe(DESKTOP_TOKEN);
  });

  it('ignores a malformed injection', () => {
    window.__SSB_DESKTOP__ = { syncToken: 42 };
    expect(getDesktopSyncToken()).toBe('');
  });
});
