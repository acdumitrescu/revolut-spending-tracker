import { describe, it, expect } from 'vitest';
import { categorizeTransaction, parseCSV, txKey, mergeTransactions } from '../lib/csvParser';

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

  it('falls back to Other for unknown vendors', () => {
    const [cat, sub] = categorizeTransaction('unknown vendor xyz', -50);
    expect(cat).toBe('Other');
    expect(sub).toBe('Other');
  });

  it('handles zero amount as debit/Other', () => {
    const [cat] = categorizeTransaction('unknown', 0);
    expect(cat).toBe('Other');
  });
});

describe('txKey', () => {
  it('produces a unique key from transaction fields', () => {
    const t = { date: '2024-01-15', desc: 'Uber', amt: -15, type: 'TOP_UP', flow: 'Debit', currency: 'RON', ref: 'abc' };
    expect(txKey(t)).toBe('2024-01-15|Uber|-15|TOP_UP|Debit|RON|abc');
  });

  it('distinguishes different transactions', () => {
    const t1 = { date: '2024-01-15', desc: 'Uber', amt: -15, type: 'A' };
    const t2 = { date: '2024-01-15', desc: 'Uber', amt: -20, type: 'A' };
    expect(txKey(t1)).not.toBe(txKey(t2));
  });
});

describe('parseCSV', () => {
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
    expect(result.transactions[0].cat).toBe('Transfers');
    expect(result.transactions[2].cat).toBe('Refunds');
    expect(result.transactions[3].cat).toBe('Savings');
    expect(result.transactions[4].cat).toBe('Cash');
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
    expect(result.summary.skippedReasonCounts['invalid amount']).toBe(1);
    expect(result.summary.skippedReasonCounts['missing or invalid date']).toBe(1);
    expect(result.summary.skippedReasonCounts['zero-value transaction skipped']).toBe(1);
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
    expect(result.transactions[0].source).toBe('master');
    expect(result.transactions[1].cat).toBe('Income');
  });
});

describe('mergeTransactions', () => {
  it('merges new transactions into existing', () => {
    const existing = [
      { date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' },
    ];
    const newTxns = [
      { date: '2024-01-02', desc: 'B', amt: -20, type: 'Y', ym: '2024-01' },
    ];
    const result = mergeTransactions(existing, newTxns);
    expect(result).toHaveLength(2);
  });

  it('deduplicates identical transactions', () => {
    const existing = [
      { date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' },
    ];
    const newTxns = [
      { date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' },
    ];
    const result = mergeTransactions(existing, newTxns);
    expect(result).toHaveLength(1);
  });

  it('sorts by date', () => {
    const existing = [
      { date: '2024-03-01', desc: 'C', amt: -30, type: 'Z', ym: '2024-03' },
    ];
    const newTxns = [
      { date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' },
    ];
    const result = mergeTransactions(existing, newTxns);
    expect(result[0].date).toBe('2024-01-01');
    expect(result[1].date).toBe('2024-03-01');
  });

  it('handles empty existing array', () => {
    const newTxns = [
      { date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' },
    ];
    const result = mergeTransactions([], newTxns);
    expect(result).toHaveLength(1);
  });

  it('handles empty new array', () => {
    const existing = [
      { date: '2024-01-01', desc: 'A', amt: -10, type: 'X', ym: '2024-01' },
    ];
    const result = mergeTransactions(existing, []);
    expect(result).toHaveLength(1);
  });
});
