// Read-only currency audit. Some export profiles have several amount and currency columns and
// the parser picks each one independently, so a row can end up with an amount from one column
// and a currency label from another. This report shows, per import batch, which columns were
// used and which rows mixed them. It never changes data and never guesses the right currency:
// the user fixes rows with the per-row (or bulk) currency override on Transactions.

const COLUMN_LABELS = {
  amount: 'Amount',
  amount_payment: 'Payment amount',
  amount_original: 'Original amount',
  currency: 'Currency',
  currency_payment: 'Payment currency',
  currency_original: 'Original currency',
};

// Profiles whose currency can come from more than one column (see csvParser PROFILE_REGISTRY).
export const MULTI_CURRENCY_SOURCE_PROFILES = new Set([
  'revolut-personal-raw',
  'revolut-business-transaction',
  'revolut-business-expense',
]);

export const columnLabel = (key) => COLUMN_LABELS[key] || key;
export { applySourceHints } from './importSources';

function columnGroup(key) {
  if (!key) return null;
  if (key.endsWith('_payment')) return 'payment';
  if (key.endsWith('_original')) return 'original';
  return 'plain';
}

/** True when the amount and currency were read from different column groups. */
export function hasMismatchedSources(transaction) {
  const amountGroup = columnGroup(transaction.amountSource);
  const currencyGroup = columnGroup(transaction.currencySource);
  return Boolean(amountGroup && currencyGroup && amountGroup !== currencyGroup);
}

const increment = (counts, key) => {
  counts[key] = (counts[key] || 0) + 1;
};

/**
 * @returns {{ batches: Array<{ batchId, fileName, importedAt, profileId, profileLabel,
 *   rowCount, currencies, sourcePairs, mismatched, notRecorded, corrected, status }>,
 *   suspectBatchCount: number }}
 * status: 'suspect' (rows mixed columns), 'not-recorded' (imported before sources were
 * recorded), or 'consistent'. Only batches from multi-column profiles are listed.
 */
export function getCurrencyAudit(data) {
  const history = data?.importMeta?.history || [];
  const byBatch = new Map();
  for (const transaction of data?.transactions || []) {
    if (!transaction.importBatchId) continue;
    if (!byBatch.has(transaction.importBatchId)) byBatch.set(transaction.importBatchId, []);
    byBatch.get(transaction.importBatchId).push(transaction);
  }

  const batches = [];
  for (const entry of history) {
    if (entry.status === 'undone' || !MULTI_CURRENCY_SOURCE_PROFILES.has(entry.detectedProfileId))
      continue;
    const rows = byBatch.get(entry.batchId) || [];
    if (rows.length === 0) continue;
    const currencies = {};
    const sourcePairs = {};
    const mismatched = [];
    let notRecorded = 0;
    let corrected = 0;
    for (const row of rows) {
      increment(currencies, row.baseCurrency ?? row.currency ?? 'missing');
      if (row.baseCurrency !== undefined) corrected += 1;
      if (!row.amountSource && !row.currencySource) {
        notRecorded += 1;
        continue;
      }
      increment(
        sourcePairs,
        `${columnLabel(row.amountSource)} + ${columnLabel(row.currencySource)}`,
      );
      if (hasMismatchedSources(row)) mismatched.push(row);
    }
    batches.push({
      batchId: entry.batchId,
      fileName: entry.fileName || 'CSV import',
      importedAt: entry.importedAt,
      profileId: entry.detectedProfileId,
      profileLabel: entry.detectedProfileLabel,
      rowCount: rows.length,
      currencies,
      sourcePairs,
      mismatched,
      notRecorded,
      corrected,
      status: mismatched.length ? 'suspect' : notRecorded ? 'not-recorded' : 'consistent',
    });
  }
  batches.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
  return {
    batches,
    suspectBatchCount: batches.filter((batch) => batch.status === 'suspect').length,
  };
}
