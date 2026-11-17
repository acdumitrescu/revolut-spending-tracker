import { describe, it, expect } from 'vitest';
import {
  analyzeTransactionImport,
  categorizeTransaction,
  categorizeTransactionDetailed,
  parseCSV,
  txKey,
  mergeTransactions,
} from '../lib/csvParser';
import personalFixture from './fixtures/synthetic-personal-profile.csv?raw';
import businessFixture from './fixtures/synthetic-business-profile.csv?raw';
import localizedExpenseFixture from './fixtures/synthetic-business-expense-ro.csv?raw';
import overlapFixture from './fixtures/synthetic-overlap-profile.csv?raw';

describe('categorizeTransaction', () => {
  it('categorizes positive amounts as Income', () => {
    const result = categorizeTransaction('anything', 100);
    expect(result[0]).toBe('Income');
    expect(result[1]).toBe('Income');
  });

  it('categorizes negative income as Income', () => {
    const [cat] = categorizeTransaction('refund', 0.01);
    expect(cat).toBe('Income');
  });

  it('matches vendor from default map case-insensitively', () => {
    const [cat, sub] = categorizeTransaction('Uber Trip', -15);
    expect(cat).toBe('Transport');
    expect(sub).toBe('Taxi');
  });

  it('matches vendor regardless of case', () => {
    const [cat] = categorizeTransaction('UBER TRIP', -15);
    expect(cat).toBe('Transport');
  });

  it('prefers custom vendor over default', () => {
    const [cat, sub] = categorizeTransaction('uber', -15, { uber: ['CustomCat', 'CustomSub'] });
    expect(cat).toBe('CustomCat');
    expect(sub).toBe('CustomSub');
  });

  it('lets custom vendor overrides win over strong built-in aliases', () => {
    const [cat, sub] = categorizeTransaction('Uber Eats', -22, {
      'uber eats': ['CustomFood', 'Manual'],
    });
    expect(cat).toBe('CustomFood');
    expect(sub).toBe('Manual');
  });

  it('prefers longer custom vendor rules first', () => {
    const [cat] = categorizeTransaction('Netflix family plan', -50, {
      netflix: ['Subscriptions', 'Streaming'],
      'netflix family': ['Subscriptions', 'Family'],
    });
    expect(cat).toBe('Subscriptions');
  });

  it('falls through to default map when no custom match', () => {
    const [cat] = categorizeTransaction('netflix', -10, {});
    expect(cat).toBe('Subscriptions');
  });

  it('matches expanded built-in US/EU vendors', () => {
    const [cat, sub] = categorizeTransaction('eMAG.RO', -70);
    expect(cat).toBe('Shopping');
    expect(sub).toBe('Marketplace');
  });

  it('ignores legal suffix and terminal noise for vendor identity', () => {
    const [cat, sub] = categorizeTransaction('Netflix SRL POS 884422', -49);
    expect(cat).toBe('Subscriptions');
    expect(sub).toBe('Entertainment');
  });

  it('prefers stronger food-delivery aliases over broader rideshare vendors', () => {
    const [cat, sub] = categorizeTransaction('Uber Eats', -55);
    expect(cat).toBe('Food & Dining');
    expect(sub).toBe('Delivery');
  });

  it('maps Bolt Food separately from Bolt rides', () => {
    const [cat, sub] = categorizeTransaction('Bolt Food', -32);
    expect(cat).toBe('Food & Dining');
    expect(sub).toBe('Delivery');
  });

  it('falls back to Other for unknown vendors', () => {
    const [cat, sub] = categorizeTransaction('unknown vendor xyz', -50);
    expect(cat).toBe('Other');
    expect(sub).toBe('');
  });

  it('handles zero amount as debit/Other', () => {
    const [cat] = categorizeTransaction('unknown', 0);
    expect(cat).toBe('Other');
  });
});

describe('categorizeTransactionDetailed', () => {
  it('returns custom override metadata when a custom vendor wins', () => {
    const result = categorizeTransactionDetailed('Uber Eats', -20, {
      'uber eats': ['Food', 'Manual'],
    });
    expect(result.category).toBe('Food');
    expect(result.matchSource).toBe('custom');
    expect(result.confidence).toBe('high');
    expect(result.matchedVendor).toBe('uber eats');
  });

  it('marks exact built-in alias matches as high confidence', () => {
    const result = categorizeTransactionDetailed('Netflix', -30);
    expect(result.category).toBe('Subscriptions');
    expect(result.matchSource).toBe('built-in-exact');
    expect(result.confidence).toBe('high');
    expect(result.matchedVendor).toBe('Netflix');
  });

  it('marks contained built-in alias matches as medium confidence', () => {
    const result = categorizeTransactionDetailed('Netflix family plan', -30);
    expect(result.category).toBe('Subscriptions');
    expect(result.matchSource).toBe('built-in-contains');
    expect(result.confidence).toBe('medium');
  });

  it('falls back to keyword heuristics with low confidence', () => {
    const result = categorizeTransactionDetailed('vodafone romania recharge', -19);
    expect(result.category).toBe('Utilities');
    expect(result.matchSource).toBe('built-in-contains');
    expect(result.confidence).toBe('medium');
  });

  it('accepts low-risk fuzzy vendor matches with explicit fuzzy metadata', () => {
    const result = categorizeTransactionDetailed('kauflan', -42);
    expect(result.category).toBe('Groceries');
    expect(result.subcategory).toBe('Hypermarket');
    expect(result.matchSource).toBe('fuzzy');
    expect(result.matchStrategy).toBe('fuzzy');
  });

  it('returns traceability metadata for matched vendor knowledge', () => {
    const result = categorizeTransactionDetailed('Mega Image Berceni', -31);
    expect(result.matchedVendorId).toBe('ro-mega-image');
    expect(result.matchedRegion).toBe('RO');
  });
});

describe('txKey', () => {
  it('produces a unique key from transaction fields', () => {
    const t = {
      date: '2024-01-15',
      desc: 'Uber',
      amt: -15,
      type: 'TOP_UP',
      flow: 'Debit',
      currency: 'RON',
      ref: 'abc',
    };
    expect(txKey(t)).toBe('2024-01-15|Uber|-15|TOP_UP|Debit|RON|abc');
  });

  it('distinguishes different transactions', () => {
    const t1 = { date: '2024-01-15', desc: 'Uber', amt: -15, type: 'A' };
    const t2 = { date: '2024-01-15', desc: 'Uber', amt: -20, type: 'A' };
    expect(txKey(t1)).not.toBe(txKey(t2));
  });
});

describe('parseCSV', () => {
  it('keeps synthetic fixture profiles and trust classifications stable', async () => {
    const cases = [
      {
        name: 'personal.csv',
        contents: personalFixture,
        profile: 'revolut-personal-raw',
        categories: ['Transfers', 'Transport', 'Refunds', 'Savings'],
      },
      {
        name: 'business.csv',
        contents: businessFixture,
        profile: 'revolut-business-transaction',
        categories: ['Shopping', 'Transfers'],
      },
      {
        name: 'expense-ro.csv',
        contents: localizedExpenseFixture,
        profile: 'revolut-business-expense',
        categories: ['Food & Dining'],
      },
    ];

    for (const fixture of cases) {
      const result = await parseCSV(
        new File([fixture.contents], fixture.name, { type: 'text/csv' }),
      );
      expect(result.summary.detectedProfileId).toBe(fixture.profile);
      expect(result.transactions.map((transaction) => transaction.cat)).toEqual(fixture.categories);
    }

    const localized = await parseCSV(
      new File([localizedExpenseFixture], 'expense-ro.csv', { type: 'text/csv' }),
    );
    expect(localized.transactions[0]).toMatchObject({ currency: 'RON', amt: -24.5 });
    expect(localized.summary.validationCategories['multiple-amount-sources']).toBe(1);
  });

  it('preserves distinct references while reporting malformed fixture rows', async () => {
    const result = await parseCSV(new File([overlapFixture], 'overlap.csv', { type: 'text/csv' }));
    const merged = mergeTransactions([], result.transactions);

    expect(merged).toHaveLength(2);
    expect(merged.map((transaction) => transaction.ref)).toEqual(['overlap-1', 'overlap-2']);
    expect(result.summary.skippedReasonCounts['zero-value transaction skipped']).toBe(1);
    expect(result.summary.skippedReasonCounts['missing or invalid date']).toBe(1);
    expect(mergeTransactions(merged, result.transactions)).toHaveLength(2);
  });

  it('parses raw Revolut CSV rows and classifies transfers/refunds', async () => {
    const csv = [
      'Started Date,Completed Date,Description,Amount,Type,Currency,Reference',
      '2024-01-05,2024-01-05,Salary,5000,bank transfer,RON,salary-1',
      '2024-01-07,2024-01-07,Uber,-25,card payment,RON,ride-1',
      '2024-01-09,2024-01-09,Card refund,25,refund,RON,refund-1',
      '2024-01-10,2024-01-10,Savings top up,-300,top up,RON,topup-1',
      '2024-01-11,2024-01-11,Cash ATM,-100,cash withdrawal,RON,atm-1',
    ].join('\n');
    const file = new File([csv], 'revolut.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.summary.processedRows).toBe(5);
    expect(result.summary.detectedProfileId).toBe('revolut-personal-raw');
    expect(result.transactions[0].cat).toBe('Transfers');
    expect(result.transactions[1].matchedVendor).toBe('Uber');
    expect(result.transactions[1].matchSource).toBe('built-in-exact');
    expect(result.transactions[2].cat).toBe('Refunds');
    expect(result.transactions[3].cat).toBe('Savings');
    expect(result.transactions[4].cat).toBe('Cash');
  });

  it('skips non-completed Revolut rows when a State column is present', async () => {
    const csv = [
      'Started Date,Completed Date,Description,Amount,Type,Currency,State',
      '2026-09-21 10:00:00,2026-09-21 10:01:00,Completed merchant,-10,card payment,RON,COMPLETED',
      '2026-09-21 11:00:00,,Pending merchant,-20,card payment,RON,PENDING',
      '2026-09-21 12:00:00,,Reverted merchant,-30,card payment,RON,REVERTED',
    ].join('\n');

    const result = await parseCSV(new File([csv], 'revolut-state.csv', { type: 'text/csv' }));

    expect(result.transactions).toHaveLength(1);
    expect(result.summary.skippedReasonCounts['non-completed transaction skipped']).toBe(2);
    expect(result.transactions[0].ref).toContain('2026-09-21 10:01:00');
  });

  it('preserves distinct same-day Revolut transactions with timestamp references', async () => {
    const csv = [
      'Started Date,Completed Date,Description,Amount,Type,Currency,State',
      '2026-09-21 10:00:00,2026-09-21 10:01:00,Same merchant,-10,card payment,RON,COMPLETED',
      '2026-09-21 11:00:00,2026-09-21 11:01:00,Same merchant,-10,card payment,RON,COMPLETED',
    ].join('\n');

    const result = await parseCSV(new File([csv], 'revolut-repeat.csv', { type: 'text/csv' }));
    const analysis = analyzeTransactionImport([], result.transactions);

    expect(result.transactions.map(({ ref }) => ref)).toHaveLength(2);
    expect(new Set(result.transactions.map(({ ref }) => ref)).size).toBe(2);
    expect(analysis.acceptedTransactions).toHaveLength(2);
    expect(analysis.duplicateCount).toBe(0);
  });

  it('tracks skipped reasons for malformed rows', async () => {
    const csv = [
      'Started Date,Description,Amount,Type,Currency',
      '2024-01-01,Valid merchant,-20,card payment,RON',
      '2024-01-02,Bad amount,abc,card payment,RON',
      ',Missing date,-10,card payment,RON',
      '2024-01-03,Zero row,0,card payment,RON',
    ].join('\n');
    const file = new File([csv], 'revolut-invalid.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.summary.processedRows).toBe(1);
    expect(result.summary.skippedRows).toBe(3);
    expect(result.summary.detectedProfileLabel).toBe('Revolut Personal CSV');
    expect(result.summary.skippedReasonCounts['invalid amount']).toBe(1);
    expect(result.summary.skippedReasonCounts['missing or invalid date']).toBe(1);
    expect(result.summary.skippedReasonCounts['zero-value transaction skipped']).toBe(1);
    expect(result.rejectedRows).toEqual([
      { rowNumber: 3, reason: 'invalid amount' },
      { rowNumber: 4, reason: 'missing or invalid date' },
      { rowNumber: 5, reason: 'zero-value transaction skipped' },
    ]);
    expect(result.summary.unknownVendorCount).toBe(1);
    expect(result.vendorObservations).toHaveLength(1);
  });

  it('parses normalized master exports', async () => {
    const csv = [
      'Date,Description,Category,Subcategory,Amount,Flow,Type',
      '2024-02-01,Spotify,Subscriptions,Music,-29,Debit,Card Payment',
      '2024-02-03,Salary,Income,Income,4000,Credit,Bank Transfer',
    ].join('\n');
    const file = new File([csv], 'master.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.summary.processedRows).toBe(2);
    expect(result.summary.detectedProfileId).toBe('normalized-csv');
    expect(result.transactions[0].source).toBe('master');
    expect(result.transactions[1].cat).toBe('Income');
  });

  it('parses a Revolut business transaction statement like CSV', async () => {
    const csv = [
      'Transaction started (UTC),Transaction completed (UTC),Transaction Description,Transaction Type,Payment Currency,Amount (Payment Currency),Transaction ID,Account',
      '2024-03-01T08:00:00Z,2024-03-01T08:05:00Z,Amazon Marketplace,card payment,USD,-19.99,tx-1,Main',
      '2024-03-02T08:00:00Z,2024-03-02T08:05:00Z,Salary,bank transfer,RON,5000,tx-2,Main',
    ].join('\n');
    const file = new File([csv], 'business-transactions.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.summary.detectedProfileId).toBe('revolut-business-transaction');
    expect(result.summary.processedRows).toBe(2);
    expect(result.transactions[0].currency).toBe('USD');
    expect(result.transactions[0].cat).toBe('Shopping');
    expect(result.transactions[1].cat).toBe('Transfers');
  });

  it('parses a localized Revolut business expense CSV and prefers payment amount/currency', async () => {
    const csv = [
      'Tranzacție inițiată (UTC),Tranzacție finalizată (UTC),ID tranzacție,Tipul tranzacției,Descriere tranzacție,Monedă origine,Sumă inițială (monedă inițială),Moneda de plată,Sumă (monedă plată)',
      '2024-04-01T10:00:00Z,2024-04-01T10:10:00Z,ro-1,card payment,Starbucks,USD,-5.00,RON,-24.50',
    ].join('\n');
    const file = new File([csv], 'business-expense-ro.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.summary.detectedProfileId).toBe('revolut-business-expense');
    expect(
      result.summary.warnings.some((warning) => warning.includes('payment and original amount')),
    ).toBe(true);
    expect(result.transactions[0].currency).toBe('RON');
    expect(result.transactions[0].amt).toBe(-24.5);
    expect(result.transactions[0].cat).toBe('Food & Dining');
  });

  it('classifies Romanian merchants across groceries, fuel, pharmacy, and courier categories', async () => {
    const csv = [
      'Started Date,Completed Date,Description,Amount,Type,Currency,Reference',
      '2024-06-01,2024-06-01,Mega Image,-30,card payment,RON,ro-1',
      '2024-06-02,2024-06-02,Petrom,-250,card payment,RON,ro-2',
      '2024-06-03,2024-06-03,Catena,-45,card payment,RON,ro-3',
      '2024-06-04,2024-06-04,Fan Courier,-18,card payment,RON,ro-4',
    ].join('\n');
    const file = new File([csv], 'romanian-merchants.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.transactions.map((txn) => txn.sub)).toEqual([
      'Supermarket',
      'Fuel',
      'Pharmacy',
      'Courier',
    ]);
  });

  it('warns on partially recognized headers while still parsing supported columns', async () => {
    const csv = [
      'Started Date,Description,Amount,Type,Currency,Unexpected Internal Note',
      '2024-05-01,Uber,-12,card payment,RON,test',
    ].join('\n');
    const file = new File([csv], 'partial.csv', { type: 'text/csv' });
    const result = await parseCSV(file);

    expect(result.summary.processedRows).toBe(1);
    expect(
      result.summary.warnings.some((warning) =>
        warning.includes('Partially recognized header set'),
      ),
    ).toBe(true);
  });

  it('surfaces structural CSV parser warnings for review', async () => {
    const csv = [
      'Started Date,Description,Amount,Type,Currency',
      '2024-05-01,Uber,-12,card payment,RON,unexpected-field',
    ].join('\n');
    const result = await parseCSV(new File([csv], 'structural-warning.csv', { type: 'text/csv' }));

    expect(result.summary.processedRows).toBe(1);
    expect(result.summary.validationCategories['parser-warning']).toBe(1);
    expect(result.summary.warnings.some((warning) => warning.startsWith('CSV parser:'))).toBe(true);
  });
});

describe('mergeTransactions', () => {
  it('merges new transactions into existing', () => {
    const existing = [{ date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' }];
    const newTxns = [{ date: '2024-01-02', desc: 'B', amt: -20, type: 'Y', ym: '2024-01' }];
    const result = mergeTransactions(existing, newTxns);
    expect(result).toHaveLength(2);
  });

  it('deduplicates identical transactions', () => {
    const existing = [{ date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' }];
    const newTxns = [{ date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' }];
    const result = mergeTransactions(existing, newTxns);
    expect(result).toHaveLength(1);
  });

  it('sorts by date', () => {
    const existing = [{ date: '2024-03-01', desc: 'C', amt: -30, type: 'Z', ym: '2024-03' }];
    const newTxns = [{ date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' }];
    const result = mergeTransactions(existing, newTxns);
    expect(result[0].date).toBe('2024-01-01');
    expect(result[1].date).toBe('2024-03-01');
  });

  it('handles empty existing array', () => {
    const newTxns = [{ date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' }];
    const result = mergeTransactions([], newTxns);
    expect(result).toHaveLength(1);
  });

  it('handles empty new array', () => {
    const existing = [{ date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' }];
    const result = mergeTransactions(existing, []);
    expect(result).toHaveLength(1);
  });
});

describe('analyzeTransactionImport', () => {
  const transaction = (overrides = {}) => ({
    date: '2024-01-01',
    desc: 'Synthetic Market',
    amt: -10,
    type: 'Card Payment',
    flow: 'Debit',
    currency: 'RON',
    ref: 'tx-1',
    ...overrides,
  });

  it('separates existing duplicates from transactions ready to add', () => {
    const existing = [transaction()];
    const incoming = [transaction(), transaction({ date: '2024-01-02', ref: 'tx-2' })];

    const result = analyzeTransactionImport(existing, incoming);

    expect(result.acceptedTransactions).toEqual([incoming[1]]);
    expect(result.duplicateCount).toBe(1);
    expect(result.existingDuplicateCount).toBe(1);
    expect(result.fileDuplicateCount).toBe(0);
    expect(result.duplicateTransactions[0].duplicateSource).toBe('existing');
  });

  it('detects repeated rows within the same file', () => {
    const repeated = transaction();
    const result = analyzeTransactionImport([], [repeated, { ...repeated }]);

    expect(result.acceptedTransactions).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.existingDuplicateCount).toBe(0);
    expect(result.fileDuplicateCount).toBe(1);
    expect(result.duplicateTransactions[0].duplicateSource).toBe('file');
  });

  it('matches timestamped imports against the available count of legacy unreferenced rows', () => {
    const legacy = transaction({ ref: undefined });
    const incoming = [
      transaction({ ref: 'timestamp-1' }),
      transaction({ ref: 'timestamp-2' }),
      transaction({ ref: 'timestamp-3' }),
    ];

    const result = analyzeTransactionImport([{ ...legacy }, { ...legacy }], incoming);

    expect(result.existingDuplicateCount).toBe(2);
    expect(result.fileDuplicateCount).toBe(0);
    expect(result.acceptedTransactions).toEqual([incoming[2]]);
  });
});

describe('Revolut currency exchange rows', () => {
  it('import as Transfers in both directions', async () => {
    const csv = [
      'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
      'Exchange,Current,2026-10-11 10:34:00,2026-10-11 10:34:00,Exchanged to EUR,-1000.00,0.00,RON,COMPLETED,500.00',
      'Exchange,Savings,2026-10-11 10:34:00,2026-10-11 10:34:00,Exchanged to RON,1000.00,0.00,RON,COMPLETED,1500.00',
    ].join('\n');
    const { transactions } = await parseCSV(new File([csv], 'exchange.csv', { type: 'text/csv' }));
    expect(transactions.map((t) => t.cat)).toEqual(['Transfers', 'Transfers']);
    expect(transactions.map((t) => t.type)).toEqual(['Exchange', 'Exchange']);
  });
});
