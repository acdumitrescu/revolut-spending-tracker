import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPortfolioQuotes,
  isYahooQuoteSymbol,
  searchYahooInstruments,
} from '../lib/quoteService';
import { clearSyncAccessToken, setSyncAccessToken } from '../lib/serverSync';

afterEach(() => {
  clearSyncAccessToken();
  vi.unstubAllGlobals();
});

describe('portfolio quote service', () => {
  it('accepts common Yahoo symbol formats and rejects unsafe values', () => {
    expect(isYahooQuoteSymbol('TLV.RO')).toBe(true);
    expect(isYahooQuoteSymbol('BRK-B')).toBe(true);
    expect(isYahooQuoteSymbol('^GSPC')).toBe(true);
    expect(isYahooQuoteSymbol('EURUSD=X')).toBe(true);
    expect(isYahooQuoteSymbol('bad symbol')).toBe(false);
  });

  it('deduplicates symbols and authenticates the server-side quote request', async () => {
    setSyncAccessToken('synthetic-session-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        quotes: [{ symbol: 'AAPL', price: 200, currency: 'USD' }],
        errors: [],
        source: 'yahoo-unofficial',
        fetchedAt: '2026-07-25T12:00:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPortfolioQuotes([' aapl ', 'AAPL']);

    expect(fetchMock).toHaveBeenCalledWith('/api/quotes?symbols=AAPL', {
      credentials: 'same-origin',
      headers: { Authorization: 'Bearer synthetic-session-token' },
      signal: undefined,
    });
    expect(result.quotes[0]).toMatchObject({ symbol: 'AAPL', price: 200 });
  });

  it('surfaces server errors with their status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Unable to retrieve market quotes' }),
      }),
    );

    await expect(fetchPortfolioQuotes(['AAPL'])).rejects.toMatchObject({
      status: 502,
      message: 'Unable to retrieve market quotes',
    });
  });

  it('searches Yahoo through the authenticated private server', async () => {
    setSyncAccessToken('synthetic-session-token');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ instruments: [{ ticker: 'TLV.RO', quoteSymbol: 'TLV.RO' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchYahooInstruments('Banca Transilvania')).resolves.toEqual([
      { ticker: 'TLV.RO', quoteSymbol: 'TLV.RO' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/instruments/search?q=Banca+Transilvania',
      expect.objectContaining({ headers: { Authorization: 'Bearer synthetic-session-token' } }),
    );
  });
});
