// Test-only CSV writer used by the property tests: turns synthetic rows into the text of
// each supported import profile so the parser can be checked against its own inputs.

export const AMOUNT_STYLES = ['plain', 'comma', 'us', 'eu', 'space', 'nbsp'];

const group = (digits, separator) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);

// Formats integer cents the way different banks and spreadsheets print them.
export function formatCents(cents, style = 'plain') {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = String(Math.trunc(abs / 100));
  const fraction = String(abs % 100).padStart(2, '0');
  switch (style) {
    case 'comma':
      return `${sign}${whole},${fraction}`;
    case 'us':
      return `${sign}${group(whole, ',')}.${fraction}`;
    case 'eu':
      return `${sign}${group(whole, '.')},${fraction}`;
    case 'space':
      return `${sign}${group(whole, ' ')},${fraction}`;
    case 'nbsp':
      return `${sign}${group(whole, ' ')},${fraction}`;
    default:
      return `${sign}${whole}.${fraction}`;
  }
}

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;

export const CSV_PROFILES = {
  'normalized-csv': {
    header: 'Date,Description,Amount,Category,Subcategory,Flow,Type,Currency,Reference',
    row: (r, amount) => [
      r.date,
      r.desc,
      amount,
      'Food',
      'Groceries',
      r.cents < 0 ? 'Debit' : 'Credit',
      'card payment',
      r.currency,
      r.ref,
    ],
  },
  'revolut-personal-raw': {
    header: 'Started Date,Completed Date,Description,Amount,Type,Currency,Reference',
    row: (r, amount) => [r.date, r.date, r.desc, amount, 'card payment', r.currency, r.ref],
  },
  'revolut-business-transaction': {
    header:
      'Transaction started (UTC),Transaction completed (UTC),Transaction Description,Transaction Type,Payment Currency,Amount (Payment Currency),Transaction ID,Account',
    row: (r, amount) => [
      `${r.date}T08:00:00Z`,
      `${r.date}T08:05:00Z`,
      r.desc,
      'card payment',
      r.currency,
      amount,
      r.ref,
      'Synthetic Main',
    ],
  },
  'revolut-business-expense': {
    header:
      'Transaction started (UTC),Transaction completed (UTC),Expense ID,Transaction Type,Expense Description,Original Currency,Original Amount (Original Currency),Payment Currency,Amount (Payment Currency)',
    row: (r, amount) => [
      `${r.date}T08:00:00Z`,
      `${r.date}T08:05:00Z`,
      r.ref,
      'card payment',
      r.desc,
      r.currency,
      amount,
      r.currency,
      amount,
    ],
  },
};

// Every field is quoted so decimal commas, separators and newlines in descriptions are safe.
// Rows with `ref: undefined` write an empty reference.
export function serializeCsv(profileId, rows, { amountStyle = 'plain', eol = '\n' } = {}) {
  const profile = CSV_PROFILES[profileId];
  const lines = rows.map((row) =>
    profile
      .row({ ...row, ref: row.ref ?? '' }, formatCents(row.cents, amountStyle))
      .map(quote)
      .join(','),
  );
  return [profile.header, ...lines].join(eol) + eol;
}
