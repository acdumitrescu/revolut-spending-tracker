import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestFxRates } from '../lib/fxService';

const EUR_URL = 'https://api.frankfurter.dev/v2/rates?base=EUR&quotes=RON';
const USD_URL = 'https://api.frankfurter.dev/v2/rates?base=USD&quotes=RON';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const row = (base, rate, quote = 'RON') => [{ date: '2026-11-16', base, quote, rate }];

function routed(overrides = {}) {
  return vi.fn(async (url) => {
    if (url in overrides) return overrides[url]();
    return ok(url === EUR_URL ? row('EUR', 5.3527) : row('USD', 4.8333));
  });
}

const opts = { retries: 0, retryDelayMs: 1 };

afterEach(() => vi.useRealTimers());

describe('fetchLatestFxRates', () => {
  it('parses the real array shape into RON per unit', async () => {
    const fetchImpl = routed();
    const result = await fetchLatestFxRates({ ...opts, fetchImpl });
    expect(result.fxRates).toEqual({ EUR: 5.3527, USD: 4.8333 });
    expect(result.fxSource).toBe('Frankfurter');
    expect(Number.isFinite(result.fxUpdatedAt)).toBe(true);
    expect(fetchImpl.mock.calls.map(([url]) => url).sort()).toEqual([EUR_URL, USD_URL]);
  });

  it.each([
    ['old object shape', { rates: { EUR: 5.3, USD: 4.8 } }],
    ['empty object', {}],
    ['null', null],
    ['empty array', []],
    ['string', 'nope'],
    ['error body', { status: 422, message: 'invalid currency: EUR' }],
  ])('throws on %s instead of returning default rates', async (_name, body) => {
    const fetchImpl = routed({ [EUR_URL]: () => ok(body) });
    await expect(fetchLatestFxRates({ ...opts, fetchImpl })).rejects.toThrow(/EUR/);
  });

  it('throws when one currency is missing or points at the wrong pair', async () => {
    await expect(
      fetchLatestFxRates({ ...opts, fetchImpl: routed({ [USD_URL]: () => ok([]) }) }),
    ).rejects.toThrow(/USD/);
    await expect(
      fetchLatestFxRates({
        ...opts,
        fetchImpl: routed({ [USD_URL]: () => ok(row('USD', 0.2069, 'EUR')) }),
      }),
    ).rejects.toThrow(/USD/);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5.3', null])(
    'rejects unusable rate %s',
    async (rate) => {
      const fetchImpl = routed({ [EUR_URL]: () => ok(row('EUR', rate)) });
      await expect(fetchLatestFxRates({ ...opts, fetchImpl })).rejects.toThrow(/EUR/);
    },
  );

  it('rejects inverted-looking and absurd values', async () => {
    for (const rate of [0.18682, 0.2069, 53.5, 5000]) {
      const fetchImpl = routed({ [EUR_URL]: () => ok(row('EUR', rate)) });
      await expect(fetchLatestFxRates({ ...opts, fetchImpl })).rejects.toThrow(/implausible/);
    }
  });

  it('throws on a non-OK status', async () => {
    const fetchImpl = routed({ [USD_URL]: async () => ({ ok: false, status: 422 }) });
    await expect(fetchLatestFxRates({ ...opts, fetchImpl })).rejects.toThrow('status 422');
  });

  it('retries after a failure and then succeeds', async () => {
    let failures = 1;
    const fetchImpl = vi.fn(async (url) => {
      if (failures > 0) {
        failures -= 1;
        throw new TypeError('offline');
      }
      return ok(url === EUR_URL ? row('EUR', 5.3527) : row('USD', 4.8333));
    });
    const result = await fetchLatestFxRates({ fetchImpl, retries: 2, retryDelayMs: 1 });
    expect(result.fxRates).toEqual({ EUR: 5.3527, USD: 4.8333 });
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(2);
  });

  it('gives up after the configured retries with the last error', async () => {
    const fetchImpl = vi.fn(async () => ok({ rates: {} }));
    await expect(fetchLatestFxRates({ fetchImpl, retries: 1, retryDelayMs: 1 })).rejects.toThrow(
      /no usable/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not retry once aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      fetchLatestFxRates({ fetchImpl, signal: controller.signal, retries: 3, retryDelayMs: 1 }),
    ).rejects.toThrow('aborted');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
