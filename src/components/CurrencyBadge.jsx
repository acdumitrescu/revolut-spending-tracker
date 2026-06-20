import { getCurrencyBadge } from '../lib/displayAssets';

export default function CurrencyBadge({ currency }) {
  const badge = getCurrencyBadge(currency);
  return (
    <span className={badge.className} aria-hidden="true" title={badge.label} aria-label={badge.label}>
      <span className="currency-badge-symbol">{badge.symbol}</span>
    </span>
  );
}
