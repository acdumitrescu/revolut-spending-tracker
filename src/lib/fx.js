import { BASE_CURRENCY, SUPPORTED_DISPLAY_CURRENCIES, DEFAULT_FX_RATES } from '../../backend/stateConstants.js';
export { BASE_CURRENCY, SUPPORTED_DISPLAY_CURRENCIES, DEFAULT_FX_RATES };

export function normalizeCurrencyCode(currency) {
  if (typeof currency !== 'string' || !currency.trim()) return BASE_CURRENCY;
  return currency.trim().toUpperCase();
}

export function getEffectiveCurrency(txnOrCurrency) {
  if (typeof txnOrCurrency === 'string') {
    return normalizeCurrencyCode(txnOrCurrency);
  }

  return normalizeCurrencyCode(txnOrCurrency?.currency);
}

export function normalizeFxRates(rawRates) {
  const rates = {
    ...DEFAULT_FX_RATES,
  };

  if (rawRates && typeof rawRates === 'object') {
    for (const currency of SUPPORTED_DISPLAY_CURRENCIES) {
      if (currency === BASE_CURRENCY) continue;
      const nextValue = Number(rawRates[currency]);
      if (Number.isFinite(nextValue) && nextValue > 0) {
        rates[currency] = nextValue;
      }
    }
  }

  return rates;
}

export function getRateForCurrency(currency, fxRates = DEFAULT_FX_RATES) {
  const normalized = normalizeCurrencyCode(currency);
  if (normalized === BASE_CURRENCY) return 1;
  return normalizeFxRates(fxRates)[normalized] || null;
}

export function convertAmount(amount, fromCurrency = BASE_CURRENCY, toCurrency = BASE_CURRENCY, fxRates = DEFAULT_FX_RATES) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 0;

  const source = normalizeCurrencyCode(fromCurrency);
  const target = normalizeCurrencyCode(toCurrency);
  if (source === target) return numericAmount;

  const sourceRate = getRateForCurrency(source, fxRates);
  const targetRate = getRateForCurrency(target, fxRates);
  if (!sourceRate || !targetRate) {
    const missingCurrency = !sourceRate ? source : target;
    throw new Error(`Missing FX rate for ${missingCurrency}; aggregate conversion was blocked.`);
  }

  const amountInRon = source === BASE_CURRENCY ? numericAmount : numericAmount * sourceRate;
  return target === BASE_CURRENCY ? amountInRon : amountInRon / targetRate;
}

export function convertAmountToDisplay(amount, fromCurrency, displayCurrency, fxRates = DEFAULT_FX_RATES) {
  return convertAmount(amount, fromCurrency, displayCurrency, fxRates);
}
