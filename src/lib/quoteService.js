import { runtimeConfig } from './runtimeConfig';
import { getSyncAuthorizationHeaders } from './serverSync';

const YAHOO_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,32}$/;

export function isYahooQuoteSymbol(symbol) {
  return YAHOO_SYMBOL_PATTERN.test(
    String(symbol || '')
      .trim()
      .toUpperCase(),
  );
}

function normalizeSymbols(symbols) {
  const normalized = [
    ...new Set(
      symbols
        .map((symbol) =>
          String(symbol || '')
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  ];
  const invalidSymbol = normalized.find((symbol) => !isYahooQuoteSymbol(symbol));
  if (invalidSymbol) throw new Error(`Invalid Yahoo quote symbol: ${invalidSymbol}`);
  return normalized;
}

export async function fetchPortfolioQuotes(symbols, signal) {
  const normalizedSymbols = normalizeSymbols(symbols);
  if (normalizedSymbols.length === 0) {
    return { quotes: [], errors: [], source: 'yahoo-unofficial', fetchedAt: null };
  }

  const query = new URLSearchParams({ symbols: normalizedSymbols.join(',') });
  const response = await fetch(`${runtimeConfig.apiBasePath}/quotes?${query}`, {
    credentials: 'same-origin',
    headers: getSyncAuthorizationHeaders(),
    signal,
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const error = new Error(body?.error || `Quote server returned ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return {
    quotes: Array.isArray(body?.quotes) ? body.quotes : [],
    errors: Array.isArray(body?.errors) ? body.errors : [],
    source: body?.source || 'yahoo-unofficial',
    fetchedAt: body?.fetchedAt || null,
  };
}

export async function searchYahooInstruments(query, signal) {
  const params = new URLSearchParams({ q: String(query || '').trim() });
  const response = await fetch(`${runtimeConfig.apiBasePath}/instruments/search?${params}`, {
    credentials: 'same-origin',
    headers: getSyncAuthorizationHeaders(),
    signal,
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const error = new Error(body?.error || `Instrument search returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return Array.isArray(body?.instruments) ? body.instruments : [];
}
