// @vitest-environment node
import { Buffer } from 'node:buffer';
import { it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createLocalUsers } from './localUsers.js';
import { openEncryptedStore } from './encryptedStore.js';
import { PersistedAppStateSchema } from './appStateSchema.js';
import { stateDigest } from './encryptedBackups.js';

const password = 'synthetic test password only';
it('keeps trusted development sessions alive beyond idle and maximum age but still revokes on lock', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-no-timeout-'));
  let time = 100000;
  const manager = await createLocalUsers({ root, now: () => time, autoLockDisabled: true });
  try {
    const login = await manager.create({ name: 'Synthetic development user', password });
    expect(login.autoLockDisabled).toBe(true);
    time += 7 * 24 * 60 * 60 * 1000;
    const lease = await manager.acquire(login.token);
    await lease.release();
    await manager.revoke(login.token);
    await expect(manager.acquire(login.token)).rejects.toMatchObject({ status: 401 });
  } finally {
    await manager.close();
  }
});
const state = () =>
  PersistedAppStateSchema.parse({
    schemaVersion: 1,
    data: {
      transactions: [],
      accounts: [
        {
          id: 'legacy',
          name: 'Synthetic legacy account',
          currency: 'RON',
          balances: { '2026-10': 123 },
          notes: {},
        },
      ],
      customVendors: {},
      lastUpdated: 1,
    },
  });

it('migrates once, persists users, isolates keys, expires sessions, and restores recovery without overwriting', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-test-'));
  let time = 100000;
  const legacy = vi.fn(async () => ({
    data: state(),
    observations: { observations: { secret: { status: 'pending' } } },
  }));
  let manager = await createLocalUsers({ root, readLegacy: legacy, now: () => time, idleMs: 1000 });
  try {
    await expect(manager.create({ name: 'One', password, migrate: false })).rejects.toThrow(
      'preserving',
    );
    const one = await manager.create({ name: 'One', password, migrate: true });
    const two = await manager.create({ name: 'Two', password });
    expect(legacy).toHaveBeenCalledTimes(1);
    const leaseOne = await manager.acquire(one.token);
    const leaseTwo = await manager.acquire(two.token);
    expect((await leaseOne.session.store.read()).data.data.accounts[0].name).toBe(
      'Synthetic legacy account',
    );
    expect((await leaseTwo.session.store.read()).data.data.accounts).toEqual([]);
    expect(leaseOne.session.key.equals(leaseTwo.session.key)).toBe(false);
    expect(await leaseTwo.session.store.getDocument('vendor-observations')).toBeNull();
    const bundle = await manager.exportRecovery(leaseOne.session);
    expect(JSON.stringify(bundle)).not.toContain('Synthetic legacy account');
    const freshRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-fresh-'));
    const fresh = await createLocalUsers({ root: freshRoot });
    try {
      const firstRestore = await fresh.restore({ name: 'First recovered user', password, bundle });
      const check = await fresh.acquire(firstRestore.token);
      expect((await check.session.store.read()).data.data.accounts).toEqual(state().data.accounts);
      await check.release();
    } finally {
      await fresh.close();
    }
    await expect(
      manager.restore({
        name: 'Damaged',
        password,
        bundle: { ...bundle, database: Buffer.from('damaged').toString('base64') },
      }),
    ).rejects.toThrow('Recovery failed');
    await leaseOne.release();
    await leaseTwo.release();
    await expect(
      manager.unlock({ userId: one.user.id, password: 'wrong synthetic password' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      manager.restore({ name: 'Wrong restore', password: 'wrong synthetic password', bundle }),
    ).rejects.toThrow('Recovery failed');
    const restored = await manager.restore({ name: 'Recovered One', password, bundle });
    const recovered = await manager.acquire(restored.token);
    expect((await recovered.session.store.read()).data.data.accounts).toEqual(
      state().data.accounts,
    );
    expect(recovered.session.key.equals(leaseOne.session.key)).toBe(false);
    await recovered.release();
    expect(manager.list().users).toHaveLength(3);
    const lease = await manager.acquire(two.token);
    await manager.revoke(two.token);
    await expect(manager.acquire(two.token)).rejects.toMatchObject({ status: 401 });
    expect(lease.session.closed).not.toBe(true); // in-flight work owns a lease
    await lease.release();
    expect(lease.session.key.every((byte) => byte === 0)).toBe(true);
    time += 1001;
    await expect(manager.acquire(one.token)).rejects.toMatchObject({ status: 401 });
    await manager.close();
    manager = await createLocalUsers({ root, readLegacy: legacy });
    expect(manager.list().users).toHaveLength(3);
    await expect(manager.acquire(restored.token)).rejects.toMatchObject({ status: 401 });
    const reopened = await manager.unlock({ userId: one.user.id, password });
    const persisted = await manager.acquire(reopened.token);
    expect((await persisted.session.store.read()).data.data.accounts).toEqual(
      state().data.accounts,
    );
    await persisted.release();
    expect(
      (await fs.readFile(path.join(root, one.user.id, 'workspace.ssbdb'))).includes(
        Buffer.from('Synthetic legacy account'),
      ),
    ).toBe(false);
  } finally {
    await manager.close();
  }
}, 30000);

it('counts only failures: successful unlocks never trip the limit, and a success never clears it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-failcount-'));
  const manager = await createLocalUsers({ root });
  try {
    const created = await manager.create({ name: 'Counter', password });
    const userId = created.user.id;
    await manager.revoke(created.token);
    // More than ten successful unlocks inside one minute all succeed.
    for (let i = 0; i < 12; i++) {
      const login = await manager.unlock({ userId, password });
      await manager.revoke(login.token);
    }
    // Failures accumulate across an interleaved success...
    for (let i = 0; i < 5; i++)
      await expect(manager.unlock({ userId: 'none', password })).rejects.toMatchObject({
        status: 401,
      });
    const good = await manager.unlock({ userId, password });
    await manager.revoke(good.token);
    for (let i = 0; i < 5; i++)
      await expect(manager.unlock({ userId: 'none', password })).rejects.toMatchObject({
        status: 401,
      });
    // ...so after ten failures even the correct password is refused until the window passes.
    await expect(manager.unlock({ userId, password })).rejects.toMatchObject({ status: 429 });
  } finally {
    await manager.close();
  }
}, 120000);

it('reports the open-session cap as 429 instead of masking it as a wrong password', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-cap-'));
  const manager = await createLocalUsers({ root });
  try {
    const created = await manager.create({ name: 'Capped', password }); // holds one session
    let opened = 1;
    let refusal;
    for (let i = 0; i < 25 && !refusal; i++) {
      try {
        await manager.unlock({ userId: created.user.id, password });
        opened++;
      } catch (error) {
        refusal = error;
      }
    }
    expect(opened).toBe(20);
    expect(refusal).toMatchObject({ status: 429 });
    expect(refusal.message).toMatch(/Too many open sessions/);
  } finally {
    await manager.close();
  }
}, 120000);

it('fails closed for damaged registry and limits expensive password attempts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-limits-'));
  const manager = await createLocalUsers({ root });
  try {
    for (let i = 0; i < 10; i++)
      await expect(manager.unlock({ userId: '../other', password })).rejects.toMatchObject({
        status: 401,
      });
    await expect(manager.unlock({ userId: 'none', password })).rejects.toMatchObject({
      status: 429,
    });
  } finally {
    await manager.close();
  }
  await fs.writeFile(path.join(root, 'users.json'), 'broken', { mode: 0o600 });
  await expect(createLocalUsers({ root })).rejects.toThrow();
});

// Needs the macOS Keychain helper (readDatabaseKey refuses other platforms by design);
// runs on the Mac (npm run ci:local), skipped on Linux CI.
it.skipIf(process.platform !== 'darwin')(
  'requires a user session on every financial API and never lets a supplied user ID change its database',
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-users-api-'));
    const key = randomBytes(32);
    const filename = path.join(root, 'legacy.ssbdb');
    const helper = path.join(root, 'synthetic-helper');
    await fs.writeFile(
      helper,
      `#!${process.execPath}\nprocess.stdout.write(Buffer.from('${key.toString('hex')}', 'hex'));\n`,
      { mode: 0o700 },
    );
    const db = await openEncryptedStore({ filename, key, create: true });
    await db.write(state(), 0);
    await db.putDocument('vendor-observations', {
      schemaVersion: 1,
      observations: { legacy: { normalizedDescription: 'legacy', count: 1 } },
    });
    await db.close();
    const originalBytes = stateDigest((await fs.readFile(filename)).toString('base64'));
    const token = 'synthetic-only-user-api-test-token-123456789';
    for (const [name, value] of Object.entries({
      SSB_STORAGE: 'sqlcipher',
      SSB_LOCAL_USERS: 'true',
      SSB_DATABASE_FILE: filename,
      SSB_USERS_DIR: path.join(root, 'users'),
      SSB_KEYCHAIN_HELPER: helper,
      SSB_BACKUP_DIR: path.join(root, 'legacy-backups'),
      SSB_SYNC_TOKEN: token,
      ALLOWED_ORIGINS: 'http://127.0.0.1:5189',
    }))
      vi.stubEnv(name, value);
    vi.resetModules();
    const { app, closePrivateStorage } = await import('./server.js');
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const send = (url, body, session = '', extra = {}) =>
      fetch(base + url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: 'http://127.0.0.1:5189',
          'Content-Type': 'application/json',
          'X-SSB-Session': session,
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    try {
      for (const [url, body] of [
        ['/api/data'],
        ['/api/changes', {}],
        ['/api/backups', {}],
        ['/api/encrypted-backups'],
        ['/api/vendor-observations'],
        ['/api/vendor-observations/collect', {}],
        ['/api/vendor-observations/resolve', {}],
        ['/api/quotes'],
        ['/api/instruments/search'],
        ['/api/users/recovery', {}],
      ])
        expect((await send(url, body)).status, url).toBe(401);
      const response = await send('/api/users', { name: 'Original', password, migrate: true });
      expect(response.status).toBe(200);
      const one = await response.json();
      expect(stateDigest((await fs.readFile(filename)).toString('base64'))).toBe(originalBytes);
      expect(
        (await fs.readdir(path.join(root, 'legacy-backups'))).some((name) =>
          name.endsWith('.ssbdb'),
        ),
      ).toBe(true);
      const two = await (await send('/api/users', { name: 'Empty', password })).json();
      const currentOne = await (await send('/api/data', undefined, one.token)).json();
      expect(currentOne.data.data.accounts[0].id).toBe('legacy');
      const currentTwo = await (
        await send('/api/data?userId=' + one.user.id, undefined, two.token, {
          'X-SSB-User': one.user.id,
        })
      ).json();
      expect(currentTwo.data.data.accounts).toEqual([]);
      expect(
        (await (await send('/api/vendor-observations', undefined, two.token)).json()).observations,
      ).toEqual([]);
      const receipt = await (
        await send('/api/backups', { data: currentOne.data, reason: 'manual' }, one.token)
      ).json();
      expect(
        (await send('/api/encrypted-backups/' + receipt.filename, undefined, two.token)).status,
      ).toBe(400);
      const changed = await send(
        '/api/changes',
        {
          version: currentTwo.version,
          changes: [
            {
              field: 'accounts',
              value: [{ id: 'two', name: 'Only two', currency: 'EUR', balances: {}, notes: {} }],
            },
          ],
        },
        two.token,
      );
      expect(changed.status).toBe(200);
      expect(
        (await (await send('/api/data', undefined, one.token)).json()).data.data.accounts[0].id,
      ).toBe('legacy');
      expect((await send('/api/users/lock', {}, one.token)).status).toBe(200);
      expect((await send('/api/data', undefined, one.token)).status).toBe(401);
      expect((await send('/api/data', undefined, two.token)).status).toBe(200);
      expect(
        (await send('/api/users/unlock', { userId: two.user.id, password: 'incorrect password' }))
          .status,
      ).toBe(401);
    } finally {
      server.close();
      await once(server, 'close');
      await closePrivateStorage();
      vi.unstubAllEnvs();
      key.fill(0);
    }
  },
  30000,
);

it('allows short test passwords only when enabled and keeps existing test users unlockable after disabling it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-weak-test-'));
  let manager = await createLocalUsers({ root });
  try {
    await expect(manager.create({ name: 'Test', password: 'test' })).rejects.toThrow('16 to 256');
    await manager.close();
    manager = await createLocalUsers({ root, allowWeakTestPasswords: true });
    expect(manager.list()).toMatchObject({ testingPasswords: true, passwordMinimum: 4 });
    await expect(manager.create({ name: 'Too short', password: 'abc' })).rejects.toThrow(
      '4 to 256',
    );
    const user = await manager.create({ name: 'Test', password: 'test' });
    const lease = await manager.acquire(user.token);
    const bundle = await manager.exportRecovery(lease.session);
    await lease.release();
    await manager.close();
    manager = await createLocalUsers({ root });
    expect(manager.list().passwordMinimum).toBe(16);
    await expect(
      manager.unlock({ userId: user.user.id, password: 'test' }),
    ).resolves.toHaveProperty('token');
    await expect(
      manager.restore({ name: 'Recovered test', password: 'test', bundle }),
    ).resolves.toHaveProperty('token');
    await expect(manager.create({ name: 'New', password: 'test' })).rejects.toThrow('16 to 256');
  } finally {
    await manager.close();
  }
}, 15000);
