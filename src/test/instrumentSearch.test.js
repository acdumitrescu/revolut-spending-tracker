import { describe, expect, it } from 'vitest';
import { getLocalInstrumentCatalogSummary, searchLocalInstruments } from '../lib/instrumentSearch';

describe('local instrument search', () => {
  it('finds BVB shares by company name and returns the Yahoo symbol', () => {
    expect(searchLocalInstruments('transilvania')).toContainEqual(expect.objectContaining({
      ticker: 'TLV',
      quoteSymbol: 'TLV.RO',
      exchange: 'BVB',
      currency: 'RON',
    }));
  });

  it('finds curated global stocks and ETFs by ticker', () => {
    expect(searchLocalInstruments('aapl')[0]).toMatchObject({
      ticker: 'AAPL', quoteSymbol: 'AAPL', assetClass: 'Stock', currency: 'USD',
    });
    expect(searchLocalInstruments('vanguard total world')[0]).toMatchObject({
      ticker: 'VT', assetClass: 'ETF', currency: 'USD',
    });
  });

  it('requires at least two characters and includes the full local catalog', () => {
    expect(searchLocalInstruments('t')).toEqual([]);
    expect(getLocalInstrumentCatalogSummary()).toMatchObject({
      bvb: expect.any(Number),
      globalStocks: expect.any(Number),
      globalEtfs: expect.any(Number),
      total: expect.any(Number),
    });
    expect(getLocalInstrumentCatalogSummary().bvb).toBeGreaterThan(300);
  });
});
