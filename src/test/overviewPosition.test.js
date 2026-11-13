import { describe, expect, it } from 'vitest';
import { getOverviewPosition, getRevolutTransactions } from '../lib/overviewPosition';
import { getMonthlyExpense } from '../lib/selectors';

const data = {
  displayCurrency: 'RON',
  fxRates: { EUR: 5, USD: 4.6 },
  accounts: [
    { id: 'cash', name: 'Cash', currency: 'RON', balances: { '2026-01': 1000 } },
    { id: 'card', name: 'Credit card', currency: 'RON', balances: { '2026-02': -200 } },
    { id: 'eur', name: 'EUR savings', currency: 'EUR', balances: { '2026-02': 100 } },
  ],
  creditRecords: [
    {
      id: 'card-link',
      kind: 'card',
      accountId: 'card',
      monthlyPayment: null,
      purchases: [{ remainingBalance: 200 }],
    },
    { id: 'vendor', kind: 'vendor', remainingBalance: 100, currency: 'RON', monthlyPayment: null },
    { id: 'plan', kind: 'planned', amountFinanced: 99999, currency: 'RON' },
  ],
  portfolioHoldings: [
    { quantity: 2, currentPrice: 100, avgCost: 80, currency: 'EUR', assetClass: 'ETF' },
  ],
};
describe('overview financial position', () => {
  it('carries balances forward and deducts linked card debt exactly once, excluding future financing', () => {
    const result = getOverviewPosition(data);
    expect(result.snapshot.total).toBe(1300);
    expect(result.netWorth).toBe(1200);
    expect(result.vendorDebt).toBe(100);
    expect(result.snapshot.carried).toBe(1);
  });
  it('only adds investments separately when requested', () => {
    expect(getOverviewPosition(data, true).netWorth).toBe(2200);
    expect(
      getOverviewPosition({ ...data, accounts: [], creditRecords: [], portfolioHoldings: [] })
        .netWorth,
    ).toBe(0);
  });
  it('excludes Revolut funding, transfers, other banks and unidentified rows from spending', () => {
    const base = {
      date: '2026-01-01',
      ym: '2026-01',
      source: 'revolut-personal',
      type: 'CARD_PAYMENT',
      cat: 'Groceries',
      flow: 'Debit',
      amt: -100,
      currency: 'RON',
    };
    const rows = [
      base,
      { ...base, source: 'master' },
      { ...base, source: 'other-bank' },
      { ...base, type: 'TRANSFER' },
      { ...base, cat: 'Transfers' },
      { ...base, cat: 'Income', flow: 'Credit', amt: 5000 },
      { ...base, cat: 'Refunds', flow: 'Credit', amt: 20 },
    ];
    const selected = getRevolutTransactions(rows);
    expect(selected).toHaveLength(2);
    expect(getMonthlyExpense(selected, '2026-01')).toBe(80);
    expect(getRevolutTransactions(rows, true)).toHaveLength(3);
  });
});

it('splits brokerage, physical cash, banks and negative ING without losing crypto or counting accounts twice', async () => {
  const { getAccountGroups } = await import('../lib/overviewPosition');
  const account = (name, currency, balance) => ({
    name,
    currency,
    balances: { '2026-10': balance },
  });
  const input = {
    displayCurrency: 'RON',
    fxRates: { EUR: 5, USD: 4 },
    accounts: [
      account('XTB USD', 'USD', 100),
      account('XTB RON', 'RON', 400),
      account('TradeVille', 'RON', 200),
      account('Cash', 'RON', 100),
      account('Cash', 'EUR', 20),
      account('ING DEBIT', 'RON', 500),
      account('ING CREDIT CARD', 'RON', -300),
      account('BT EUR', 'EUR', 100),
      account('Revolut', 'RON', 200),
      account('Kraken', 'EUR', 20),
    ],
  };
  const result = getAccountGroups(input);
  expect(result.shares.total).toBe(250);
  expect(result.cash.total).toBe(200);
  expect(result.bank.total).toBe(1200);
  expect(result.credits.total).toBe(-300);
  expect(result.other.total).toBe(100);
  expect(
    result.shares.total * 4 +
      result.cash.total +
      result.bank.total +
      result.credits.total +
      result.other.total,
  ).toBe(getOverviewPosition({ ...input, creditRecords: [] }).snapshot.total);
});
