import { once } from 'node:events';
import http from 'node:http';
import process from 'node:process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The limit is read when server.js loads, so set a tiny one and import a fresh copy.
let server;
let base;

beforeAll(async () => {
  vi.resetModules();
  process.env.SSB_RATE_LIMIT_PER_MINUTE = '3';
  const { app } = await import('./server.js');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  delete process.env.SSB_RATE_LIMIT_PER_MINUTE;
  await new Promise((resolve) => server.close(resolve));
});

// Plain node:http, so the test does not depend on the global fetch (the shared test setup stubs it).
function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, headers: response.headers, body }),
        );
      })
      .on('error', reject);
  });
}

describe('rate limiting', () => {
  it('answers 429 with a JSON error once a client exceeds its budget', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await get(`${base}/api/health`);
      statuses.push(response.status);
      if (i === 3) {
        expect(JSON.parse(response.body)).toEqual({
          error: 'Too many requests, slow down and try again shortly',
        });
        expect(response.headers['ratelimit-policy']).toContain('3');
      }
    }
    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses[3]).toBe(429);
  });
});
