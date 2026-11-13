import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { convertAmount, DEFAULT_FX_RATES, SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
import { mergeTransactions, txKey } from '../lib/csvParser';
import { getCategoryTotals, getMonthlyExpense, getMonthlyIncome } from '../lib/selectors';
import { appReducer, createInitialAppData, createPersistedAppState } from '../lib/appState';

// Property tests for the money rules. Each generates many random synthetic inputs;
// fast-check prints the smallest failing case when a rule breaks. Seeded for determinism.
const RUNS = { numRuns: 200, seed: 20261113 };

const currency = fc.constantFrom(...SUPPORTED_DISPLAY_CURRENCIES);
const cents = fc.integer({ min: -5_000_000, max: 5_000_000 }).map((value) => value / 100);
const rates = fc.record({
  EUR: fc.integer({ min: 100, max: 100_000 }).map((value) => value / 10_000),
  USD: fc.integer({ min: 100, max: 100_000 }).map((value) => value / 10_000),
});

// Small pools on purpose: collisions between rows are what dedupe has to handle.
const transaction = fc
  .record({
    day: fc.integer({ min: 1, max: 4 }),
    desc: fc.constantFrom('Shop', 'Cafe', 'Rent', 'Salary'),
    amt: fc.integer({ min: 1, max: 400 }).map((value) => value / 4),
    flow: fc.constantFrom('Debit', 'Credit'),
    type: fc.constantFrom('Card Payment', 'Transfer'),
    currency: fc.constantFrom('RON', 'EUR', ''),
    ref: fc.option(fc.constantFrom('r1', 'r2', 'r3', 'r4', 'r5'), { nil: undefined }),
    cat: fc.constantFrom('Food', 'Shopping', 'Income', 'Transfers', 'Savings', 'Refunds'),
  })
  .map(({ day, ref, ...rest }) => ({
    ...rest,
    amt: rest.flow === 'Debit' ? -rest.amt : rest.amt,
    date: `2026-03-0${day}`,
    ym: '2026-03',
    sub: '',
    ...(ref ? { ref } : {}),
  }));
const csvRows = fc.array(transaction, { maxLength: 12 });

const close = (actual, expected) =>
  Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));

describe('money invariants', () => {
  it('converting A to B and back returns the original amount', () => {
    fc.assert(
      fc.property(cents, currency, currency, rates, (amount, from, to, fxRates) => {
        const there = convertAmount(amount, from, to, fxRates);
        expect(close(convertAmount(there, to, from, fxRates), amount)).toBe(true);
      }),
      RUNS,
    );
  });

  it('converting to the same currency is the identity', () => {
    fc.assert(
      fc.property(cents, currency, (amount, code) => {
        expect(convertAmount(amount, code, code, DEFAULT_FX_RATES)).toBe(amount);
      }),
      RUNS,
    );
  });

  it('period totals equal the sum of their rows', () => {
    fc.assert(
      fc.property(csvRows, (rows) => {
        // A debit filed under Refunds is not a refund; keep the model to realistic rows.
        const ronRows = rows.map((row) => ({
          ...row,
          currency: 'RON',
          cat: row.flow === 'Debit' && row.cat === 'Refunds' ? 'Shopping' : row.cat,
        }));
        const debits = ronRows.filter(
          (row) => row.flow === 'Debit' && !['Transfers', 'Savings'].includes(row.cat),
        );
        const refunds = ronRows.filter((row) => row.flow === 'Credit' && row.cat === 'Refunds');
        const income = ronRows.filter((row) => row.flow === 'Credit' && row.cat === 'Income');
        const sum = (list) => list.reduce((total, row) => total + Math.abs(row.amt), 0);

        expect(close(getMonthlyIncome(ronRows, '2026-03'), sum(income))).toBe(true);
        expect(
          close(getMonthlyExpense(ronRows, '2026-03'), Math.max(0, sum(debits) - sum(refunds))),
        ).toBe(true);
        const categories = getCategoryTotals(ronRows, '2026-03');
        const categorySpend = Object.entries(categories)
          .filter(([name]) => name !== 'Refunds')
          .reduce((total, [, value]) => total + value, 0);
        expect(close(categorySpend, sum(debits))).toBe(true);
      }),
      RUNS,
    );
  });

  it('importing the same CSV twice adds zero rows', () => {
    fc.assert(
      fc.property(csvRows, csvRows, (existingRows, file) => {
        const once = mergeTransactions(existingRows, file);
        const twice = mergeTransactions(once, file);
        expect(twice).toHaveLength(once.length);
      }),
      RUNS,
    );
  });

  it('a currency override keeps txKey, and re-importing the file adds zero rows', () => {
    fc.assert(
      fc.property(
        csvRows.filter((rows) => rows.length > 0),
        fc.nat(),
        currency,
        (file, pick, nextCurrency) => {
          const transactions = mergeTransactions([], file);
          fc.pre(transactions.length > 0);
          const target = transactions[pick % transactions.length];
          const key = txKey(target);
          const state = createPersistedAppState({ ...createInitialAppData(), transactions });
          const next = appReducer(state, {
            type: 'set_transaction_currency',
            transactionKey: key,
            currency: nextCurrency,
            getTransactionKey: txKey,
          });

          const changedKeys = next.data.transactions.map(txKey);
          expect(changedKeys).toEqual(transactions.map(txKey));
          expect(mergeTransactions(next.data.transactions, file)).toHaveLength(transactions.length);

          const restored = appReducer(next, {
            type: 'set_transaction_currency',
            transactionKey: key,
            getTransactionKey: txKey,
          });
          expect(restored.data.transactions.map(txKey)).toEqual(transactions.map(txKey));
        },
      ),
      RUNS,
    );
  });

  // Split transactions do not exist yet (Plan 1, phase 4.3). When they land, add:
  // "split children sum to the parent, and aggregates count children instead of the parent".
});
