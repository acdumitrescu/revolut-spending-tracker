import { convertAmountToDisplay, DEFAULT_FX_RATES } from './fx';

export const SUPPORTED_DISPLAY_CURRENCIES = ['RON', 'EUR', 'USD'];

const CURRENCY_LOCALES = {
  RON: 'ro-RO',
  EUR: 'de-DE',
  USD: 'en-US',
};

function getCurrencyLocale(currency) {
  return CURRENCY_LOCALES[currency] || 'en-US';
}

export const formatCurrency = (value, currency = 'RON') => {
  return new Intl.NumberFormat(getCurrencyLocale(currency), {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatCurrencyK = (value, currency = 'RON') => {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k ${currency}`;
  return `${Math.round(value)} ${currency}`;
};

export const formatDisplayAmount = (
  value,
  fromCurrency = 'RON',
  displayCurrency = 'RON',
  fxRates = DEFAULT_FX_RATES
) => formatCurrency(convertAmountToDisplay(value, fromCurrency, displayCurrency, fxRates), displayCurrency);

export const formatPercentage = (value, total) => {
  if (!total) return '0%';
  return ((value / total) * 100).toFixed(1) + '%';
};

export const CAT_COLORS = {
  'Shopping': '#4f8cc9',
  'Groceries': '#2ea86b',
  'Health': '#d76659',
  'Transport': '#8f72c8',
  'Food & Dining': '#d88c37',
  'Telecom': '#53a8bb',
  'Subscriptions': '#4aa67d',
  'Tech & Cloud': '#70829d',
  'Sports & Fitness': '#63b06e',
  'Entertainment': '#cc697f',
  'Personal Care': '#b27ec5',
  'Education': '#5d92df',
  'Utilities': '#7b7f89',
  'Gambling': '#cb5b56',
  'Cash': '#9ba3ae',
  'Travel': '#467cb8',
  'Fees': '#b9b4ac',
  'Other': '#8794a4',
  'Income': '#1f9d5a',
  'Transfers': '#6c7480',
  'Savings': '#3b7bc7'
};

export const EXPENSE_CATS = new Set([
  'Groceries', 'Food & Dining', 'Transport', 'Telecom',
  'Entertainment', 'Gambling', 'Health', 'Personal Care', 'Sports & Fitness', 'Shopping',
  'Subscriptions', 'Tech & Cloud', 'Education', 'Utilities', 'Travel', 'Cash', 'Fees', 'Other'
]);

export const getColorForCategory = (cat) => {
  return CAT_COLORS[cat] || '#64748B';
};
