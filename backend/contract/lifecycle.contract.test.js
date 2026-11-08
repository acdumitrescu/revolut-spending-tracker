// @vitest-environment node
// Backend contract: process lifecycle and optional static UI. See docs/desktop/backend-contract.md §1, §4.
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDataRoot, startBackend, withTimeout } from './harness.js';

const cleanup = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()();
});

async function scratch() {
  const dataRoot = await makeDataRoot();
  cleanup.push(() => fs.rm(dataRoot, { recursive: true, force: true }));
  return dataRoot;
}

describe('backend contract: lifecycle', () => {
  it('prints the readiness line', async () => {
    const backend = await startBackend({ dataRoot: await scratch() });
    cleanup.push(() => backend.stop());
    expect(backend.output()).toContain(`SSB API listening on 127.0.0.1:${backend.port}`);
  }, 30_000);

  it('exits 0 on SIGTERM', async () => {
    const backend = await startBackend({ dataRoot: await scratch() });
    cleanup.push(() => backend.child.kill('SIGKILL'));
    backend.child.kill('SIGTERM');
    const result = await withTimeout(backend.exited, 10_000, 'no exit after SIGTERM');
    expect(result.code).toBe(0);
  }, 30_000);

  it('exits 0 when stdin closes and SSB_EXIT_ON_STDIN_CLOSE=true', async () => {
    const backend = await startBackend({ dataRoot: await scratch(), stdin: 'pipe', extraEnv: { SSB_EXIT_ON_STDIN_CLOSE: 'true' } });
    cleanup.push(() => backend.child.kill('SIGKILL'));
    backend.child.stdin.end();
    const result = await withTimeout(backend.exited, 10_000, 'no exit after stdin closed');
    expect(result.code).toBe(0);
  }, 30_000);

  it('keeps running when stdin closes without the flag', async () => {
    const backend = await startBackend({ dataRoot: await scratch(), stdin: 'pipe' });
    cleanup.push(() => backend.stop());
    backend.child.stdin.end();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await backend.request({ path: '/healthz', auth: false })).status).toBe(200);
  }, 30_000);
});

describe('backend contract: static UI (SSB_STATIC_DIR)', () => {
  async function staticBackend() {
    const dataRoot = await scratch();
    const site = path.join(dataRoot, 'site');
    await fs.mkdir(path.join(site, 'assets'), { recursive: true });
    await fs.writeFile(path.join(site, 'index.html'), '<!doctype html><title>contract-ui</title>');
    await fs.writeFile(path.join(site, 'assets', 'app.js'), 'console.log("contract");');
    const backend = await startBackend({ dataRoot, extraEnv: { SSB_STATIC_DIR: site } });
    cleanup.push(() => backend.stop());
    return backend;
  }

  it('serves index.html at /', async () => {
    const backend = await staticBackend();
    const response = await backend.request({ path: '/', auth: false });
    expect(response.status).toBe(200);
    expect(response.text).toContain('contract-ui');
  }, 30_000);

  it('serves built assets', async () => {
    const backend = await staticBackend();
    const response = await backend.request({ path: '/assets/app.js', auth: false });
    expect(response.status).toBe(200);
    expect(response.text).toContain('contract');
  }, 30_000);

  it('falls back to index.html for client-side routes', async () => {
    const backend = await staticBackend();
    const response = await backend.request({ path: '/app/budgets', auth: false });
    expect(response.status).toBe(200);
    expect(response.text).toContain('contract-ui');
  }, 30_000);

  it('never answers /api with the fallback', async () => {
    const backend = await staticBackend();
    const response = await backend.request({ path: '/api/not-a-route', auth: false });
    expect(response.status).toBe(401);
    expect(response.text).not.toContain('contract-ui');
  }, 30_000);

  it('does not serve static files when SSB_STATIC_DIR is unset', async () => {
    const backend = await startBackend({ dataRoot: await scratch() });
    cleanup.push(() => backend.stop());
    const response = await backend.request({ path: '/', auth: false });
    expect(response.status).toBe(404);
  }, 30_000);
});
