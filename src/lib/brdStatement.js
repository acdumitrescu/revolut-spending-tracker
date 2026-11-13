import Papa from 'papaparse';
import { BrdLedgerSchema, BrdStatementRowSchema } from '../../backend/appStateSchema.js';

export function manualBrdRow(form) {
  if (!/^\d+(\.\d{1,2})?$/.test(form.amount))
    throw new Error('Enter a positive RON amount with at most two decimals.');
  return BrdStatementRowSchema.parse({
    id: form.id || `manual:${crypto.randomUUID()}`,
    source: 'manual',
    date: form.date,
    beneficiary: form.beneficiary.trim(),
    details: '',
    notes: form.notes || '',
    amountMinor: Math.round(Number(form.amount) * 100),
    currency: 'RON',
    category: form.category,
    reversal: form.category === 'refund',
    direction:
      form.category === 'income' ? 'CRDT' : form.category === 'transfer' ? form.direction : 'DBIT',
  });
}

export function brdImportMatches(existingRows, incomingRows) {
  const known = new Set(existingRows.map((row) => row.id));
  return incomingRows
    .filter((row) => !known.has(row.id))
    .map((row) => ({
      row,
      candidates: existingRows.filter(
        (old) =>
          old.source === 'manual' &&
          old.date === row.date &&
          old.amountMinor === row.amountMinor &&
          (old.direction === 'CRDT' || old.reversal) === (row.direction === 'CRDT' || row.reversal),
      ),
    }))
    .filter((match) => match.candidates.length);
}

const headers = [
  'Date of Transaction',
  'Merchant/Beneficiary Name',
  'Transaction details',
  'Amount',
  'Currency',
  'Transaction type',
  'Status',
];
export const normalizeRecipient = (value) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const digest = async (value) =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

export function classifyBrdRow(row, ownRecipients) {
  if (
    row.direction === 'DBIT' &&
    !row.reversal &&
    /retrageri de numerar|cash withdrawal/i.test(row.details)
  )
    return 'cash-withdrawal';
  if (
    ownRecipients.some((name) => normalizeRecipient(name) === normalizeRecipient(row.beneficiary))
  )
    return 'transfer';
  if (row.reversal) return 'refund';
  if (row.direction === 'CRDT') return 'income';
  return 'expense';
}

export async function parseBrdStatement(text, ownRecipients = []) {
  if (text.length > 5 * 1024 * 1024) throw new Error('BRD CSV must be under 5 MB.');
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (value) => value.trim(),
  });
  if (
    parsed.errors.length ||
    parsed.meta.fields?.length !== headers.length ||
    !headers.every((key) => parsed.meta.fields.includes(key))
  )
    throw new Error('Choose a BRD transaction-list CSV with the seven expected columns.');
  if (!parsed.data.length || parsed.data.length > 20000)
    throw new Error('Statement must contain between 1 and 20,000 rows.');
  const occurrences = new Map();
  const rows = [];
  let skipped = 0;
  for (const [index, raw] of parsed.data.entries()) {
    if (raw.Status.trim() !== 'PROCESSED') {
      skipped += 1;
      continue;
    }
    const rawAmount = raw.Amount.trim();
    if (!/^-?\d+(\.\d{1,2})?$/.test(rawAmount))
      throw new Error(`Invalid amount on CSV row ${index + 2}.`);
    const row = {
      date: raw['Date of Transaction'].trim(),
      beneficiary: raw['Merchant/Beneficiary Name'].trim(),
      details: raw['Transaction details'].trim(),
      amountMinor: Math.round(Math.abs(Number(rawAmount)) * 100),
      reversal: Number(rawAmount) < 0,
      currency: raw.Currency.trim(),
      direction: raw['Transaction type'].trim(),
    };
    const hash = await digest(
      JSON.stringify([
        row.date,
        normalizeRecipient(row.beneficiary),
        row.details,
        row.amountMinor,
        row.currency,
        row.direction,
        row.reversal,
      ]),
    );
    const occurrence = (occurrences.get(hash) || 0) + 1;
    occurrences.set(hash, occurrence);
    rows.push({
      ...row,
      id: `${hash}:${occurrence}`,
      category: classifyBrdRow(row, ownRecipients),
    });
  }
  if (!rows.length) throw new Error('No processed BRD transactions in this file.');
  // Validate amounts, real calendar dates, directions and currency before any backup or write.
  BrdLedgerSchema.parse({ accountId: 'validation', rows, imports: [] });
  const id = await digest(JSON.stringify(rows.map((row) => row.id).sort()));
  return { id, rows, skipped, repeatedRows: rows.length - occurrences.size };
}

export function prepareBrdImport(
  data,
  {
    statement,
    accountId,
    fileName,
    ownRecipients,
    balanceConfirmation = null,
    importedAt,
    reconciliation = {},
  },
) {
  const account = data.accounts.find((row) => row.id === accountId);
  if (!account || account.name.trim().toUpperCase() !== 'BRD' || account.currency !== 'RON')
    throw new Error('Select the BRD RON account. Other accounts cannot receive this ledger.');
  const existing = data.moneyFlow?.brd;
  if (existing && existing.accountId !== accountId)
    throw new Error('BRD ledger is already linked to another account.');
  const known = new Set((existing?.rows || []).map((row) => row.id));
  const replacements = new Map();
  const removed = new Set();
  for (const { row, candidates } of brdImportMatches(existing?.rows || [], statement.rows)) {
    const choice = reconciliation[row.id];
    if (choice === 'keep') continue;
    const manual = candidates.find((candidate) => candidate.id === choice);
    if (!manual || removed.has(choice))
      throw new Error(
        'Review each possible manual match. A manual entry can replace only one statement row.',
      );
    removed.add(choice);
    replacements.set(row.id, manual);
  }
  const addedRows = statement.rows
    .filter((row) => !known.has(row.id))
    .map((row) =>
      replacements.has(row.id) ? { ...row, notes: replacements.get(row.id).notes || '' } : row,
    );
  const duplicates = statement.rows.length - addedRows.length;
  const alreadyImported = existing?.imports.some((batch) => batch.id === statement.id);
  const ledger = BrdLedgerSchema.parse({
    accountId,
    rows: [...(existing?.rows || []).filter((row) => !removed.has(row.id)), ...addedRows],
    ownRecipients,
    imports: alreadyImported
      ? existing.imports
      : [
          ...(existing?.imports || []),
          { id: statement.id, fileName, importedAt, added: addedRows.length, duplicates },
        ],
    balanceConfirmation: balanceConfirmation || existing?.balanceConfirmation || null,
  });
  let accounts = data.accounts;
  if (balanceConfirmation) {
    const { date, amountMinor } = ledger.balanceConfirmation;
    const month = date.slice(0, 7);
    const note = `Balance confirmed ${date}; not derived from the BRD CSV.`;
    accounts = data.accounts.map((row) =>
      row.id !== accountId
        ? row
        : {
            ...row,
            balances: { ...row.balances, [month]: amountMinor / 100 },
            notes: {
              ...row.notes,
              [month]: row.notes?.[month]?.includes(note)
                ? row.notes[month]
                : [row.notes?.[month], note].filter(Boolean).join('\n'),
            },
          },
    );
  }
  return {
    moneyFlow: { ...data.moneyFlow, brd: ledger },
    accounts,
    added: addedRows.length,
    duplicates,
  };
}

export function summarizeBrd(rows) {
  const result = {
    income: 0,
    expense: 0,
    refund: 0,
    transfersIn: 0,
    transfersOut: 0,
    cash: 0,
    net: 0,
  };
  for (const row of rows) {
    const credit = row.direction === 'CRDT' || row.reversal;
    result.net += (credit ? 1 : -1) * row.amountMinor;
    if (row.category === 'transfer')
      result[credit ? 'transfersIn' : 'transfersOut'] += row.amountMinor;
    else if (row.category === 'cash-withdrawal') result.cash += row.amountMinor;
    else result[row.category] += row.amountMinor;
  }
  return result;
}
