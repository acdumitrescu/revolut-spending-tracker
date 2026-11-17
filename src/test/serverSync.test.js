import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getConflictSnapshot,
  getRemoteLogicalUpdatedAt,
  clearSyncAccessToken,
  createPrivateBackup,
  getSyncAccessToken,
  isVersionConflict,
  loadServerSnapshot,
  saveServerSnapshot,
  setSyncAccessToken,
  shouldLoadRemoteAtBootstrap,
} from '../lib/serverSync';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serverSync', () => {
  it('keeps populated private server state authoritative during bootstrap', () => {
    const remote = {
      data: { transactions: [{ id: 'remote' }], accounts: [], lastUpdated: 10 },
    };
    const newerLocal = {
      data: { transactions: [], accounts: [], lastUpdated: 20 },
    };

    expect(shouldLoadRemoteAtBootstrap(remote, newerLocal, 10)).toBe(true);
  });

  it('uses populated local state only to initialize an empty private server', () => {
    const emptyRemote = {
      data: { transactions: [], accounts: [], lastUpdated: 20 },
    };
    const populatedLocal = {
      data: { transactions: [], accounts: [{ id: 'local' }], lastUpdated: 10 },
    };

    expect(shouldLoadRemoteAtBootstrap(emptyRemote, populatedLocal, 20)).toBe(false);
  });

  it('keeps the access token in session storage and sends it as a bearer token', async () => {
    setSyncAccessToken('synthetic-session-token');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: null, version: 0, updatedAt: null }),
      }),
    );

    await loadServerSnapshot();

    expect(getSyncAccessToken()).toBe('synthetic-session-token');
    expect(window.sessionStorage.setItem).toHaveBeenCalled();
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
      expect.stringContaining('sync'),
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/data',
      expect.objectContaining({
        headers: { Authorization: 'Bearer synthetic-session-token' },
      }),
    );

    clearSyncAccessToken();
    expect(getSyncAccessToken()).toBe('');
  });

  it('surfaces unauthorized responses without retrying or hiding the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Private sync authentication required' }),
      }),
    );

    await expect(loadServerSnapshot()).rejects.toMatchObject({
      status: 401,
      message: 'Private sync authentication required',
    });
  });

  it('normalizes snapshot metadata from a successful load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { lastUpdated: 1700000000000, transactions: [] },
          version: 3,
          updatedAt: '2026-06-18T12:00:00.000Z',
        }),
      }),
    );

    const snapshot = await loadServerSnapshot();
    expect(snapshot.version).toBe(3);
    expect(snapshot.data?.lastUpdated).toBe(1700000000000);
    expect(getRemoteLogicalUpdatedAt(snapshot)).toBe(1700000000000);
  });

  it('sends the current version when saving a snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { lastUpdated: 1700000000000, transactions: [] },
        version: 4,
        updatedAt: '2026-06-18T12:01:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const payload = { lastUpdated: 1700000000000, transactions: [] };
    const snapshot = await saveServerSnapshot(payload, 3);

    expect(snapshot.version).toBe(4);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/data',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ data: payload, version: 3 }),
      }),
    );
  });

  it('sends a versioned app state and import metadata when creating a backup', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        filename: 'backup.json',
        createdAt: '2026-09-26T18:30:00.000Z',
        reason: 'import',
        importBatchId: 'batch-123',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const payload = { schemaVersion: 1, data: { transactions: [], accounts: [] } };

    await expect(createPrivateBackup(payload, 'import', 'batch-123')).resolves.toMatchObject({
      filename: 'backup.json',
      reason: 'import',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/backups',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ data: payload, reason: 'import', importBatchId: 'batch-123' }),
      }),
    );
  });

  it('surfaces version conflicts with the latest snapshot body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Version conflict',
          data: { lastUpdated: 1700000005000, transactions: [] },
          version: 8,
          updatedAt: '2026-06-18T12:02:00.000Z',
        }),
      }),
    );

    await expect(saveServerSnapshot({ lastUpdated: 1700000000000 }, 7)).rejects.toMatchObject({
      status: 409,
    });

    try {
      await saveServerSnapshot({ lastUpdated: 1700000000000 }, 7);
    } catch (error) {
      expect(isVersionConflict(error)).toBe(true);
      const conflict = getConflictSnapshot(error);
      expect(conflict.version).toBe(8);
      expect(getRemoteLogicalUpdatedAt(conflict)).toBe(1700000005000);
    }
  });
});

describe('serverSync logical timestamp', () => {
  const WRITE_TIME = '2026-06-18T12:00:00.000Z';

  function stubLoad(data, updatedAt = WRITE_TIME) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data, version: 2, updatedAt }) }),
    );
  }

  it('reads the logical time from inside a persisted envelope, not the write time', async () => {
    const envelope = {
      schemaVersion: 1,
      exportedAt: null,
      data: { lastUpdated: 1700000000000, transactions: [] },
    };
    stubLoad(envelope);
    const snapshot = await loadServerSnapshot();
    expect(snapshot.data).toBe(envelope);
    expect(getRemoteLogicalUpdatedAt(snapshot)).toBe(1700000000000);
    expect(snapshot.remoteServerUpdatedAt).toBe(Date.parse(WRITE_TIME));
  });

  it('reads the logical time from an unversioned envelope', async () => {
    stubLoad({ exportedAt: 5, data: { lastUpdated: 1700000000000 } });
    expect(getRemoteLogicalUpdatedAt(await loadServerSnapshot())).toBe(1700000000000);
  });

  it('reads the logical time from a legacy bare workspace', async () => {
    stubLoad({ lastUpdated: 1700000000000, transactions: [] });
    expect(getRemoteLogicalUpdatedAt(await loadServerSnapshot())).toBe(1700000000000);
  });

  it('parses an ISO string logical time', async () => {
    stubLoad({ schemaVersion: 1, data: { lastUpdated: '2026-06-18T11:00:00.000Z' } });
    expect(getRemoteLogicalUpdatedAt(await loadServerSnapshot())).toBe(
      Date.parse('2026-06-18T11:00:00.000Z'),
    );
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['zero', 0],
    ['unparseable', 'not a date'],
    ['an object', { at: 1 }],
    ['NaN', Number.NaN],
  ])('falls back to the server write time when lastUpdated is %s', async (_label, value) => {
    stubLoad({ schemaVersion: 1, data: { lastUpdated: value } });
    expect(getRemoteLogicalUpdatedAt(await loadServerSnapshot())).toBe(Date.parse(WRITE_TIME));
  });

  it('does not treat a non-object inner data value as the workspace', async () => {
    stubLoad({ lastUpdated: 1700000000000, data: 'junk' });
    expect(getRemoteLogicalUpdatedAt(await loadServerSnapshot())).toBe(1700000000000);
  });

  it('returns 0 when there is neither a logical time nor a write time', async () => {
    stubLoad(null, null);
    const snapshot = await loadServerSnapshot();
    expect(snapshot.data).toBeNull();
    expect(getRemoteLogicalUpdatedAt(snapshot)).toBe(0);
  });

  it('reads the logical time from a conflicting envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: 'Version conflict',
          data: { schemaVersion: 1, exportedAt: null, data: { lastUpdated: 1700000009000 } },
          version: 8,
          updatedAt: '2020-01-01T00:00:00.000Z',
        }),
      }),
    );
    const error = await saveServerSnapshot({ schemaVersion: 1, data: {} }, 7).catch((e) => e);
    expect(isVersionConflict(error)).toBe(true);
    const conflict = getConflictSnapshot(error);
    expect(getRemoteLogicalUpdatedAt(conflict)).toBe(1700000009000);
    expect(conflict.remoteServerUpdatedAt).toBe(Date.parse('2020-01-01T00:00:00.000Z'));
  });
});
