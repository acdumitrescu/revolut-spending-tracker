// Kept apart from currencyAudit.js so the reducer (main bundle) does not pull in the report.

/**
 * Fills in amountSource/currencySource on existing rows that lack them, from a fresh parse of
 * the same CSV. Matching uses the transaction identity (getKey = txKey). Metadata only:
 * amounts, currencies, categories and overrides are untouched.
 * @returns {{ transactions: object[], updated: number }}
 */
export function applySourceHints(transactions, parsedTransactions, getKey) {
  const hints = new Map();
  for (const parsed of parsedTransactions) {
    if (parsed.amountSource || parsed.currencySource) hints.set(getKey(parsed), parsed);
  }
  let updated = 0;
  const next = transactions.map((transaction) => {
    if (transaction.amountSource || transaction.currencySource) return transaction;
    const hint = hints.get(getKey(transaction));
    if (!hint) return transaction;
    updated += 1;
    return {
      ...transaction,
      ...(hint.amountSource && { amountSource: hint.amountSource }),
      ...(hint.currencySource && { currencySource: hint.currencySource }),
    };
  });
  return { transactions: updated ? next : transactions, updated };
}
