import { convertAmountToDisplay } from './fx';

export const BILLING_CYCLES = {
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
  weekly: 'Weekly',
};
const annualPayments = { monthly: 12, quarterly: 4, yearly: 1, weekly: 52 };

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function renewalStatus(record, today = localDateKey()) {
  if (record.status !== 'active') return record.status === 'paused' ? 'Paused' : 'Cancelled';
  if (record.nextRenewal < today) return 'Review renewal date';
  if (record.nextRenewal === today) return 'Due today';
  return 'Upcoming';
}

export function subscriptionSummary(records, currency, fxRates, today = localDateKey()) {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = new Date(start + 30 * 86400000).toISOString().slice(0, 10);
  const active = records.filter((record) => record.status === 'active');
  const yearly = active.reduce(
    (sum, record) =>
      sum +
      convertAmountToDisplay(
        record.amount * annualPayments[record.cycle],
        record.currency,
        currency,
        fxRates,
      ),
    0,
  );
  const upcoming = active.filter(
    (record) => record.nextRenewal >= today && record.nextRenewal < end,
  );
  return {
    active: active.length,
    monthly: yearly / 12,
    yearly,
    upcoming: upcoming.length,
    nextRenewals: upcoming.reduce(
      (sum, record) =>
        sum + convertAmountToDisplay(record.amount, record.currency, currency, fxRates),
      0,
    ),
    needsReview: active.filter((record) => record.nextRenewal < today).length,
  };
}
