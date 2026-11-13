import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { openEncryptedStore } from './encryptedStore.js';
import { protectRecoveryKey, unlockRecoveryKey } from './passwordRecovery.js';
import { createEncryptedBackup, stateDigest } from './encryptedBackups.js';
import { verifyRecoveryBackup } from './recoveryKey.js';
import { PersistedAppStateSchema } from './appStateSchema.js';

export const USER_IDLE_MS = 15 * 60 * 1000;
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const publicUser = ({ id, name }) => ({ id, name });

// Registry contains labels and password-wrapped random keys, never financial data.
// All paths come from generated IDs, never a request-supplied path or user name.
export async function createLocalUsers({
  root,
  readLegacy,
  now = Date.now,
  idleMs = USER_IDLE_MS,
  allowWeakTestPasswords = false,
  autoLockDisabled = false,
}) {
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error('User storage must be private');
  const registryFile = path.join(root, 'users.json');
  let registry;
  try {
    registry = JSON.parse(await fs.readFile(registryFile, 'utf8'));
    if (
      registry.version !== 1 ||
      !Array.isArray(registry.users) ||
      registry.users.some(
        (u) => !/^[a-f0-9-]{36}$/.test(u.id) || typeof u.name !== 'string' || !u.wrappedKey,
      )
    )
      throw new Error('Invalid user registry');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // fail closed on corruption
    registry = { version: 1, users: [] };
  }
  const sessions = new Map();
  let queue = Promise.resolve();
  const serialized = (work) => {
    const job = queue.then(work);
    queue = job.catch(() => {});
    return job;
  };
  const userDir = (id) => path.join(root, id);
  const backupDir = (id) => path.join(userDir(id), 'backups');
  async function publish(user) {
    const next = { version: 1, users: [...registry.users, user] };
    const temporary = path.join(root, `.${randomUUID()}.pending`);
    const file = await fs.open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(next));
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporary, registryFile);
    const directory = await fs.open(root, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    registry = next;
  }
  const passwordMinimum = allowWeakTestPasswords ? 4 : 16;
  function credentials(name, password, minimum = passwordMinimum) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60)
      throw fail('Use a user name of 1 to 60 characters');
    if (
      typeof password !== 'string' ||
      Buffer.byteLength(password) < minimum ||
      Buffer.byteLength(password) > 256
    )
      throw fail(`Use a password of ${minimum} to 256 UTF-8 bytes`);
    if (
      registry.users.some(
        (user) => user.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
      )
    )
      throw fail('That user name already exists');
    if (registry.users.length >= 20) throw fail('This computer supports up to 20 local users');
    return name.trim();
  }
  async function closeSession(session) {
    if (!session.closed && session.revoked && !session.leases) {
      session.closed = true;
      try {
        await session.store.close();
      } finally {
        session.key.fill(0);
      }
    }
  }
  async function revoke(token) {
    const session = sessions.get(hash(token));
    if (!session) return;
    sessions.delete(hash(token));
    session.revoked = true;
    await closeSession(session);
  }
  async function expire() {
    if (autoLockDisabled) return;
    for (const [id, session] of sessions) {
      if (now() - session.lastActive >= idleMs || now() - session.started >= SESSION_MAX_MS) {
        sessions.delete(id);
        session.revoked = true;
        await closeSession(session);
      }
    }
  }
  const timer = autoLockDisabled
    ? null
    : setInterval(
        () => {
          void expire().catch(() => {});
        },
        Math.min(idleMs, 30000),
      );
  timer?.unref();
  async function newSession(user, key) {
    const store = await openEncryptedStore({
      filename: path.join(userDir(user.id), 'workspace.ssbdb'),
      key,
    });
    const token = randomBytes(32).toString('hex');
    sessions.set(hash(token), {
      user,
      store,
      key,
      backupDir: backupDir(user.id),
      lastActive: now(),
      started: now(),
      leases: 0,
      revoked: false,
    });
    return { user: publicUser(user), token, idleMs, autoLockDisabled };
  }
  // Serialize expensive KDF work and rate-limit FAILURES without logging passwords.
  // The limit is global (not per user), so a success must never clear or refund it: someone
  // holding one valid account could otherwise interleave good unlocks to keep guessing another
  // account's password. The gate and the failure count both run inside the serialized job.
  let attempts = 0,
    windowStart = now();
  function throttleGate() {
    if (now() - windowStart >= 60000) {
      attempts = 0;
      windowStart = now();
    }
    if (attempts >= 10) throw fail('Too many attempts. Wait a minute and try again.', 429);
  }
  const limited = (work) =>
    serialized(async () => {
      throttleGate();
      try {
        return await work();
      } catch (error) {
        attempts++;
        throw error;
      }
    });
  return {
    list: () => ({
      users: registry.users.map(publicUser),
      setupRequired: registry.users.length === 0,
      migrationRequired: registry.users.length === 0 && Boolean(readLegacy),
      idleMs,
      passwordMinimum,
      testingPasswords: allowWeakTestPasswords,
    }),
    create: (input) =>
      limited(async () => {
        const name = credentials(input?.name, input?.password);
        const first = registry.users.length === 0;
        if (first && readLegacy && input?.migrate !== true)
          throw fail('Create the first user by preserving the existing workspace');
        const password = Buffer.from(input.password);
        const key = randomBytes(32);
        const id = randomUUID();
        let store;
        let handedOff = false;
        try {
          const user = {
            id,
            name,
            wrappedKey: await protectRecoveryKey(key, password, {
              allowShortPassword: allowWeakTestPasswords,
            }),
            createdAt: new Date(now()).toISOString(),
          };
          const legacy = first && readLegacy ? await readLegacy() : null;
          const data =
            legacy?.data ||
            PersistedAppStateSchema.parse({
              schemaVersion: 1,
              data: { accounts: [], transactions: [], customVendors: {}, lastUpdated: 1 },
            });
          await fs.mkdir(userDir(id), { mode: 0o700 });
          await fs.mkdir(backupDir(id), { mode: 0o700 });
          store = await openEncryptedStore({
            filename: path.join(userDir(id), 'workspace.ssbdb'),
            key,
            create: true,
          });
          await store.write(data, 0);
          if (legacy?.observations)
            await store.putDocument('vendor-observations', legacy.observations);
          await store.integrity();
          const normalized = PersistedAppStateSchema.parse(data);
          if (stateDigest((await store.read()).data) !== stateDigest(normalized))
            throw new Error('Migration verification failed');
          // Verify a separate encrypted backup before the registry activates this user.
          await createEncryptedBackup({
            backupDir: backupDir(id),
            key,
            data: normalized,
            reason: 'recovery',
            observations: legacy?.observations,
          });
          await store.close();
          store = null;
          await publish(user);
          const session = await newSession(user, key);
          handedOff = true;
          return session;
        } finally {
          password.fill(0);
          if (store) await store.close();
          if (!handedOff) key.fill(0);
        }
      }),
    unlock: (input) =>
      limited(async () => {
        const user = registry.users.find((u) => u.id === input?.userId);
        if (!user || typeof input?.password !== 'string' || Buffer.byteLength(input.password) > 256)
          throw fail('Unable to unlock. Check the user and password.', 401);
        const password = Buffer.from(input.password);
        let key;
        try {
          key = await unlockRecoveryKey(user.wrappedKey, password, { allowShortPassword: true });
          if (sessions.size >= 20)
            throw fail('Too many open sessions. Lock other windows or wait for expiry.', 429);
          return await newSession(user, key);
        } catch (error) {
          key?.fill(0);
          // The session cap is a real, documented 429; every other failure is an opaque 401.
          if (error?.status === 429) throw error;
          throw fail('Unable to unlock. Check the user and password.', 401);
        } finally {
          password.fill(0);
        }
      }),
    acquire: async (token) => {
      await expire();
      const session = sessions.get(hash(token));
      if (!session || session.revoked)
        throw fail('User is locked. Unlock your profile to continue.', 401);
      session.lastActive = now();
      session.leases++;
      let released = false;
      return {
        session,
        release: async () => {
          if (released) return;
          released = true;
          session.leases--;
          await closeSession(session);
        },
      };
    },
    revoke,
    exportRecovery: async (session) => {
      const data = (await session.store.read()).data;
      const receipt = await createEncryptedBackup({
        backupDir: session.backupDir,
        key: session.key,
        data,
        reason: 'recovery',
        observations: await session.store.getDocument('vendor-observations'),
      });
      return {
        format: 'ssb-local-user-recovery-v1',
        name: session.user.name,
        createdAt: receipt.createdAt,
        wrappedKey: session.user.wrappedKey,
        database: (await fs.readFile(path.join(session.backupDir, receipt.filename))).toString(
          'base64',
        ),
      };
    },
    restore: (input) =>
      limited(async () => {
        if (!registry.users.length && readLegacy)
          throw fail(
            'Preserve the existing workspace in the first user before restoring another profile',
          );
        const name = credentials(input?.name, input?.password, 4);
        const bundle = input?.bundle;
        if (
          bundle?.format !== 'ssb-local-user-recovery-v1' ||
          typeof bundle.database !== 'string' ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(bundle.database) ||
          bundle.database.length > 28 * 1024 * 1024
        )
          throw fail('Invalid recovery file');
        const password = Buffer.from(input.password);
        let recoveryKey;
        let key;
        let handedOff = false;
        let imported;
        const id = randomUUID();
        const temporary = path.join(userDir(id), '.restore.ssbdb');
        try {
          recoveryKey = await unlockRecoveryKey(bundle.wrappedKey, password, {
            allowShortPassword: true,
          });
          await fs.mkdir(userDir(id), { mode: 0o700 });
          await fs.mkdir(backupDir(id), { mode: 0o700 });
          await fs.writeFile(temporary, Buffer.from(bundle.database, 'base64'), {
            flag: 'wx',
            mode: 0o600,
          });
          await verifyRecoveryBackup(temporary, recoveryKey);
          imported = await openEncryptedStore({ filename: temporary, key: recoveryKey });
          const data = (await imported.read()).data;
          const observations = await imported.getDocument('vendor-observations');
          await imported.close();
          imported = null;
          key = randomBytes(32); // restored profiles also have independent encryption
          const target = await openEncryptedStore({
            filename: path.join(userDir(id), 'workspace.ssbdb'),
            key,
            create: true,
          });
          try {
            await target.write(data, 0);
            if (observations) await target.putDocument('vendor-observations', observations);
            await target.integrity();
          } finally {
            await target.close();
          }
          await createEncryptedBackup({
            backupDir: backupDir(id),
            key,
            data,
            reason: 'recovery',
            observations,
          });
          const user = {
            id,
            name,
            wrappedKey: await protectRecoveryKey(key, password, { allowShortPassword: true }),
            createdAt: new Date(now()).toISOString(),
          };
          await publish(user);
          const session = await newSession(user, key);
          handedOff = true;
          return session;
        } catch {
          throw fail('Recovery failed. Check the password and recovery file.');
        } finally {
          password.fill(0);
          recoveryKey?.fill(0);
          if (!handedOff) key?.fill(0);
          if (imported) await imported.close();
          await fs.unlink(temporary).catch(() => {});
        }
      }),
    close: async () => {
      clearInterval(timer);
      await queue;
      for (const session of sessions.values()) {
        session.revoked = true;
        await closeSession(session);
      }
      sessions.clear();
    },
  };
}
