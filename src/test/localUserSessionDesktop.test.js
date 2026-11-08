import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/runtimeConfig', () => ({ runtimeConfig: { apiBasePath: '/api' } }));

import { userRequest } from '../lib/localUserSession';

const okResponse = { ok: true, json: async () => ({ users: [] }) };

afterEach(() => {
  delete window.__SSB_DESKTOP__;
  vi.unstubAllGlobals();
});

describe('local user requests', () => {
  it('send the desktop bearer token inside the desktop app', async () => {
    window.__SSB_DESKTOP__ = { syncToken: 'e'.repeat(64) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse));
    await userRequest('');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${'e'.repeat(64)}`);
  });

  it('send no Authorization header in a browser (the dev proxy adds it)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse));
    await userRequest('');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });
});
