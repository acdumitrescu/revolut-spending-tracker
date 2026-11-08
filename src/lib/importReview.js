import Papa from 'papaparse';
import { analyzeTransactionImport } from './csvParser';

export const MAX_CSV_FILE_BYTES = 10 * 1024 * 1024;

const TEMPLATE_ROWS = [
  {
    Date: '2026-01-05',
    Description: 'Example Grocery Store',
    Category: 'Groceries',
    Subcategory: 'Supermarket',
    Amount: -125.5,
    Flow: 'Debit',
    Type: 'Card Payment',
    Currency: 'RON',
    Reference: 'example-001',
  },
];

export const NORMALIZED_CSV_TEMPLATE = Papa.unparse(TEMPLATE_ROWS);

export function validateCsvFile(file) {
  if (!file) throw new Error('Choose a CSV file first.');
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Choose a file with the .csv extension.');
  }
  if (file.size === 0) throw new Error('This CSV file is empty.');
  if (file.size > MAX_CSV_FILE_BYTES) {
    throw new Error('This CSV is larger than the 10 MB import limit.');
  }
}

function safeBaseName(fileName) {
  return fileName
    .replace(/\.csv$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'transactions';
}

export class ImportReview {
  constructor({ fileName, parsedResult, existingTransactions }) {
    this.fileName = fileName;
    this.parsedResult = parsedResult;
    this.analysis = analyzeTransactionImport(existingTransactions, parsedResult.transactions);
  }

  get acceptedTransactions() {
    return this.analysis.acceptedTransactions;
  }

  get canCommit() {
    return this.acceptedTransactions.length > 0;
  }

  get counts() {
    return {
      ready: this.acceptedTransactions.length,
      duplicates: this.analysis.duplicateCount,
      invalid: this.parsedResult.summary.skippedRows,
      total: this.parsedResult.summary.totalRows,
    };
  }

  get finalSummary() {
    return {
      ...this.parsedResult.summary,
      processedRows: this.acceptedTransactions.length,
      duplicateRows: this.analysis.duplicateCount,
      existingDuplicateRows: this.analysis.existingDuplicateCount,
      fileDuplicateRows: this.analysis.fileDuplicateCount,
    };
  }

  get rejectedRows() {
    const invalidRows = (this.parsedResult.rejectedRows || []).map(({ rowNumber, reason }) => ({
      status: 'Invalid',
      row: rowNumber,
      date: '',
      description: '',
      amount: '',
      currency: '',
      reason,
    }));

    const duplicateRows = this.analysis.duplicateTransactions.map(({ transaction, duplicateSource }) => ({
      status: 'Duplicate',
      row: '',
      date: transaction.date,
      description: transaction.desc,
      amount: transaction.amt,
      currency: transaction.currency || '',
      reason: duplicateSource === 'existing' ? 'Already imported' : 'Repeated in file',
    }));

    return [...invalidRows, ...duplicateRows];
  }

  get reportFilename() {
    return `${safeBaseName(this.fileName)}-import-review.csv`;
  }

  toRejectedCsv() {
    return Papa.unparse(this.rejectedRows, {
      columns: ['status', 'row', 'date', 'description', 'amount', 'currency', 'reason'],
      escapeFormulae: true,
    });
  }
}
