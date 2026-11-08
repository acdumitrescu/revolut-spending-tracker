import { afterEach, expect, it, vi } from 'vitest';
import { createPersistedAppState } from '../lib/appState';
vi.mock('../lib/runtimeConfig', () => ({ runtimeConfig: { encryptedStorage: true, privateSyncAutoAuth: true, apiBasePath: '/api' } }));
import { getConflictSnapshot, loadServerSnapshot, saveServerSnapshot } from '../lib/serverSync';
afterEach(() => vi.unstubAllGlobals());
it('diffs against accepted conflicts including accounts reverted to their earlier value', async () => {
  const initial = createPersistedAppState();
  const remote = structuredClone(initial);
  remote.data.themeMode = 'light';
  remote.data.accounts = [{ id: 'a', name: 'Synthetic', currency: 'RON', balances: { '2026-10': 100 }, notes: {} }];
  const response = (data, version, ok = true) => ({ ok, status: ok ? 200 : 409, json: async () => ({ data, version }) });
  const fetchMock = vi.fn().mockResolvedValueOnce(response(initial, 1)).mockResolvedValueOnce(response(remote, 2, false)).mockResolvedValueOnce(response(initial, 3));
  vi.stubGlobal('fetch', fetchMock);
  await loadServerSnapshot();
  try { await saveServerSnapshot(initial, 1); } catch (error) { getConflictSnapshot(error); }
  await saveServerSnapshot(initial, 2);
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).changes).toEqual(expect.arrayContaining([
    { field: 'themeMode', value: 'dark' }, { field: 'accounts', value: [] },
  ]));
});
