// @vitest-environment node
import path from 'node:path';
import process from 'node:process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { app } from './server.js';
import { isSafeSyncToken } from './syncToken.js';
import {
  DEFAULT_APP_STATE_FILE,
  DEFAULT_VENDOR_OBSERVATIONS_FILE,
  resolveAppStateFile,
  resolveVendorObservationsFile,
} from './storagePath.js';

describe('private sync storage path', () => {
  it('defaults to a repo-local ignored path for local server runs', () => {
    expect(DEFAULT_APP_STATE_FILE).toBe(path.resolve(
      process.cwd(),
      'private-data',
      'private-sync',
      'app-state.json'
    ));
    expect(resolveAppStateFile()).toBe(DEFAULT_APP_STATE_FILE);
  });

  it('preserves explicit APP_STATE_FILE overrides', () => {
    expect(resolveAppStateFile('/data/app-state.json')).toBe('/data/app-state.json');
  });

  it('defaults vendor observations to a repo-local ignored path', () => {
    expect(DEFAULT_VENDOR_OBSERVATIONS_FILE).toBe(path.resolve(
      process.cwd(),
      'private-data',
      'private-sync',
      'vendor-observations.json'
    ));
    expect(resolveVendorObservationsFile()).toBe(DEFAULT_VENDOR_OBSERVATIONS_FILE);
  });
});

describe('private sync authentication', () => {
  async function withServer(run) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();

    try {
      await run(`http://127.0.0.1:${address.port}`);
    } finally {
      server.close();
      await once(server, 'close');
    }
  }

  it('rejects missing and incorrect bearer tokens before reading private data', async () => {
    const previousToken = process.env.SSB_SYNC_TOKEN;
    process.env.SSB_SYNC_TOKEN = 'synthetic-test-token-32-characters-minimum';

    try {
      await withServer(async (baseUrl) => {
        const missing = await fetch(`${baseUrl}/api/data`);
        const incorrect = await fetch(`${baseUrl}/api/data`, {
          headers: { Authorization: 'Bearer incorrect-token' },
        });
        const equivalentPrivateEndpoint = await fetch(`${baseUrl}/api/vendor-observations`);
        const backupEndpoint = await fetch(`${baseUrl}/api/backups`, { method: 'POST' });

        expect(missing.status).toBe(401);
        expect(incorrect.status).toBe(401);
        expect(equivalentPrivateEndpoint.status).toBe(401);
        expect(backupEndpoint.status).toBe(401);
        expect(missing.headers.get('www-authenticate')).toBe('Bearer');
      });
    } finally {
      if (previousToken === undefined) delete process.env.SSB_SYNC_TOKEN;
      else process.env.SSB_SYNC_TOKEN = previousToken;
    }
  });

  it('rejects the documented placeholder even though it meets the length requirement', () => {
    expect(isSafeSyncToken('replace-with-a-long-random-token')).toBe(false);
    expect(isSafeSyncToken('short-token')).toBe(false);
    expect(isSafeSyncToken('synthetic-test-token-32-characters-minimum')).toBe(true);
  });

  it('allows an authenticated request through to normal validation', async () => {
    const previousToken = process.env.SSB_SYNC_TOKEN;
    process.env.SSB_SYNC_TOKEN = 'synthetic-test-token-32-characters-minimum';

    try {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/data`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer synthetic-test-token-32-characters-minimum',
            'Content-Type': 'application/json',
            Origin: 'http://127.0.0.1:3176',
          },
          body: JSON.stringify({ data: null }),
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: 'Request body must include a data object',
        });
      });
    } finally {
      if (previousToken === undefined) delete process.env.SSB_SYNC_TOKEN;
      else process.env.SSB_SYNC_TOKEN = previousToken;
    }
  });

  it('validates quote requests after authentication without contacting Yahoo', async () => {
    const previousToken = process.env.SSB_SYNC_TOKEN;
    process.env.SSB_SYNC_TOKEN = 'synthetic-test-token-32-characters-minimum';

    try {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/quotes?symbols=bad%20symbol`, {
          headers: {
            Authorization: 'Bearer synthetic-test-token-32-characters-minimum',
          },
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: 'Invalid quote symbol: BAD SYMBOL',
        });
      });
    } finally {
      if (previousToken === undefined) delete process.env.SSB_SYNC_TOKEN;
      else process.env.SSB_SYNC_TOKEN = previousToken;
    }
  });

  it('validates Yahoo instrument searches after authentication', async () => {
    const previousToken = process.env.SSB_SYNC_TOKEN;
    process.env.SSB_SYNC_TOKEN = 'synthetic-test-token-32-characters-minimum';

    try {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/instruments/search?q=a`, {
          headers: { Authorization: 'Bearer synthetic-test-token-32-characters-minimum' },
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: 'Use at least two characters to search instruments',
        });
      });
    } finally {
      if (previousToken === undefined) delete process.env.SSB_SYNC_TOKEN;
      else process.env.SSB_SYNC_TOKEN = previousToken;
    }
  });

  it('keeps health checks public without exposing sync metadata', async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/healthz`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    });
  });
});
