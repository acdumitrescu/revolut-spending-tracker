import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  getConflictSnapshot,
  getRemoteLogicalUpdatedAt,
  isVersionConflict,
  loadServerSnapshot,
  saveServerSnapshot,
} from '../lib/serverSync';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serverSync', () => {
  it('normalizes snapshot metadata from a successful load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { lastUpdated: 1700000000000, transactions: [] },
        version: 3,
        updatedAt: '2026-06-18T12:00:00.000Z',
      }),
    }));

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
    expect(fetchMock).toHaveBeenCalledWith('/api/data', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ data: payload, version: 3 }),
    }));
  });

  it('surfaces version conflicts with the latest snapshot body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'Version conflict',
        data: { lastUpdated: 1700000005000, transactions: [] },
        version: 8,
        updatedAt: '2026-06-18T12:02:00.000Z',
      }),
    }));

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
