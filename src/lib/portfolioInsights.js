import { convertAmountToDisplay, normalizeCurrencyCode } from './fx';

export function getPortfolioReportingCurrency(holding) {
  const explicitCurrency = String(holding?.accountCurrency || '').trim();
  if (explicitCurrency) return normalizeCurrencyCode(explicitCurrency);

  // Existing private XTB holdings used this account label before reporting currency was stored.
  if (holding?.broker === 'XTB' && holding?.account === 'RON stocks') return 'RON';

  return normalizeCurrencyCode(holding?.currency);
}

export function getPortfolioInsightRows(holdings = [], fxRates) {
  return holdings.map((holding) => {
    const reportingCurrency = getPortfolioReportingCurrency(holding);
    const nativeCost = holding.quantity * holding.avgCost;
    const nativeValue = holding.quantity * holding.currentPrice;
    const costBasis = convertAmountToDisplay(
      nativeCost,
      holding.currency,
      reportingCurrency,
      fxRates,
    );
    const marketValue = convertAmountToDisplay(
      nativeValue,
      holding.currency,
      reportingCurrency,
      fxRates,
    );

    return {
      ...holding,
      broker: holding.broker || 'Manual',
      account: holding.account || 'Unassigned',
      reportingCurrency,
      nativeCost,
      nativeValue,
      costBasis,
      marketValue,
      gainLoss: marketValue - costBasis,
      gainLossPct: costBasis > 0 ? (marketValue - costBasis) / costBasis : 0,
    };
  });
}

export function getPortfolioCurrencySummary(rows, currency) {
  const visibleRows = rows.filter((row) => row.reportingCurrency === currency);
  const totalMarketValue = visibleRows.reduce((sum, row) => sum + row.marketValue, 0);
  const totalCostBasis = visibleRows.reduce((sum, row) => sum + row.costBasis, 0);
  const accountTotals = Object.values(
    visibleRows.reduce((accounts, row) => {
      const key = `${row.broker}:${row.account}`;
      const current = accounts[key] || {
        key,
        broker: row.broker,
        account: row.account,
        marketValue: 0,
        costBasis: 0,
      };
      current.marketValue += row.marketValue;
      current.costBasis += row.costBasis;
      accounts[key] = current;
      return accounts;
    }, {}),
  );

  return {
    rows: visibleRows,
    totalMarketValue,
    totalCostBasis,
    gainLoss: totalMarketValue - totalCostBasis,
    accountTotals: accountTotals.sort((a, b) => b.marketValue - a.marketValue),
    topInvestments: [...visibleRows].sort((a, b) => b.costBasis - a.costBasis).slice(0, 6),
  };
}

export function applyPortfolioQuotes(holdings = [], quotes = []) {
  const quotesBySymbol = new Map(
    quotes.map((quote) => [
      String(quote?.symbol || '')
        .trim()
        .toUpperCase(),
      quote,
    ]),
  );
  const updates = [];
  const currencyMismatches = [];

  for (const holding of holdings) {
    const symbol = String(holding?.quoteSymbol || holding?.ticker || '')
      .trim()
      .toUpperCase();
    const quote = quotesBySymbol.get(symbol);
    if (!quote) continue;

    const holdingCurrency = normalizeCurrencyCode(holding.currency);
    const quoteCurrency = normalizeCurrencyCode(quote.currency);
    if (!quote.currency || holdingCurrency !== quoteCurrency) {
      currencyMismatches.push({
        ticker: holding.ticker,
        symbol,
        holdingCurrency,
        quoteCurrency: quote.currency || 'unknown',
      });
      continue;
    }

    const price = Number(quote.price);
    if (!Number.isFinite(price) || price < 0) continue;

    updates.push({
      ...holding,
      quoteSymbol: symbol,
      currentPrice: price,
      priceSource: 'yahoo',
      priceUpdatedAt: Number.isFinite(Number(quote.updatedAt))
        ? Number(quote.updatedAt)
        : Date.now(),
    });
  }

  return { updates, currencyMismatches };
}
