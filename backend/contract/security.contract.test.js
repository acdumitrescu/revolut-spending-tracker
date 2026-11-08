// @vitest-environment node
// Backend contract: security behaviour (headers, Host guard, limits, bind address,
// secret hygiene). See docs/desktop/security-checklist.md.
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDataRoot, startBackend } from './harness.js';

const cleanup = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()();
});

async function scratch() {
  const dataRoot = await makeDataRoot();
  cleanup.push(() => fs.rm(dataRoot, { recursive: true, force: true }));
  return dataRoot;
}

async function backendWithSite(extraEnv = {}) {
  const dataRoot = await scratch();
  const site = path.join(dataRoot, 'site');
  await fs.mkdir(path.join(site, 'assets'), { recursive: true });
  await fs.writeFile(path.join(site, 'index.html'), '<!doctype html><title>contract-ui</title>');
  await fs.writeFile(path.join(site, 'assets', 'app.js'), 'console.log("contract");');
  await fs.writeFile(path.join(dataRoot, 'secret.txt'), 'OUTSIDE-THE-SITE-DIRECTORY');
  const backend = await startBackend({ dataRoot, extraEnv: { SSB_STATIC_DIR: site, ...extraEnv } });
  cleanup.push(() => backend.stop());
  return backend;
}

describe('backend contract: security headers', () => {
  it('sends a strict CSP and framing/referrer protection on every response type', async () => {
    const backend = await backendWithSite();
    const responses = [
      await backend.request({ path: '/healthz', auth: false }),
      await backend.request({ path: '/', auth: false }),
      await backend.request({ path: '/assets/app.js', auth: false }),
      await backend.request({ path: '/api/users' }),
      await backend.request({ path: '/api/users', auth: false }),
    ];
    for (const response of responses) {
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/);
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  }, 30_000);
});

describe('backend contract: Host guard on every route (DNS rebinding)', () => {
  it('rejects a foreign Host on /healthz and the static UI', async () => {
    const backend = await backendWithSite();
    for (const urlPath of ['/healthz', '/', '/assets/app.js', '/app/budgets']) {
      const response = await backend.request({ path: urlPath, auth: false, headers: { Host: 'evil.example:80' } });
      expect(response.status, urlPath).toBe(403);
      expect(response.text, urlPath).not.toContain('contract-ui');
    }
  }, 30_000);

  it('rejects a foreign Host before authentication is evaluated', async () => {
    const backend = await backendWithSite();
    const response = await backend.request({ path: '/api/users', auth: false, headers: { Host: 'rebind.example:80' } });
    expect(response.status).toBe(403);
  }, 30_000);

  it('rejects the right host on the wrong port', async () => {
    const backend = await backendWithSite();
    const response = await backend.request({ path: '/healthz', auth: false, headers: { Host: `127.0.0.1:${backend.port + 1}` } });
    expect(response.status).toBe(403);
  }, 30_000);
});

describe('backend contract: static file confinement', () => {
  it('never serves files outside the static directory', async () => {
    const backend = await backendWithSite();
    for (const urlPath of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt', '/%2e%2e%2fsecret.txt', '/..%5csecret.txt']) {
      const response = await backend.request({ path: urlPath, auth: false });
      expect(response.text, urlPath).not.toContain('OUTSIDE-THE-SITE-DIRECTORY');
    }
  }, 30_000);
});

describe('backend contract: request limits', () => {
  it('answers an oversized JSON body with 413', async () => {
    const backend = await backendWithSite({ APP_STATE_MAX_BYTES: String(1024 * 1024) });
    const response = await backend.request({ method: 'POST', path: '/api/users', body: { name: 'x'.repeat(2 * 1024 * 1024), password: 'y' } });
    expect(response.status).toBe(413);
    expect(response.json).toEqual({ error: 'Request payload too large' });
  }, 30_000);

  it('throttles repeated user create/unlock attempts with 429', async () => {
    const backend = await backendWithSite();
    const statuses = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await backend.request({ method: 'POST', path: '/api/users', body: { name: 'Weak', password: 'short' } });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  }, 30_000);
});

describe('backend contract: startup refusals', () => {
  it('refuses a non-loopback HOST in local-users mode', async () => {
    const dataRoot = await scratch();
    await expect(startBackend({ dataRoot, extraEnv: { HOST: '0.0.0.0' } })).rejects.toThrow(/loopback-only host/);
  }, 30_000);

  it('refuses to start with a weak sync token and never listens', async () => {
    const dataRoot = await scratch();
    await expect(startBackend({ dataRoot, extraEnv: { SSB_SYNC_TOKEN: 'too-short' } })).rejects.toThrow(/SSB_SYNC_TOKEN must be a unique secret/);
  }, 30_000);
});

describe('backend contract: network exposure and secret hygiene', () => {
  it('accepts connections on loopback only', async () => {
    const backend = await backendWithSite();
    const external = Object.values(os.networkInterfaces())
      .flat()
      .find((entry) => entry && entry.family === 'IPv4' && !entry.internal);
    if (!external) return; // No non-loopback interface (CI sandbox): nothing to probe.
    const error = await new Promise((resolve) => {
      const socket = net.connect({ host: external.address, port: backend.port });
      socket.setTimeout(3000, () => { socket.destroy(); resolve(new Error('timeout')); });
      socket.once('error', resolve);
      socket.once('connect', () => { socket.destroy(); resolve(null); });
    });
    expect(error, 'backend is reachable on a non-loopback address').not.toBeNull();
    expect(error.code).toBe('ECONNREFUSED');
  }, 30_000);

  it('never writes the sync token or a presented bad token to its log', async () => {
    const backend = await backendWithSite();
    const badToken = 'bad-token-'.padEnd(64, 'z');
    await backend.request({ path: '/api/users' });
    await backend.request({ path: '/api/users', headers: { Authorization: `Bearer ${badToken}` } });
    await backend.request({ path: '/api/users', auth: false });
    await backend.request({ method: 'POST', path: '/api/users', body: { name: 'Weak', password: 'not-logged-password' } });
    const log = backend.output();
    expect(log).not.toContain(backend.token);
    expect(log).not.toContain(badToken);
    expect(log).not.toContain('not-logged-password');
  }, 30_000);

  it('answers malformed JSON with a generic 400: no stack, path, or echoed body, nothing logged', async () => {
    const backend = await backendWithSite();
    for (const rawBody of ['{"name":', '{"password":"echo-me-not",,}', '\u0000\u0001not json']) {
      const response = await backend.request({ method: 'POST', path: '/api/users', rawBody });
      expect(response.status, rawBody).toBe(400);
      expect(response.json, rawBody).toEqual({ error: 'Invalid request body' });
      expect(response.text, rawBody).not.toMatch(/\bat\s+\S+\s+\(|node_modules|\/Users\/|echo-me-not|SyntaxError/);
    }
    expect(backend.output()).not.toContain('echo-me-not');
  }, 30_000);
});
