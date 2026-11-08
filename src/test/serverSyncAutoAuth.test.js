import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: {
    privateSyncAutoAuth: true,
    apiBasePath: '/api',
  },
}));

import {
  getSyncAuthorizationHeaders,
  hasPrivateSyncAccess,
  loadServerSnapshot,
} from '../lib/serverSync';

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe('trusted local automatic authentication', () => {
  it('is ready without browser token storage and sends no client authorization header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, version: 0, updatedAt: null }),
    }));

    expect(hasPrivateSyncAccess()).toBe(true);
    expect(getSyncAuthorizationHeaders({ Accept: 'application/json' })).toEqual({ Accept: 'application/json', 'X-SSB-Client': 'private-ui' });
    await loadServerSnapshot();

    expect(window.sessionStorage.getItem('simple_safe_banking_sync_token')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/data', expect.objectContaining({ headers: { 'X-SSB-Client': 'private-ui' } }));
  });
});
