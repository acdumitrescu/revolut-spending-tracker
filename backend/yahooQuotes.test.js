// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fetchYahooQuotes, normalizeYahooSymbols, searchYahooInstruments } from './yahooQuotes.js';

function yahooResponse(meta, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue({
      chart: {
        result: [{ meta }],
        error: null,
      },
    }),
  };
}

describe('Yahoo quote provider', () => {
  it('normalizes, deduplicates, and validates symbols', () => {
    expect(normalizeYahooSymbols([' aapl ', 'AAPL', 'tlv.ro', '^gspc'])).toEqual([
      'AAPL',
      'TLV.RO',
      '^GSPC',
    ]);
    expect(() => normalizeYahooSymbols(['bad symbol'])).toThrow('Invalid quote symbol');
    expect(() => normalizeYahooSymbols([])).toThrow('At least one quote symbol');
  });

  it('returns normalized quote metadata without receiving portfolio details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      yahooResponse({
        symbol: 'AAPL',
        regularMarketPrice: 214.4,
        currency: 'USD',
        marketState: 'CLOSED',
        fullExchangeName: 'NasdaqGS',
        regularMarketTime: 1_720_000_000,
        exchangeDataDelayedBy: 0,
      }),
    );

    const result = await fetchYahooQuotes(['AAPL'], {
      fetchImpl,
      cache: new Map(),
      now: () => 1_720_000_001_000,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toContain('/AAPL?interval=1d&range=5d');
    expect(result.quotes).toEqual([
      {
        symbol: 'AAPL',
        price: 214.4,
        currency: 'USD',
        marketState: 'CLOSED',
        exchange: 'NasdaqGS',
        updatedAt: 1_720_000_000_000,
        delayedBySeconds: 0,
        source: 'yahoo-unofficial',
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it('keeps per-symbol failures separate from successful quotes', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        yahooResponse({
          symbol: 'AAPL',
          regularMarketPrice: 200,
          currency: 'USD',
        }),
      )
      .mockResolvedValueOnce(yahooResponse({}, false, 404));

    const result = await fetchYahooQuotes(['AAPL', 'UNKNOWN'], {
      fetchImpl,
      cache: new Map(),
      now: () => 10_000,
    });

    expect(result.quotes).toHaveLength(1);
    expect(result.errors).toEqual([
      {
        symbol: 'UNKNOWN',
        message: 'Yahoo returned HTTP 404',
      },
    ]);
  });

  it('uses successful cached quotes within the cache window', async () => {
    const cache = new Map();
    const fetchImpl = vi.fn().mockResolvedValue(
      yahooResponse({
        symbol: 'AAPL',
        regularMarketPrice: 200,
        currency: 'USD',
      }),
    );

    await fetchYahooQuotes(['AAPL'], { fetchImpl, cache, now: () => 10_000 });
    await fetchYahooQuotes(['AAPL'], { fetchImpl, cache, now: () => 20_000 });

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('searches and normalizes Yahoo instruments without sending holding details', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        quotes: [
          {
            symbol: 'TLV.RO',
            shortname: 'Banca Transilvania',
            quoteType: 'EQUITY',
            exchange: 'BVB',
            currency: 'RON',
          },
        ],
      }),
    });

    const results = await searchYahooInstruments('transilvania', {
      fetchImpl,
      cache: new Map(),
      now: () => 10_000,
    });

    expect(fetchImpl.mock.calls[0][0]).toContain('q=transilvania');
    expect(results).toEqual([
      expect.objectContaining({
        ticker: 'TLV.RO',
        quoteSymbol: 'TLV.RO',
        name: 'Banca Transilvania',
        exchange: 'BVB',
        currency: 'RON',
        assetClass: 'Stock',
      }),
    ]);
  });

  it('validates short Yahoo search queries before an upstream request', async () => {
    const fetchImpl = vi.fn();
    await expect(searchYahooInstruments('a', { fetchImpl })).rejects.toMatchObject({
      status: 400,
      message: 'Use at least two characters to search instruments',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
