// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { requestBoundary } from './requestBoundary.js';
import { validateState } from './validateState.js';
const check = (headers, method = 'GET', trustedProxy = false) => {
  let status = 200,
    passed = false;
  const response = {
    status(value) {
      status = value;
      return this;
    },
    json() {},
    setHeader() {},
  };
  requestBoundary({
    allowedHosts: ['example.test', '127.0.0.1:5173'],
    allowedOrigins: ['http://127.0.0.1:5173', 'https://example.test'],
    trustedProxy,
  })({ headers, method, socket: { localPort: 3177 } }, response, () => {
    passed = true;
  });
  return { status, passed };
};
describe('private request boundary', () => {
  it.each([
    'evil.invalid',
    '127.0.0.1.evil.invalid:3177',
    '127.0.0.2:3177',
    'localhost:1234',
    undefined,
  ])('rejects hostile Host %s', (host) => {
    expect(check({ host, 'x-forwarded-host': '127.0.0.1:3177' })).toEqual({
      status: 403,
      passed: false,
    });
  });
  it.each(['null', 'http://evil.invalid', 'http://localhost:1234'])(
    'rejects hostile Origin on reads and writes %s',
    (origin) => {
      for (const method of ['GET', 'POST'])
        expect(check({ host: '127.0.0.1:3177', origin }, method).status).toBe(403);
    },
  );
  it('allows explicit nonbrowser bearer clients and configured reverse-proxy hosts', () => {
    expect(check({ host: '127.0.0.1:3177' }).passed).toBe(true);
    expect(check({ host: 'example.test', origin: 'https://example.test' }, 'POST').passed).toBe(
      true,
    );
  });
  it('requires a custom header before trusted proxy token injection', () => {
    expect(check({ host: '127.0.0.1:5173' }, 'GET', true).status).toBe(403);
    expect(
      check(
        { host: '127.0.0.1:5173', 'x-ssb-client': 'private-ui', 'sec-fetch-site': 'same-origin' },
        'GET',
        true,
      ).passed,
    ).toBe(true);
    expect(
      check(
        { host: '127.0.0.1:5173', 'x-ssb-client': 'private-ui', 'sec-fetch-site': 'cross-site' },
        'GET',
        true,
      ).status,
    ).toBe(403);
  });
  it('rejects invalid financial structure and unsupported envelopes', () => {
    expect(() => validateState({ schemaVersion: 1, data: { accounts: 'invalid' } })).toThrow();
    expect(() => validateState({ schemaVersion: 99, data: {} })).toThrow();
  });
});
