import { BASE_CURRENCY, DEFAULT_FX_RATES, SUPPORTED_DISPLAY_CURRENCIES } from './fx';
import { runtimeConfig } from './runtimeConfig';

const FX_API_BASE = 'https://api.frankfurter.dev/v2/rates';
// A fetched rate must stay within this factor of the built-in default (either direction).
// Catches inverted (about 0.19 instead of 5.3) or wildly wrong values; real moves are tiny.
const MAX_DEVIATION_FACTOR = 10;

// The app convention is RON per 1 unit of foreign currency, so ask for base=<foreign>&quotes=RON.
// The service publishes that direct rate; no inversion of a rounded value is needed.
function fxUrlFor(currency) {
  return `${FX_API_BASE}?base=${currency}&quotes=${BASE_CURRENCY}`;
}

// Expected live shape: [{ date, base: 'EUR', quote: 'RON', rate: 5.35 }]. Anything else throws.
function parseRonPerUnit(currency, payload) {
  const entry = Array.isArray(payload)
    ? payload.find((row) => row?.base === currency && row?.quote === BASE_CURRENCY)
    : null;
  const rate = Number(entry?.rate);
  if (!entry || typeof entry.rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`FX refresh returned no usable ${currency} rate`);
  }
  const fallback = DEFAULT_FX_RATES[currency];
  if (rate > fallback * MAX_DEVIATION_FACTOR || rate < fallback / MAX_DEVIATION_FACTOR) {
    throw new Error(`FX refresh returned an implausible ${currency} rate`);
  }
  return rate;
}

async function fetchRonPerUnit(fetchImpl, currency, signal) {
  const response = await fetchImpl(fxUrlFor(currency), { signal });
  if (!response.ok) {
    throw new Error(`FX refresh failed with status ${response.status}`);
  }
  return parseRonPerUnit(currency, await response.json());
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function fetchLatestFxRates(options = {}) {
  if (!runtimeConfig.fxRefreshEnabled) {
    throw new Error('FX refresh is disabled for this deployment profile');
  }

  const fetchImpl = options.fetchImpl || fetch;
  const retries = options.retries ?? runtimeConfig.fxRefreshRetries;
  const retryDelayMs = options.retryDelayMs ?? runtimeConfig.fxRefreshRetryDelayMs;

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const currencies = SUPPORTED_DISPLAY_CURRENCIES.filter((code) => code !== BASE_CURRENCY);
      const rates = await Promise.all(
        currencies.map((code) => fetchRonPerUnit(fetchImpl, code, options.signal)),
      );
      return {
        fxRates: Object.fromEntries(currencies.map((code, index) => [code, rates[index]])),
        fxUpdatedAt: Date.now(),
        fxSource: 'Frankfurter',
      };
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      if (attempt === retries) break;
      await wait(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError || new Error('FX refresh failed');
}
