import { APP_HUBS } from '../../app/navigation';
import { formatCurrency } from '../../lib/utils';

// Headline aggregates and chart axes are whole units; single items keep cents (Plan 1, 0.1).
export const money = (value, currency) => formatCurrency(value, currency, { decimals: 0 });
export const moneyExact = (value, currency) => formatCurrency(value, currency, { decimals: 2 });

const hubChildRoute = (hubId, childId) =>
  APP_HUBS.find((hub) => hub.id === hubId)?.children?.find((child) => child.id === childId)?.to;

// Pages the cards link to. Routes come from navigation.js so a renamed route cannot drift.
export const CARD_ROUTES = {
  budget: hubChildRoute('planning', 'budget'),
  categories: hubChildRoute('insights', 'categories'),
  balances: hubChildRoute('accounts', 'balances'),
};

/**
 * Merges the `unconverted` lists a card received into one sentence, or null when nothing was
 * left out. Amounts with no exchange rate are excluded from the totals, never hidden.
 */
export function describeUnconverted(...lists) {
  const byCurrency = new Map();
  for (const entry of lists.flat()) {
    if (!entry) continue;
    byCurrency.set(entry.currency, (byCurrency.get(entry.currency) || 0) + (entry.amount || 0));
  }
  if (byCurrency.size === 0) return null;
  const parts = [...byCurrency.entries()].map(
    ([currency, amount]) => `${money(amount, currency)} in ${currency}`,
  );
  return `Excludes ${parts.join(', ')}: no exchange rate`;
}

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function themeColor(token, fallback) {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

/** 'YYYY-MM-DD' as "Nov 20", independent of the machine's time zone. */
export function shortDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
