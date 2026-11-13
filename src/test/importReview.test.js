import { describe, expect, it } from 'vitest';
import {
  ImportReview,
  MAX_CSV_FILE_BYTES,
  NORMALIZED_CSV_TEMPLATE,
  validateCsvFile,
} from '../lib/importReview';

const transaction = {
  date: '2026-01-05',
  desc: 'Example Grocery Store',
  cat: 'Groceries',
  sub: 'Supermarket',
  amt: -125.5,
  flow: 'Debit',
  type: 'Card Payment',
  ym: '2026-01',
  currency: 'RON',
  ref: 'example-001',
};

function parsedResult(transactions = [transaction]) {
  return {
    transactions,
    rejectedRows: [{ rowNumber: 4, reason: 'invalid amount' }],
    summary: {
      detectedProfileId: 'normalized-csv',
      detectedProfileLabel: 'Normalized CSV',
      totalRows: 3,
      processedRows: transactions.length,
      skippedRows: 1,
      warnings: [],
      skippedReasonCounts: { 'invalid amount': 1 },
      skippedDetails: ['Row 4: invalid amount'],
      validationCategories: { 'suspicious-amount': 1 },
      unknownVendorCount: 0,
    },
    vendorObservations: [],
  };
}

describe('ImportReview', () => {
  it('owns import counts and the final commit summary', () => {
    const review = new ImportReview({
      fileName: 'January 2026.csv',
      parsedResult: parsedResult([transaction, transaction]),
      existingTransactions: [],
    });

    expect(review.canCommit).toBe(true);
    expect(review.counts).toEqual({ ready: 1, duplicates: 1, invalid: 1, total: 3 });
    expect(review.finalSummary).toMatchObject({
      processedRows: 1,
      duplicateRows: 1,
      existingDuplicateRows: 0,
      fileDuplicateRows: 1,
    });
    expect(review.reportFilename).toBe('January-2026-import-review.csv');
  });

  it('generates a complete, escaped report for invalid and duplicate rows', () => {
    const quotedTransaction = {
      ...transaction,
      desc: '=HYPERLINK("https://example.invalid","Market")',
    };
    const review = new ImportReview({
      fileName: 'review.csv',
      parsedResult: parsedResult([quotedTransaction]),
      existingTransactions: [quotedTransaction],
    });

    expect(review.canCommit).toBe(false);
    expect(review.rejectedRows).toHaveLength(2);
    expect(review.toRejectedCsv()).toContain('Invalid,4,,,,,invalid amount');
    expect(review.toRejectedCsv()).toContain("'=HYPERLINK");
    expect(review.toRejectedCsv()).toContain('-125.5');
    expect(review.toRejectedCsv()).toContain('Already imported');
  });

  it('neutralizes alternate spreadsheet formula prefixes in exported text fields', () => {
    const formulaTransaction = { ...transaction, desc: '@SUM(1,1)' };
    const review = new ImportReview({
      fileName: 'review.csv',
      parsedResult: parsedResult([formulaTransaction]),
      existingTransactions: [formulaTransaction],
    });

    expect(review.toRejectedCsv()).toContain("'@SUM");
  });
});

describe('CSV import guardrails', () => {
  it('provides a valid normalized template', () => {
    expect(NORMALIZED_CSV_TEMPLATE).toContain(
      'Date,Description,Category,Subcategory,Amount,Flow,Type,Currency,Reference',
    );
    expect(NORMALIZED_CSV_TEMPLATE).toContain('Example Grocery Store');
  });

  it('rejects unsupported, empty, and oversized files', () => {
    expect(() => validateCsvFile(new File(['x'], 'transactions.txt'))).toThrow(/\.csv extension/i);
    expect(() => validateCsvFile(new File([], 'empty.csv'))).toThrow(/empty/i);
    expect(() => validateCsvFile({ name: 'large.csv', size: MAX_CSV_FILE_BYTES + 1 })).toThrow(
      /10 MB/i,
    );
  });
});
