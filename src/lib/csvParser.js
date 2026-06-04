import Papa from 'papaparse';
import { ParsedCSVSchema } from './validation';
import defaultVendorMap from './vendorMap.json';

const MASTER_COLUMNS = ['Date', 'Description', 'Category', 'Subcategory', 'Amount', 'Flow', 'Type'];
const RAW_VARIANT_COLUMNS = [
  ['Started Date', 'Description', 'Amount'],
  ['Completed Date', 'Description', 'Amount'],
  ['Date', 'Description', 'Amount'],
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeVendorKey(value) {
  return normalizeText(value);
}

function isSubset(subset, set) {
  return subset.every(val => set.includes(val));
}

export function categorizeTransaction(description, amount, customVendors = {}) {
  if (amount > 0) {
    return ['Income', 'Income'];
  }

  const descLower = normalizeText(description);

  for (const [vendor, [cat, sub]] of sortVendorMappings(customVendors)) {
    if (vendorMatches(descLower, vendor)) {
      return [cat, sub];
    }
  }

  for (const [vendor, [cat, sub]] of sortVendorMappings(defaultVendorMap)) {
    if (vendorMatches(descLower, vendor)) {
      return [cat, sub];
    }
  }

  return ['Other', 'Other'];
}

function sortVendorMappings(vendors) {
  return Object.entries(vendors).sort((a, b) => normalizeVendorKey(b[0]).length - normalizeVendorKey(a[0]).length);
}

function vendorMatches(normalizedDescription, vendor) {
  const normalizedVendor = normalizeVendorKey(vendor);
  if (!normalizedVendor) return false;
  if (normalizedDescription === normalizedVendor) return true;
  return normalizedDescription.includes(`${normalizedVendor} `) ||
    normalizedDescription.includes(` ${normalizedVendor}`) ||
    normalizedDescription.includes(` ${normalizedVendor} `);
}

function detectFormat(columns) {
  const isMaster = isSubset(MASTER_COLUMNS, columns);
  const isRaw = RAW_VARIANT_COLUMNS.some((variant) => isSubset(variant, columns));
  return { isMaster, isRaw };
}

function getFirstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function normalizeDate(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const direct = value.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAmount(rawValue) {
  if (typeof rawValue === 'number') return rawValue;
  const normalized = String(rawValue || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/,(?=\d{1,2}$)/, '.')
    .replace(/,/g, '');

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function normalizeType(type, desc) {
  const rawType = normalizeText(type);
  const rawDesc = normalizeText(desc);

  if (rawType.includes('cash')) return 'Cash Withdrawal';
  if (rawType.includes('transfer') || rawDesc.includes('bank transfer')) return 'Bank Transfer';
  if (rawType.includes('card')) return 'Card Payment';
  if (rawType.includes('top up') || rawDesc.includes('top up')) return 'Top Up';
  if (rawType.includes('refund') || rawDesc.includes('refund') || rawDesc.includes('reversal')) return 'Refund';
  if (rawType.includes('chargeback')) return 'Chargeback';
  return String(type || '').trim();
}

function categorizeNormalizedTransaction(description, amount, type, customVendors) {
  const normalizedType = normalizeType(type, description);
  const lowerType = normalizeText(normalizedType);

  if (amount > 0 && (lowerType.includes('refund') || lowerType.includes('chargeback'))) {
    return ['Refunds', 'Refunds'];
  }

  if (lowerType.includes('transfer')) {
    return ['Transfers', 'Transfers'];
  }

  if (lowerType.includes('top up')) {
    return ['Savings', 'Top Up'];
  }

  if (lowerType.includes('cash')) {
    return ['Cash', 'Cash Withdrawal'];
  }

  return categorizeTransaction(description, amount, customVendors);
}

function buildTransaction(row, isMaster, customVendors, rowIndex) {
  const rawDate = isMaster
    ? row.Date
    : getFirstValue(row, ['Completed Date', 'Started Date', 'Date']);
  const date = normalizeDate(rawDate);
  const desc = String(getFirstValue(row, ['Description', 'Merchant', 'Reference']) || '').trim();
  const amount = parseAmount(row.Amount);
  const type = normalizeType(getFirstValue(row, ['Type', 'Transfer Type', 'Category']), desc);
  const currency = String(getFirstValue(row, ['Currency', 'Base Currency']) || '').trim().toUpperCase();
  const ref = String(getFirstValue(row, ['Reference', 'ID']) || '').trim();

  if (!date) {
    return { error: `Row ${rowIndex}: missing or invalid date` };
  }
  if (!desc) {
    return { error: `Row ${rowIndex}: missing description` };
  }
  if (Number.isNaN(amount)) {
    return { error: `Row ${rowIndex}: invalid amount` };
  }
  if (amount === 0) {
    return { error: `Row ${rowIndex}: zero-value transaction skipped` };
  }

  let cat = String(row.Category || '').trim();
  let sub = String(row.Subcategory || '').trim();
  const flow = String(row.Flow || (amount > 0 ? 'Credit' : 'Debit')).trim();

  if (!cat || !sub || cat === 'nan' || sub === 'nan') {
    [cat, sub] = categorizeNormalizedTransaction(desc, amount, type, customVendors);
  }

  return {
    transaction: {
      date,
      desc,
      cat,
      sub,
      amt: amount,
      flow,
      type,
      ym: date.substring(0, 7),
      currency: currency || undefined,
      ref: ref || undefined,
      source: isMaster ? 'master' : 'revolut',
    }
  };
}

export function parseCSV(file, customVendors = {}) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data;
        if (data.length === 0) {
          resolve({
            transactions: [],
            summary: {
              totalRows: 0,
              processedRows: 0,
              skippedRows: 0,
              skippedReasonCounts: {},
              skippedDetails: [],
            },
          });
          return;
        }

        const cols = Object.keys(data[0]);
        const { isMaster, isRaw } = detectFormat(cols);

        if (!isRaw && !isMaster) {
          reject(new Error('Unknown CSV format. Columns: ' + cols.join(', ')));
          return;
        }

        const processed = [];
        const skippedDetails = [];
        const skippedReasonCounts = {};

        for (const [index, row] of data.entries()) {
          const result = buildTransaction(row, isMaster, customVendors, index + 2);
          if (result.error) {
            skippedDetails.push(result.error);
            const reason = result.error.split(': ').at(-1);
            skippedReasonCounts[reason] = (skippedReasonCounts[reason] || 0) + 1;
            continue;
          }
          processed.push(result.transaction);
        }

        const payload = {
          transactions: processed,
          summary: {
            totalRows: data.length,
            processedRows: processed.length,
            skippedRows: skippedDetails.length,
            skippedReasonCounts,
            skippedDetails,
          }
        };

        const validated = ParsedCSVSchema.safeParse(payload);
        if (!validated.success) {
          reject(validated.error);
          return;
        }

        resolve(validated.data);
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

export function txKey(t) {
  return [t.date, t.desc, t.amt, t.type, t.flow, t.currency || '', t.ref || ''].join('|');
}

export function mergeTransactions(existing, newTxns) {
  const existingKeys = new Set(existing.map(txKey));
  const added = [];

  for (const t of newTxns) {
    const key = txKey(t);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      added.push(t);
    }
  }

  return [...existing, ...added].sort((a, b) => a.date.localeCompare(b.date));
}
