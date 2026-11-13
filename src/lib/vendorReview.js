import { convertAmountToDisplay } from './fx';
import { defaultVendorMatcher, normalizeVendorKey } from './vendorKnowledge';

export function getOtherVendorGroups(
  transactions,
  displayCurrency,
  fxRates,
  matcher = defaultVendorMatcher,
  limit = 25,
) {
  const grouped = new Map();

  for (const transaction of transactions) {
    if (
      transaction.flow !== 'Debit' ||
      transaction.cat !== 'Other' ||
      transaction.categorySource === 'manual'
    )
      continue;
    const vendorKey = normalizeVendorKey(transaction.desc) || transaction.desc.trim();
    const existing = grouped.get(vendorKey) || {
      vendorKey,
      samples: new Set(),
      count: 0,
      total: 0,
    };
    existing.samples.add(transaction.desc);
    existing.count += 1;
    existing.total += Math.abs(
      convertAmountToDisplay(
        transaction.amt,
        transaction.currency || 'RON',
        displayCurrency,
        fxRates,
      ),
    );
    grouped.set(vendorKey, existing);
  }

  // Rank and cut first: fuzzy suggestions are the expensive part and only the shown rows need them.
  return [...grouped.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map((group) => {
      const samples = [...group.samples].slice(0, 3);
      return {
        ...group,
        samples,
        suggestions: matcher.suggestCandidates(samples[0], 3),
      };
    });
}

// Currency exchanges and own-account movements are not merchants, so they are never worth reviewing.
const NON_MERCHANT = /^(exchanged (to|from) |currency exchange|top[- ]?up|transfer (to|from) )/i;

export function reviewableObservations(observations, customVendors = {}) {
  return observations.filter((observation) => {
    if ((observation.status || 'pending') !== 'pending') return false;
    const label = (observation.rawSamples?.[0] || observation.normalizedDescription || '').trim();
    return !NON_MERCHANT.test(label) && !customVendors[observation.normalizedDescription];
  });
}
