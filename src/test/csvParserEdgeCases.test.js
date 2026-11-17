import { describe, expect, it } from 'vitest';
import { analyzeTransactionImport, parseCSV } from '../lib/csvParser';
import normalizedFixture from './fixtures/synthetic-normalized-profile.csv?raw';
import personalFixture from './fixtures/synthetic-personal-profile.csv?raw';
import businessFixture from './fixtures/synthetic-business-profile.csv?raw';
import duplicateFixture from './fixtures/synthetic-duplicate-rows-profile.csv?raw';
import quotedFixture from './fixtures/synthetic-quoted-fields-profile.csv?raw';
import truncatedFixture from './fixtures/synthetic-truncated-last-row-profile.csv?raw';

// Malformed real-world export shapes. All data is synthetic. Fixtures for the checked-in
// golden parses live in src/test/fixtures/ and are listed in csvParserGolden.test.js.
const BOM = String.fromCharCode(0xfeff);
const parse = (text) => parseCSV(new File([text], 'synthetic-edge.csv', { type: 'text/csv' }));

const NORMALIZED_HEADER =
  'Date,Description,Amount,Category,Subcategory,Flow,Type,Currency,Reference';
const amountOf = async (rawAmount) => {
  const row = `2026-07-01,Synthetic Row,${rawAmount},Food,Groceries,,card payment,RON,amt-1`;
  const result = await parse(`${NORMALIZED_HEADER}\n${row}\n`);
  return result.transactions[0]?.amt;
};

describe('byte-order mark', () => {
  it.each([
    ['normalized-csv', normalizedFixture],
    ['revolut-personal-raw', personalFixture],
    ['revolut-business-transaction', businessFixture],
  ])('recognises the %s header behind a UTF-8 BOM and parses identically', async (id, text) => {
    const plain = await parse(text);
    const withBom = await parse(`${BOM}${text}`);
    expect(withBom.summary.detectedProfileId).toBe(id);
    expect(withBom).toEqual(plain);
    expect(withBom.summary.warnings.join(' ')).not.toMatch(/Unrecognized columns/);
  });

  it('does not leak the BOM into the first column name', async () => {
    const result = await parse(`${BOM}${normalizedFixture}`);
    expect(result.transactions[0].date).toBe('2026-05-02');
    expect(result.rejectedRows).toEqual([]);
  });

  it('treats a BOM-only file as empty', async () => {
    const result = await parse(BOM);
    expect(result.summary.detectedProfileId).toBe('empty');
  });
});

describe('decimal and thousands separators', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['0,05', 0.05],
    ['0.05', 0.05],
    ['1 234,56', 1234.56],
    ['1 234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['1 234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['12 345 678,90', 12345678.9],
    ['-1.234,56', -1234.56],
    ['-1,234.56', -1234.56],
    ['-1234,56', -1234.56],
    ['-1 234,56', -1234.56],
    ['-0,99', -0.99],
    ['RON 1.234,56', 1234.56],
    ['-1.234,56 RON', -1234.56],
    ['€-12,50', -12.5],
    ['+1.234,56', 1234.56],
    ['  42,10  ', 42.1],
  ])('reads %j as exactly %s', async (raw, expected) => {
    const quoted = `"${raw}"`;
    expect(await amountOf(quoted)).toBe(expected);
  });

  it.each([
    ['(12.50)', -12.5],
    ['(1.234,56)', -1234.56],
    ['(1,234.56)', -1234.56],
  ])('reads accounting parentheses %j as a negative amount', async (raw, expected) => {
    expect(await amountOf(`"${raw}"`)).toBe(expected);
  });

  // Ambiguous on purpose: a lone separator followed by exactly three digits could be a
  // thousands group or a decimal fraction. Current behaviour is pinned here so a change is
  // a conscious decision, not an accident. See the T4 report.
  it('pins the lone-separator-with-three-digits behaviour', async () => {
    expect(await amountOf('"1,234"')).toBe(1234);
    expect(await amountOf('"1.234"')).toBe(1.234);
    expect(await amountOf('"-1,234"')).toBe(-1234);
    expect(await amountOf('"1,234,567"')).toBe(1234567);
  });

  it.each(['abc', '-', '.', ',', '', 'N/A', '1.2.3,4,5x'])(
    'rejects %j as an invalid amount instead of importing garbage',
    async (raw) => {
      const result = await parse(
        `${NORMALIZED_HEADER}\n2026-07-01,Synthetic Row,"${raw}",Food,Groceries,,card payment,RON,amt-1\n`,
      );
      expect(result.transactions).toEqual([]);
      expect(result.rejectedRows).toHaveLength(1);
    },
  );

  it('never changes the magnitude by 100x or 1000x across notations of one value', async () => {
    const notations = ['4321.09', '4321,09', '4,321.09', '4.321,09', '4 321,09', '4 321.09'];
    const values = await Promise.all(notations.map((raw) => amountOf(`"${raw}"`)));
    expect(new Set(values)).toEqual(new Set([4321.09]));
  });
});

describe('duplicate rows', () => {
  it('flags repeated rows inside one file and keeps distinct references', async () => {
    const { transactions } = await parse(duplicateFixture);
    expect(transactions).toHaveLength(6);

    const analysis = analyzeTransactionImport([], transactions);
    expect(analysis.fileDuplicateCount).toBe(2);
    expect(analysis.existingDuplicateCount).toBe(0);
    // Same bakery on a later day and the second pharmacy reference are not duplicates.
    expect(analysis.acceptedTransactions.map((tx) => `${tx.date} ${tx.desc} ${tx.ref}`)).toEqual([
      '2026-08-01 Synthetic Bakery revolut:2026-08-01|2026-08-01',
      '2026-08-02 Synthetic Bakery revolut:2026-08-02|2026-08-02',
      '2026-08-03 Synthetic Pharmacy dup-ref-1',
      '2026-08-03 Synthetic Pharmacy dup-ref-2',
    ]);
  });

  it('adds zero rows when the same file is imported a second time', async () => {
    const first = await parse(duplicateFixture);
    const firstImport = analyzeTransactionImport([], first.transactions);

    const again = await parse(duplicateFixture);
    const secondImport = analyzeTransactionImport(
      firstImport.acceptedTransactions,
      again.transactions,
    );
    expect(secondImport.acceptedTransactions).toEqual([]);
    expect(secondImport.duplicateCount).toBe(again.transactions.length);
    expect(secondImport.existingDuplicateCount).toBe(again.transactions.length);
  });
});

describe('line endings and trailing content', () => {
  const lf = normalizedFixture.replace(/\r\n?/g, '\n');
  const variants = {
    CRLF: lf.replace(/\n/g, '\r\n'),
    'lone CR': lf.replace(/\n/g, '\r'),
    'no final newline': lf.replace(/\n+$/, ''),
    'trailing blank lines (LF)': `${lf}\n\n\n`,
    'trailing blank lines (CRLF)': `${lf.replace(/\n/g, '\r\n')}\r\n\r\n`,
    'blank lines between rows': lf.replace(/\n/g, '\n\n'),
  };

  it.each(Object.entries(variants))('parses %s exactly like the LF file', async (_name, text) => {
    const expected = await parse(lf);
    expect(expected.transactions.length).toBeGreaterThan(0);
    expect(await parse(text)).toEqual(expected);
  });
});

describe('truncated files', () => {
  it('rejects a last row that was cut before the amount and keeps the complete rows', async () => {
    const result = await parse(truncatedFixture);
    expect(result.transactions.map((tx) => tx.desc)).toEqual(['Synthetic Complete Row']);
    expect(result.rejectedRows).toEqual([{ rowNumber: 3, reason: 'invalid amount' }]);
    expect(result.summary.warnings.join(' ')).toMatch(/Too few fields/i);
  });

  it('rejects a file cut mid-row with no final newline', async () => {
    const cut = `${NORMALIZED_HEADER}\n2026-09-01,Synthetic Complete Row,-30.00,Food,Groceries,Debit,card payment,RON,trunc-1\n2026-09-02,Synthetic Cut`;
    const result = await parse(cut);
    expect(result.transactions).toHaveLength(1);
    expect(result.rejectedRows).toHaveLength(1);
  });

  it('rejects a file cut inside an open quoted field instead of importing it', async () => {
    const cut = `${NORMALIZED_HEADER}\n2026-09-01,Synthetic Complete Row,-30.00,Food,Groceries,Debit,card payment,RON,trunc-1\n2026-09-02,"Synthetic Cut Off`;
    const result = await parse(cut);
    expect(result.transactions.map((tx) => tx.desc)).toEqual(['Synthetic Complete Row']);
    expect(result.summary.warnings.join(' ')).toMatch(/quote/i);
  });

  // Ambiguous on purpose: a row cut after the amount still has every required value, so it
  // imports (with a visible "too few fields" warning). Pinned, and flagged in the T4 report.
  it('imports a row cut after the amount but surfaces a warning for review', async () => {
    const cut = `${NORMALIZED_HEADER}\n2026-09-02,Synthetic Cut Late,-30.00,Food,Groceries,Debit,card pay`;
    const result = await parse(cut);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amt).toBe(-30);
    expect(result.summary.warnings.join(' ')).toMatch(/Too few fields/i);
  });
});

describe('empty and unsupported files', () => {
  it.each([
    ['an empty file', ''],
    ['only newlines', '\n\n\n'],
    ['only CRLF newlines', '\r\n\r\n'],
    ['a normalized header with no rows', `${NORMALIZED_HEADER}\n`],
    ['a normalized header without a newline', NORMALIZED_HEADER],
    ['a single line of text (it is just a header)', '{"transactions": [{"amount": 5}]}\n'],
    ['a personal header with no rows', 'Started Date,Completed Date,Description,Amount\r\n'],
  ])('returns an empty result for %s', async (_name, text) => {
    const result = await parse(text);
    expect(result.transactions).toEqual([]);
    expect(result.rejectedRows).toEqual([]);
    expect(result.summary.totalRows).toBe(0);
    expect(result.summary.detectedProfileId).toBe('empty');
  });

  it.each([
    ['an unknown header layout', 'Foo,Bar,Baz\n1,2,3\n4,5,6\n'],
    ['a single column file', 'just some text\nmore text\n'],
    [
      'a header missing the amount column',
      'Date,Description,Category,Subcategory\n2026-01-01,Synthetic,Food,Groceries\n',
    ],
    [
      'a header missing the date column',
      'Description,Amount,Category,Subcategory\nSynthetic,5,Food,Groceries\n',
    ],
    ['a whitespace-only file', '   \n   \n'],
  ])('rejects %s with a clear error and imports nothing', async (_name, text) => {
    await expect(parse(text)).rejects.toThrow(/Unknown CSV format.*unsupported-file-shape/);
  });

  it('rejects a data row that has nothing usable instead of importing garbage', async () => {
    const result = await parse(`${NORMALIZED_HEADER}\n,,,,,,,,\n`);
    expect(result.transactions).toEqual([]);
    expect(result.summary.totalRows).toBeLessThanOrEqual(1);
  });
});

describe('quoted fields', () => {
  it('keeps commas, doubled quotes and newlines inside descriptions', async () => {
    const result = await parse(quotedFixture);
    expect(result.rejectedRows).toEqual([]);
    expect(result.summary.warnings).toEqual([]);
    expect(result.transactions.map((tx) => tx.desc)).toEqual([
      'Synthetic Cafe, Downtown',
      'Synthetic "Quoted" Shop',
      'Synthetic Multi\nLine Merchant',
      'Synthetic, "All" Three\nCombined',
    ]);
    expect(result.transactions.map((tx) => tx.amt)).toEqual([-12.5, -8, -15.25, -1]);
  });

  it('parses the same quoted rows identically with CRLF row endings', async () => {
    const lf = quotedFixture.replace(/\r\n?/g, '\n');
    const crlfRows = lf.replace(/\n(?=\d{4}-)/g, '\r\n');
    const expected = await parse(lf);
    expect((await parse(crlfRows)).transactions).toEqual(expected.transactions);
  });
});
