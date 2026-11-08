import { describe, expect, it } from 'vitest';
import {
  applyPortfolioQuotes,
  getPortfolioCurrencySummary,
  getPortfolioInsightRows,
  getPortfolioReportingCurrency,
} from '../lib/portfolioInsights';

describe('portfolio insights', () => {
  it('reports XTB RON-account USD holdings in RON and keeps USD ETFs separate', () => {
    const rows = getPortfolioInsightRows([
      { broker: 'XTB', account: 'RON stocks', ticker: 'A', quantity: 2, avgCost: 10, currentPrice: 15, currency: 'USD' },
      { broker: 'XTB', account: 'USD ETFs', ticker: 'B', quantity: 1, avgCost: 100, currentPrice: 120, currency: 'USD', accountCurrency: 'USD' },
    ], { USD: 5, EUR: 5 });

    expect(getPortfolioReportingCurrency(rows[0])).toBe('RON');
    expect(getPortfolioCurrencySummary(rows, 'RON').totalMarketValue).toBe(150);
    expect(getPortfolioCurrencySummary(rows, 'USD').totalMarketValue).toBe(120);
  });

  it('groups and ranks holdings by broker account in the selected currency', () => {
    const rows = getPortfolioInsightRows([
      { broker: 'Tradeville', account: 'BVB', ticker: 'TLV', quantity: 10, avgCost: 20, currentPrice: 30, currency: 'RON' },
      { broker: 'XTB', account: 'RON stocks', ticker: 'AMD', quantity: 1, avgCost: 100, currentPrice: 110, currency: 'RON' },
    ], { USD: 5, EUR: 5 });
    const summary = getPortfolioCurrencySummary(rows, 'RON');

    expect(summary.accountTotals).toHaveLength(2);
    expect(summary.topInvestments[0].ticker).toBe('TLV');
  });

  it('applies matching Yahoo prices and preserves holdings on currency mismatch', () => {
    const holdings = [
      { id: 'one', ticker: 'AAPL', quantity: 1, currentPrice: 190, currency: 'USD', priceSource: 'manual' },
      { id: 'two', ticker: 'TLV', quoteSymbol: 'TLV.RO', quantity: 2, currentPrice: 30, currency: 'RON', priceSource: 'manual' },
    ];
    const result = applyPortfolioQuotes(holdings, [
      { symbol: 'AAPL', price: 200, currency: 'USD', updatedAt: 1234 },
      { symbol: 'TLV.RO', price: 31, currency: 'USD', updatedAt: 1234 },
    ]);

    expect(result.updates).toEqual([expect.objectContaining({
      id: 'one',
      currentPrice: 200,
      quoteSymbol: 'AAPL',
      priceSource: 'yahoo',
      priceUpdatedAt: 1234,
    })]);
    expect(result.currencyMismatches).toEqual([expect.objectContaining({
      ticker: 'TLV',
      holdingCurrency: 'RON',
      quoteCurrency: 'USD',
    })]);
    expect(holdings[1].currentPrice).toBe(30);
  });
});
