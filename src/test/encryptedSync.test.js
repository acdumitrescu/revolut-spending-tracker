import { afterEach, expect, it, vi } from 'vitest';
import { createPersistedAppState } from '../lib/appState';
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: { encryptedStorage: true, privateSyncAutoAuth: true, apiBasePath: '/api' },
}));
import {
  getConflictSnapshot,
  getRemoteLogicalUpdatedAt,
  loadServerSnapshot,
  saveServerSnapshot,
} from '../lib/serverSync';
afterEach(() => vi.unstubAllGlobals());
it('reads the logical time from encrypted envelopes on load, change saves and conflicts', async () => {
  const at = (lastUpdated) => {
    const state = createPersistedAppState();
    state.data.lastUpdated = lastUpdated;
    return state;
  };
  const written = '2020-01-01T00:00:00.000Z';
  const response = (data, version, ok = true) => ({
    ok,
    status: ok ? 200 : 409,
    json: async () => ({ data, version, updatedAt: written }),
  });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(at(1700000001000), 1))
      .mockResolvedValueOnce(response(at(1700000002000), 2))
      .mockResolvedValueOnce(response(at(1700000003000), 3, false)),
  );
  expect(getRemoteLogicalUpdatedAt(await loadServerSnapshot())).toBe(1700000001000);
  const saved = await saveServerSnapshot(at(1700000002000), 1);
  expect(getRemoteLogicalUpdatedAt(saved)).toBe(1700000002000);
  expect(saved.remoteServerUpdatedAt).toBe(Date.parse(written));
  const error = await saveServerSnapshot(at(1700000002500), 2).catch((e) => e);
  expect(getRemoteLogicalUpdatedAt(getConflictSnapshot(error))).toBe(1700000003000);
});
it('diffs against accepted conflicts including accounts reverted to their earlier value', async () => {
  const initial = createPersistedAppState();
  const remote = structuredClone(initial);
  remote.data.themeMode = 'light';
  remote.data.accounts = [
    { id: 'a', name: 'Synthetic', currency: 'RON', balances: { '2026-10': 100 }, notes: {} },
  ];
  const response = (data, version, ok = true) => ({
    ok,
    status: ok ? 200 : 409,
    json: async () => ({ data, version }),
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(initial, 1))
    .mockResolvedValueOnce(response(remote, 2, false))
    .mockResolvedValueOnce(response(initial, 3));
  vi.stubGlobal('fetch', fetchMock);
  await loadServerSnapshot();
  try {
    await saveServerSnapshot(initial, 1);
  } catch (error) {
    getConflictSnapshot(error);
  }
  await saveServerSnapshot(initial, 2);
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).changes).toEqual(
    expect.arrayContaining([
      { field: 'themeMode', value: 'dark' },
      { field: 'accounts', value: [] },
    ]),
  );
});
