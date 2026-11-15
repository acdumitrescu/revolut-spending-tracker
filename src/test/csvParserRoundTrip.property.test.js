import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseCSV } from '../lib/csvParser';
import { AMOUNT_STYLES, CSV_PROFILES, serializeCsv } from './fixtures/csvSerializer';

// Round trip: synthetic rows -> CSV text in each supported profile -> parseCSV -> same rows.
// Amounts are compared as exact cents. Seeded for determinism; fast-check prints the
// smallest failing case when the parser and the serialiser disagree.
const BOM = String.fromCharCode(0xfeff);
const RUNS = { numRuns: 60, seed: 20261116 };

const DAY_MS = 86_400_000;
const START = Date.UTC(2020, 0, 1);

const date = fc
  .integer({ min: 0, max: 3650 })
  .map((offset) => new Date(START + offset * DAY_MS).toISOString().slice(0, 10));

// Starts and ends with a letter (descriptions are trimmed); the middle exercises the
// quoting rules: commas, doubled quotes, spaces and embedded newlines.
const description = fc
  .array(fc.constantFrom('a', 'B', '7', ' ', ',', '"', '\n', '-', '.'), { maxLength: 12 })
  .map((chars) => `S${chars.join('')}x`);

const cents = fc
  .tuple(fc.integer({ min: 1, max: 1_000_000_000 }), fc.boolean())
  .map(([value, negative]) => (negative ? -value : value));

const rows = fc
  .array(
    fc.record({
      date,
      desc: description,
      cents,
      currency: fc.constantFrom('RON', 'EUR', 'USD', 'GBP'),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((list) => list.map((row, index) => ({ ...row, ref: `rt-${index}` })));

const amountStyle = fc.constantFrom(...AMOUNT_STYLES);
const eol = fc.constantFrom('\n', '\r\n');

describe('CSV parser round trip', () => {
  it.each(Object.keys(CSV_PROFILES))(
    'recovers amounts, dates, currencies and descriptions from the %s profile',
    async (profileId) => {
      await fc.assert(
        fc.asyncProperty(
          rows,
          amountStyle,
          eol,
          fc.boolean(),
          async (list, style, lineEnd, bom) => {
            const text = serializeCsv(profileId, list, { amountStyle: style, eol: lineEnd });
            const result = await parseCSV(
              new File([bom ? `${BOM}${text}` : text], 'synthetic-round-trip.csv'),
            );

            expect(result.summary.detectedProfileId).toBe(profileId);
            expect(result.rejectedRows).toEqual([]);
            expect(result.transactions).toHaveLength(list.length);
            result.transactions.forEach((tx, index) => {
              const expected = list[index];
              expect(Math.round(tx.amt * 100)).toBe(expected.cents);
              expect(tx.amt).toBe(expected.cents / 100);
              expect(tx.date).toBe(expected.date);
              expect(tx.currency).toBe(expected.currency);
              expect(tx.desc).toBe(expected.desc);
              expect(tx.ref).toBe(expected.ref);
            });
          },
        ),
        RUNS,
      );
    },
  );

  it('keeps the magnitude when only the number notation changes', async () => {
    await fc.assert(
      fc.asyncProperty(cents, async (value) => {
        const row = {
          date: '2026-01-01',
          desc: 'Synthetic',
          cents: value,
          currency: 'RON',
          ref: 'n',
        };
        const amounts = await Promise.all(
          AMOUNT_STYLES.map(async (style) => {
            const text = serializeCsv('normalized-csv', [row], { amountStyle: style });
            const result = await parseCSV(new File([text], 'synthetic-notation.csv'));
            return result.transactions[0].amt;
          }),
        );
        expect(new Set(amounts)).toEqual(new Set([value / 100]));
      }),
      RUNS,
    );
  });
});
