const BRAND_VISUALS = [
  { key: 'netflix', aliases: ['netflix'], className: 'netflix', text: 'N' },
  { key: 'spotify', aliases: ['spotify'], className: 'spotify', text: 'S' },
  { key: 'orange', aliases: ['orange romania', 'orange'], className: 'orange', text: 'O' },
  { key: 'youtube', aliases: ['youtube'], className: 'youtube', text: '▶' },
  { key: 'microsoft', aliases: ['microsoft 365', 'microsoft'], className: 'microsoft', text: 'M' },
  { key: 'google', aliases: ['google one', 'google', 'youtube premium'], className: 'google', text: 'G' },
  { key: 'bolt', aliases: ['bolt food', 'bolt'], className: 'bolt', text: 'B' },
  { key: 'uber', aliases: ['uber eats', 'uber'], className: 'uber', text: 'U' },
  { key: 'amazon', aliases: ['amazon prime', 'amazon'], className: 'amazon', text: 'a' },
  { key: 'emag', aliases: ['emag'], className: 'emag', text: 'e' },
];

export const CURRENCY_BADGES = {
  RON: { code: 'RON', symbol: 'L', className: 'currency-badge ron', label: 'Romanian leu' },
  EUR: { code: 'EUR', symbol: '€', className: 'currency-badge eur', label: 'Euro' },
  USD: { code: 'USD', symbol: '$', className: 'currency-badge usd', label: 'US dollar' },
};

export function normalizeVisualLabel(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getVendorVisual(label) {
  const normalized = normalizeVisualLabel(label);
  const match = BRAND_VISUALS.find((visual) =>
    visual.aliases.some((alias) => normalized === alias || normalized.includes(alias))
  );

  if (match) {
    return {
      className: `bill-logo ${match.className}`,
      text: match.text,
      key: match.key,
    };
  }

  return {
    className: 'bill-logo generic',
    text: String(label || '?').trim().slice(0, 1).toUpperCase() || '?',
    key: 'generic',
  };
}

export function getCurrencyBadge(currency) {
  return CURRENCY_BADGES[currency] || { code: currency, symbol: currency, className: 'currency-badge generic', label: currency };
}
