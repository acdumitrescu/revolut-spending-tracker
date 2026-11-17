import { describe, expect, it } from 'vitest';
import { getCurrencyAudit, hasMismatchedSources } from '../lib/currencyAudit';
import { parseCSV } from '../lib/csvParser';

const row = (overrides) => ({
  date: '2026-03-01',
  desc: 'Synthetic Shop',
  amt: -10,
  flow: 'Debit',
  type: 'Card Payment',
  ym: '2026-03',
  cat: 'Shopping',
  sub: '',
  currency: 'EUR',
  ...overrides,
});
const history = (batchId, detectedProfileId, extra = {}) => ({
  batchId,
  detectedProfileId,
  detectedProfileLabel: detectedProfileId,
  fileName: `${batchId}.csv`,
  importedAt: 1,
  status: 'active',
  ...extra,
});

describe('currency audit', () => {
  it('flags an amount and a currency read from different column groups', () => {
    expect(hasMismatchedSources({ amountSource: 'amount', currencySource: 'currency' })).toBe(
      false,
    );
    expect(
      hasMismatchedSources({ amountSource: 'amount_payment', currencySource: 'currency_payment' }),
    ).toBe(false);
    expect(
      hasMismatchedSources({ amountSource: 'amount', currencySource: 'currency_payment' }),
    ).toBe(true);
    expect(hasMismatchedSources({})).toBe(false);
  });

  it('groups by batch, separates suspect, not-recorded and consistent batches', () => {
    const data = {
      importMeta: {
        history: [
          history('old', 'revolut-personal-raw', { importedAt: 1 }),
          history('mixed', 'revolut-business-transaction', { importedAt: 3 }),
          history('clean', 'revolut-personal-raw', { importedAt: 2 }),
          history('normalized', 'normalized-csv'),
          history('undone', 'revolut-personal-raw', { status: 'undone' }),
        ],
      },
      transactions: [
        row({ importBatchId: 'old' }),
        row({ importBatchId: 'old', currency: 'RON', baseCurrency: 'EUR' }),
        row({ importBatchId: 'mixed', amountSource: 'amount', currencySource: 'currency_payment' }),
        row({
          importBatchId: 'mixed',
          amountSource: 'amount_payment',
          currencySource: 'currency_payment',
        }),
        row({ importBatchId: 'clean', amountSource: 'amount', currencySource: 'currency' }),
        row({ importBatchId: 'normalized' }),
        row({ importBatchId: 'undone' }),
        row({}),
      ],
    };
    const audit = getCurrencyAudit(data);
    expect(audit.batches.map((batch) => [batch.batchId, batch.status])).toEqual([
      ['mixed', 'suspect'],
      ['clean', 'consistent'],
      ['old', 'not-recorded'],
    ]);
    expect(audit.suspectBatchCount).toBe(1);
    const mixed = audit.batches[0];
    expect(mixed.mismatched).toHaveLength(1);
    expect(mixed.sourcePairs).toEqual({
      'Amount + Payment currency': 1,
      'Payment amount + Payment currency': 1,
    });
    const old = audit.batches[2];
    expect(old.notRecorded).toBe(2);
    expect(old.corrected).toBe(1);
    expect(old.currencies).toEqual({ EUR: 2 }); // imported currency, not the corrected label
  });

  it('is empty for an empty workspace', () => {
    expect(getCurrencyAudit({})).toEqual({ batches: [], suspectBatchCount: 0 });
  });

  it('finds the mixed row when a CSV leaves the main currency cell empty', async () => {
    const csv = [
      'Started Date,Completed Date,Description,Amount,Type,Currency,Payment currency,Reference',
      '2026-03-01,2026-03-01,Synthetic Cafe,-12.50,card payment,,EUR,mix-1',
      '2026-03-02,2026-03-02,Synthetic Shop,-40.00,card payment,RON,RON,mix-2',
    ].join('\n');
    const parsed = await parseCSV(new File([csv], 'mixed.csv', { type: 'text/csv' }));
    const transactions = parsed.transactions.map((transaction) => ({
      ...transaction,
      importBatchId: 'b1',
    }));
    const audit = getCurrencyAudit({
      transactions,
      importMeta: { history: [history('b1', parsed.summary.detectedProfileId)] },
    });
    expect(audit.batches[0].status).toBe('suspect');
    expect(audit.batches[0].mismatched.map((transaction) => transaction.ref)).toEqual(['mix-1']);
  });
});

describe('applySourceHints', () => {
  it('fills in missing source columns on matching rows only, and touches nothing else', async () => {
    const { applySourceHints } = await import('../lib/currencyAudit');
    const { txKey } = await import('../lib/csvParser');
    const old = row({ ref: 'a', currency: 'RON', baseCurrency: 'EUR', cat: 'Food' });
    const recorded = row({ ref: 'b', amountSource: 'amount', currencySource: 'currency' });
    const unmatched = row({ ref: 'c' });
    const parsed = [
      {
        ...old,
        currency: 'EUR',
        baseCurrency: undefined,
        cat: 'Shopping',
        amountSource: 'amount',
        currencySource: 'currency',
      },
      { ...recorded, amountSource: 'amount_payment', currencySource: 'currency_payment' },
    ];
    const { transactions, updated } = applySourceHints([old, recorded, unmatched], parsed, txKey);
    expect(updated).toBe(1);
    expect(transactions[0]).toEqual({ ...old, amountSource: 'amount', currencySource: 'currency' });
    expect(transactions[1]).toBe(recorded);
    expect(transactions[2]).toBe(unmatched);
  });
});
