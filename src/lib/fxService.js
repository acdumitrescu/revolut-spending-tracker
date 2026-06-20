import { normalizeFxRates } from './fx';
import { runtimeConfig } from './runtimeConfig';

const FX_API_URL = 'https://api.frankfurter.dev/v2/rates?base=RON&quotes=EUR,USD';

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
      const response = await fetchImpl(FX_API_URL, {
        signal: options.signal,
      });

      if (!response.ok) {
        throw new Error(`FX refresh failed with status ${response.status}`);
      }

      const payload = await response.json();
      const nextRates = normalizeFxRates(payload?.rates);
      return {
        fxRates: nextRates,
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
