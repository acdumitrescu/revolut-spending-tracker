// @vitest-environment node
// Backend contract: request rules, local users, workspace. See docs/backend-contract.md.
import fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRONG_PASSWORD, makeDataRoot, startBackend } from './harness.js';

describe('backend contract: HTTP API (local-users profile)', () => {
  let dataRoot;
  let backend;
  let session;
  let userId;

  beforeAll(async () => {
    dataRoot = await makeDataRoot();
    backend = await startBackend({ dataRoot });
  }, 30_000);

  afterAll(async () => {
    if (backend) await backend.stop();
    if (dataRoot) await fs.rm(dataRoot, { recursive: true, force: true });
  });

  describe('request rules', () => {
    it('serves /healthz without auth', async () => {
      const response = await backend.request({ path: '/healthz', auth: false });
      expect(response.status).toBe(200);
      expect(response.json).toEqual({ ok: true });
    });

    it('rejects a missing bearer token with 401 and WWW-Authenticate', async () => {
      const response = await backend.request({ path: '/api/users', auth: false });
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.json).toHaveProperty('error');
    });

    it('rejects a wrong bearer token with 401', async () => {
      const response = await backend.request({ path: '/api/users', headers: { Authorization: `Bearer ${'0'.repeat(64)}` } });
      expect(response.status).toBe(401);
    });

    it('rejects a foreign Host header with 403', async () => {
      const response = await backend.request({ path: '/api/users', headers: { Host: 'evil.example:80' } });
      expect(response.status).toBe(403);
    });

    it('rejects a foreign Origin with 403', async () => {
      const response = await backend.request({ path: '/api/users', headers: { Origin: 'http://evil.example' } });
      expect(response.status).toBe(403);
    });

    it('rejects writes without an Origin header', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/users/unlock', body: {}, headers: { Origin: undefined } });
      expect(response.status).toBe(403);
    });

    it('rejects cross-site fetch metadata', async () => {
      const response = await backend.request({ path: '/api/users', headers: { 'Sec-Fetch-Site': 'cross-site' } });
      expect(response.status).toBe(403);
    });

    it('marks API responses as no-store and nosniff', async () => {
      const response = await backend.request({ path: '/api/users' });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('local users', () => {
    it('reports setup required on an empty data root', async () => {
      const response = await backend.request({ path: '/api/users' });
      expect(response.status).toBe(200);
      expect(response.json).toMatchObject({ users: [], setupRequired: true, migrationRequired: false });
      expect(response.json.passwordMinimum).toBe(16);
    });

    it('rejects a weak password with 400', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/users', body: { name: 'Weak', password: 'short' } });
      expect(response.status).toBe(400);
    });

    it('creates the first user and returns a session', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/users', body: { name: 'Contract', password: STRONG_PASSWORD } });
      expect(response.status).toBe(200);
      expect(response.json.user).toMatchObject({ name: 'Contract' });
      expect(response.json.token).toMatch(/^[a-f0-9]{64}$/);
      session = response.json.token;
      userId = response.json.user.id;
    }, 30_000);

    it('identifies the session user', async () => {
      const response = await backend.request({ path: '/api/users/session', session });
      expect(response.status).toBe(200);
      expect(response.json.user).toEqual({ id: userId, name: 'Contract' });
    });

    it('requires a session for financial routes', async () => {
      const response = await backend.request({ path: '/api/data' });
      expect(response.status).toBe(401);
    });
  });

  describe('workspace', () => {
    it('returns the workspace envelope', async () => {
      const response = await backend.request({ path: '/api/data', session });
      expect(response.status).toBe(200);
      expect(Number.isInteger(response.json.version)).toBe(true);
      expect(response.json.data).toBeTypeOf('object');
    });

    it('refuses whole-state writes in encrypted mode with 405', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/data', session, body: { data: {}, version: 0 } });
      expect(response.status).toBe(405);
    });

    it('applies a validated change and bumps the version', async () => {
      const before = (await backend.request({ path: '/api/data', session })).json;
      const response = await backend.request({
        method: 'POST', path: '/api/changes', session,
        body: { version: before.version, changes: [{ field: 'lastUpdated', value: 1_700_000_000_000 }] },
      });
      expect(response.status).toBe(200);
      expect(response.json.version).toBe(before.version + 1);
      expect(response.json.data.data.lastUpdated).toBe(1_700_000_000_000);
    });

    it('answers a stale version with 409 and the current state', async () => {
      const response = await backend.request({
        method: 'POST', path: '/api/changes', session,
        body: { version: 0, changes: [{ field: 'lastUpdated', value: 1 }] },
      });
      expect(response.status).toBe(409);
      expect(response.json.error).toBe('Version conflict');
      expect(Number.isInteger(response.json.version)).toBe(true);
    });

    it('rejects malformed changes with 400', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/changes', session, body: { version: 1, changes: [{ field: 'nope', value: 1 }] } });
      expect(response.status).toBe(400);
    });

    it('lists encrypted backups (first-user setup creates one)', async () => {
      const response = await backend.request({ path: '/api/encrypted-backups', session });
      expect(response.status).toBe(200);
      expect(response.json.filenames.length).toBeGreaterThan(0);
    });

    it('rejects a path-traversal backup name with 400', async () => {
      const response = await backend.request({ path: '/api/encrypted-backups/..%2Fusers.json', session });
      expect(response.status).toBe(400);
    });
  });

  describe('lock and unlock', () => {
    it('locks the session', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/users/lock', session, body: {} });
      expect(response.status).toBe(200);
      expect(response.json).toEqual({ locked: true });
      expect((await backend.request({ path: '/api/data', session })).status).toBe(401);
    });

    it('rejects a wrong password with 401', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/users/unlock', body: { userId, password: 'wrong-password-wrong-password' } });
      expect(response.status).toBe(401);
    }, 30_000);

    it('unlocks with the right password', async () => {
      const response = await backend.request({ method: 'POST', path: '/api/users/unlock', body: { userId, password: STRONG_PASSWORD } });
      expect(response.status).toBe(200);
      session = response.json.token;
      expect((await backend.request({ path: '/api/data', session })).status).toBe(200);
    }, 30_000);
  });

  describe('persistence across restarts', () => {
    it('keeps users and data after a restart', async () => {
      await backend.stop();
      backend = await startBackend({ dataRoot });
      const list = await backend.request({ path: '/api/users' });
      expect(list.json.users).toEqual([{ id: userId, name: 'Contract' }]);
      const unlock = await backend.request({ method: 'POST', path: '/api/users/unlock', body: { userId, password: STRONG_PASSWORD } });
      const data = await backend.request({ path: '/api/data', session: unlock.json.token });
      expect(data.json.data.data.lastUpdated).toBe(1_700_000_000_000);
    }, 30_000);
  });
});
