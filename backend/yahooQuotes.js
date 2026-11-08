const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,32}$/;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_SYMBOLS = 25;

const quoteCache = new Map();
const searchCache = new Map();

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function normalizeYahooSymbols(values) {
  const symbols = [...new Set(
    values
      .map((value) => String(value || '').trim().toUpperCase())
      .filter(Boolean)
  )];

  if (symbols.length === 0) {
    throw requestError('At least one quote symbol is required');
  }
  if (symbols.length > MAX_SYMBOLS) {
    throw requestError(`A maximum of ${MAX_SYMBOLS} quote symbols is allowed`);
  }

  const invalidSymbol = symbols.find((symbol) => !SYMBOL_PATTERN.test(symbol));
  if (invalidSymbol) {
    throw requestError(`Invalid quote symbol: ${invalidSymbol}`);
  }

  return symbols;
}

function normalizeQuote(symbol, payload, fallbackUpdatedAt) {
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice);

  if (!meta || !Number.isFinite(price) || price < 0) {
    throw new Error('Yahoo returned no usable market price');
  }

  const marketTimestamp = Number(meta.regularMarketTime);
  const delayedBySeconds = Number(meta.exchangeDataDelayedBy);

  return {
    symbol: String(meta.symbol || symbol).trim().toUpperCase(),
    price,
    currency: String(meta.currency || '').trim().toUpperCase(),
    marketState: String(meta.marketState || '').trim() || null,
    exchange: String(meta.fullExchangeName || meta.exchangeName || '').trim() || null,
    updatedAt: Number.isFinite(marketTimestamp) && marketTimestamp > 0
      ? marketTimestamp * 1000
      : fallbackUpdatedAt,
    delayedBySeconds: Number.isFinite(delayedBySeconds) && delayedBySeconds >= 0
      ? delayedBySeconds
      : null,
    source: 'yahoo-unofficial',
  };
}

async function fetchOneQuote(symbol, { fetchImpl, timeoutMs, now }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Yahoo returned HTTP ${response.status}`);
    }

    return normalizeQuote(symbol, await response.json(), now);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeSearchQuery(value) {
  const query = String(value || '').trim();
  if (query.length < 2) throw requestError('Use at least two characters to search instruments');
  if (query.length > 80) throw requestError('Instrument search is limited to 80 characters');
  return query;
}

function normalizeSearchResult(result) {
  const symbol = String(result?.symbol || '').trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) return null;
  const quoteType = String(result?.quoteType || '').trim().toUpperCase();
  return {
    ticker: symbol,
    quoteSymbol: symbol,
    name: String(result?.shortname || result?.longname || symbol).trim(),
    exchange: String(result?.exchange || result?.fullExchangeName || '').trim() || 'Yahoo',
    currency: String(result?.currency || '').trim().toUpperCase() || null,
    assetClass: quoteType === 'ETF' || quoteType === 'MUTUALFUND' ? 'ETF' : 'Stock',
    market: 'Yahoo search',
  };
}

export async function searchYahooInstruments(value, options = {}) {
  const query = normalizeSearchQuery(value);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now?.() ?? Date.now();
  const cache = options.cache || searchCache;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_SEARCH_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheKey = query.toLocaleLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.cachedAt < cacheTtlMs) return cached.results;
  if (typeof fetchImpl !== 'function') throw requestError('Instrument search is unavailable', 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      q: query,
      quotesCount: '10',
      newsCount: '0',
      enableFuzzyQuery: 'false',
    });
    const response = await fetchImpl(`${YAHOO_SEARCH_URL}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Yahoo returned HTTP ${response.status}`);
    const payload = await response.json();
    const results = (Array.isArray(payload?.quotes) ? payload.quotes : [])
      .map(normalizeSearchResult)
      .filter(Boolean)
      .slice(0, 10);
    cache.set(cacheKey, { results, cachedAt: now });
    return results;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchYahooQuotes(values, options = {}) {
  const symbols = normalizeYahooSymbols(values);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now?.() ?? Date.now();
  const cache = options.cache || quoteCache;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (typeof fetchImpl !== 'function') {
    throw requestError('Quote lookup is unavailable', 503);
  }

  const results = await Promise.all(symbols.map(async (symbol) => {
    const cached = cache.get(symbol);
    if (cached && now - cached.cachedAt < cacheTtlMs) {
      return { quote: cached.quote };
    }

    try {
      const quote = await fetchOneQuote(symbol, { fetchImpl, timeoutMs, now });
      cache.set(symbol, { quote, cachedAt: now });
      return { quote };
    } catch (error) {
      return {
        error: {
          symbol,
          message: error?.name === 'AbortError'
            ? 'Yahoo quote request timed out'
            : String(error?.message || 'Yahoo quote request failed'),
        },
      };
    }
  }));

  return {
    quotes: results.flatMap((result) => result.quote ? [result.quote] : []),
    errors: results.flatMap((result) => result.error ? [result.error] : []),
    source: 'yahoo-unofficial',
    fetchedAt: new Date(now).toISOString(),
  };
}

export function clearYahooQuoteCache() {
  quoteCache.clear();
  searchCache.clear();
}
