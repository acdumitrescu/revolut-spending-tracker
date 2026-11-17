// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { describe, it, expect } from 'vitest';
import { openEncryptedStore, toMinorUnits } from './encryptedStore.js';
import { PersistedAppStateSchema } from './appStateSchema.js';

function state() {
  return PersistedAppStateSchema.parse({
    schemaVersion: 1,
    data: {
      transactions: [
        {
          date: '2026-10-01',
          desc: "x'); DROP TABLE accounts; --",
          cat: 'Other',
          sub: '',
          amt: -12.34,
          flow: 'Debit',
          type: 'CARD_PAYMENT',
          ym: '2026-10',
          currency: 'RON',
        },
      ],
      accounts: [
        {
          id: 'ing',
          name: 'Synthetic ING',
          currency: 'RON',
          balances: { '2026-10': -100 },
          notes: { '2026-11': 'future note' },
        },
      ],
      customVendors: { synthetic: ['Other', ''] },
      budgets: { '2026-10': { Other: 123.45 }, '2026-11': {} },
      goals: [{ id: 'g', name: 'Goal', targetAmount: 100 }],
      creditRecords: [
        {
          id: 'c',
          kind: 'card',
          accountId: 'ing',
          purchases: [
            {
              id: 'p',
              name: 'Laptop',
              initialCost: 100,
              totalCost: 100,
              instalmentAmount: 10,
              totalMonths: 10,
              remainingMonths: 0,
              remainingBalance: 0,
              status: 'archived',
              archivedAt: 1,
            },
          ],
        },
      ],
      subscriptions: [
        {
          id: 's',
          name: 'Synthetic subscription',
          amount: 29.99,
          currency: 'RON',
          cycle: 'monthly',
          nextRenewal: '2026-11-01',
          status: 'active',
          notes: 'Synthetic fixture',
        },
      ],
      lastUpdated: 1,
    },
  });
}
async function fixture(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-cipher-test-'));
  const filename = path.join(directory, 'synthetic.db');
  const key = randomBytes(32);
  try {
    await run({ directory, filename, key });
  } finally {
    key.fill(0);
    for (const name of await fs.readdir(directory)) await fs.unlink(path.join(directory, name));
    await fs.rmdir(directory);
  }
}

describe('actual SQLCipher staging store', () => {
  it('encrypts and losslessly restores all supplied fields, including archive history', async () =>
    fixture(async ({ filename, key }) => {
      let db = await openEncryptedStore({ filename, key, create: true });
      try {
        await db.write(state(), 0);
        expect(await db.integrity()).toBe(true);
      } finally {
        await db.close();
      }
      const bytes = await fs.readFile(filename);
      expect(bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))).toBe(false);
      expect(bytes.includes(Buffer.from('Synthetic ING'))).toBe(false);
      expect((await fs.stat(filename)).mode & 0o777).toBe(0o600);
      await expect(openEncryptedStore({ filename, key: randomBytes(32) })).rejects.toThrow(
        'authenticated',
      );
      db = await openEncryptedStore({ filename, key });
      try {
        expect((await db.read()).data).toEqual(state());
      } finally {
        await db.close();
      }
    }));
  it('rejects orphan links and precision loss without partial writes', async () =>
    fixture(async ({ filename, key }) => {
      const db = await openEncryptedStore({ filename, key, create: true });
      try {
        await db.write(state(), 0);
        const orphan = state();
        orphan.data.creditRecords[0].accountId = 'missing';
        await expect(db.write(orphan, 1)).rejects.toThrow();
        const fractional = state();
        fractional.data.transactions[0].amt = 0.001;
        await expect(db.write(fractional, 1)).rejects.toThrow('fractional-cent');
        expect((await db.read()).version).toBe(1);
        expect((await db.read()).data).toEqual(state());
      } finally {
        await db.close();
      }
    }));
  it('serializes competing writes and rejects stale revisions', async () =>
    fixture(async ({ filename, key }) => {
      const db = await openEncryptedStore({ filename, key, create: true });
      try {
        const results = await Promise.allSettled([db.write(state(), 0), db.write(state(), 0)]);
        expect(results.map((x) => x.status)).toEqual(['fulfilled', 'rejected']);
        expect(results[1].reason.status).toBe(409);
      } finally {
        await db.close();
      }
    }));
  it('fails closed on missing keys, missing stores, overwrite attempts and corrupt files', async () =>
    fixture(async ({ filename, key }) => {
      await expect(openEncryptedStore({ filename, key: Buffer.alloc(0) })).rejects.toThrow(
        '32-byte',
      );
      await expect(openEncryptedStore({ filename, key })).rejects.toThrow();
      const db = await openEncryptedStore({ filename, key, create: true });
      await db.write(state(), 0);
      await db.close();
      await expect(openEncryptedStore({ filename, key, create: true })).rejects.toThrow();
      const file = await fs.open(filename, 'r+');
      await file.write(Buffer.alloc(64), 0, 64, 0);
      await file.close();
      await expect(openEncryptedStore({ filename, key })).rejects.toThrow('authenticated');
    }));
  it('rejects symlink database paths', async () =>
    fixture(async ({ filename, key, directory }) => {
      const db = await openEncryptedStore({ filename, key, create: true });
      await db.close();
      const link = path.join(directory, 'link.db');
      await fs.symlink(filename, link);
      await expect(openEncryptedStore({ filename: link, key })).rejects.toThrow('regular file');
    }));
  it('converts exact cents without silently rounding input', () => {
    expect(toMinorUnits(0.29)).toBe(29);
    expect(() => toMinorUnits(0.001)).toThrow();
    expect(() => toMinorUnits(Number.MAX_VALUE)).toThrow();
  });
});
