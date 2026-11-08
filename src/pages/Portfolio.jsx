import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { Link } from 'react-router-dom';
import { SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
import { formatCurrency } from '../lib/utils';
import ChartWrapper from '../components/ChartWrapper';
import {
  applyPortfolioQuotes,
  getPortfolioCurrencySummary,
  getPortfolioInsightRows,
} from '../lib/portfolioInsights';
import { searchLocalInstruments } from '../lib/instrumentSearch';
import {
  fetchPortfolioQuotes,
  isYahooQuoteSymbol,
  searchYahooInstruments,
} from '../lib/quoteService';

const QUOTE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

const EMPTY_DRAFT = {
  broker: 'Manual',
  account: '',
  accountCurrency: 'RON',
  ticker: '',
  quoteSymbol: '',
  name: '',
  assetClass: 'Stock',
  quantity: '',
  avgCost: '',
  currency: 'RON',
  currentPrice: '',
};

function parseDraft(draft) {
  const quantity = Number(draft.quantity);
  const avgCost = Number(draft.avgCost);
  const currentPrice = Number(draft.currentPrice);
  if (!draft.ticker.trim() || !draft.name.trim()) return { error: 'Ticker and name are required.' };
  if (draft.quoteSymbol.trim() && !isYahooQuoteSymbol(draft.quoteSymbol)) {
    return { error: 'Yahoo symbol may contain only letters, numbers, dots, carets, equals signs, and hyphens.' };
  }
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Quantity must be greater than zero.' };
  if (!Number.isFinite(avgCost) || avgCost < 0) return { error: 'Average cost cannot be negative.' };
  if (!Number.isFinite(currentPrice) || currentPrice < 0) return { error: 'Current price cannot be negative.' };
  return {
    holding: {
      id: globalThis.crypto?.randomUUID?.() || `portfolio-${Date.now()}`,
      broker: draft.broker.trim(),
      account: draft.account.trim(),
      accountCurrency: draft.accountCurrency,
      ticker: draft.ticker.trim().toUpperCase(),
      quoteSymbol: (draft.quoteSymbol.trim() || draft.ticker.trim()).toUpperCase(),
      name: draft.name.trim(),
      assetClass: draft.assetClass.trim() || 'Other',
      quantity,
      avgCost,
      currency: draft.currency,
      currentPrice,
      priceSource: 'manual',
      priceUpdatedAt: Date.now(),
    },
  };
}

export default function Portfolio() {
  const {
    data,
    runtimeConfig,
    syncStatus,
    upsertPortfolioHolding,
    removePortfolioHolding,
  } = useAppContext();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const [activeCurrency, setActiveCurrency] = useState('RON');
  const [instrumentQuery, setInstrumentQuery] = useState('');
  const [yahooInstruments, setYahooInstruments] = useState([]);
  const [instrumentStatus, setInstrumentStatus] = useState({ phase: 'idle', message: '' });
  const [quoteSymbolDrafts, setQuoteSymbolDrafts] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState({ phase: 'idle', message: '' });
  const holdings = useMemo(() => data.portfolioHoldings || [], [data.portfolioHoldings]);
  const quoteRefreshAvailable = runtimeConfig.privateSyncEnabled && syncStatus.phase === 'synced';
  const localInstruments = useMemo(() => searchLocalInstruments(instrumentQuery), [instrumentQuery]);
  const insightRows = useMemo(
    () => getPortfolioInsightRows(holdings, data.fxRates),
    [data.fxRates, holdings]
  );
  const summary = useMemo(
    () => getPortfolioCurrencySummary(insightRows, activeCurrency),
    [activeCurrency, insightRows]
  );
  const topInvestment = summary.topInvestments[0] || null;
  const investmentChartData = useMemo(() => ({
    labels: summary.topInvestments.map((holding) => holding.ticker),
    datasets: [{
      label: 'Cost basis',
      data: summary.topInvestments.map((holding) => holding.costBasis),
      backgroundColor: '#0f9d72',
      borderRadius: 7,
    }],
  }), [summary.topInvestments]);

  const updateDraft = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
    setError('');
  };

  const selectInstrument = (instrument) => {
    const nextCurrency = SUPPORTED_DISPLAY_CURRENCIES.includes(instrument.currency)
      ? instrument.currency
      : draft.currency;
    setDraft((current) => ({
      ...current,
      ticker: instrument.ticker,
      quoteSymbol: instrument.quoteSymbol,
      name: instrument.name,
      assetClass: instrument.assetClass || current.assetClass,
      currency: nextCurrency,
    }));
    setInstrumentQuery(`${instrument.ticker} · ${instrument.name}`);
    setYahooInstruments([]);
    setInstrumentStatus({ phase: 'ready', message: `${instrument.ticker} selected. You can still edit any field below.` });
  };

  const handleYahooInstrumentSearch = async () => {
    if (instrumentQuery.trim().length < 2) {
      setInstrumentStatus({ phase: 'degraded', message: 'Enter at least two characters to search Yahoo.' });
      return;
    }
    if (!quoteRefreshAvailable) {
      setInstrumentStatus({ phase: 'degraded', message: 'Unlock private sync in Settings before searching Yahoo.' });
      return;
    }

    setInstrumentStatus({ phase: 'searching', message: 'Searching Yahoo…' });
    try {
      const results = await searchYahooInstruments(instrumentQuery);
      setYahooInstruments(results);
      setInstrumentStatus({
        phase: results.length ? 'ready' : 'degraded',
        message: results.length ? 'Yahoo results are shown below. Select the matching exchange.' : 'No Yahoo matches found.',
      });
    } catch {
      setInstrumentStatus({ phase: 'degraded', message: 'Yahoo search is unavailable. Use a local result or enter the holding manually.' });
    }
  };

  const handleSave = (event) => {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    upsertPortfolioHolding(parsed.holding);
    setDraft(EMPTY_DRAFT);
  };

  const handleRemove = (holding) => {
    if (window.confirm(`Remove ${holding.ticker} from the portfolio?`)) {
      removePortfolioHolding(holding.id);
    }
  };

  const handleQuoteSymbolBlur = (holding) => {
    const nextSymbol = String(quoteSymbolDrafts[holding.id] ?? holding.quoteSymbol ?? holding.ticker)
      .trim()
      .toUpperCase();
    if (!isYahooQuoteSymbol(nextSymbol)) {
      setQuoteStatus({
        phase: 'degraded',
        message: `${holding.ticker}: enter a valid Yahoo symbol before refreshing.`,
      });
      return;
    }

    const savedHolding = holdings.find((candidate) => candidate.id === holding.id);
    if (savedHolding && savedHolding.quoteSymbol !== nextSymbol) {
      upsertPortfolioHolding({ ...savedHolding, quoteSymbol: nextSymbol });
      setQuoteStatus({ phase: 'ready', message: `${holding.ticker} will refresh as ${nextSymbol}.` });
    }
    setQuoteSymbolDrafts((current) => ({ ...current, [holding.id]: nextSymbol }));
  };

  const handleRefreshPrices = useCallback(async () => {
    if (!quoteRefreshAvailable || quoteStatus.phase === 'refreshing') return;
    const symbols = holdings.map((holding) => holding.quoteSymbol || holding.ticker);
    if (symbols.length === 0) {
      setQuoteStatus({ phase: 'idle', message: 'Add a holding before refreshing prices.' });
      return;
    }

    setQuoteStatus({ phase: 'refreshing', message: 'Checking Yahoo market prices…' });
    try {
      const result = await fetchPortfolioQuotes(symbols);
      const applied = applyPortfolioQuotes(holdings, result.quotes);
      applied.updates.forEach((holding) => upsertPortfolioHolding(holding));

      const details = [];
      if (result.errors.length) details.push(`${result.errors.length} lookup failed`);
      if (applied.currencyMismatches.length) {
        details.push(`${applied.currencyMismatches.length} currency mismatch kept unchanged`);
      }
      setQuoteStatus({
        phase: applied.updates.length ? 'ready' : 'degraded',
        message: `Updated ${applied.updates.length} of ${holdings.length} positions${details.length ? `. ${details.join('; ')}.` : '.'}`,
      });
    } catch (refreshError) {
      setQuoteStatus({
        phase: 'degraded',
        message: refreshError?.status === 401
          ? 'Private sync is locked. Unlock it in Settings before refreshing prices.'
          : 'Yahoo prices are unavailable. Saved manual or previous prices remain active.',
      });
    }
  }, [holdings, quoteRefreshAvailable, quoteStatus.phase, upsertPortfolioHolding]);

  useEffect(() => {
    if (!autoRefresh || !quoteRefreshAvailable) return undefined;
    const interval = window.setInterval(handleRefreshPrices, QUOTE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [autoRefresh, handleRefreshPrices, quoteRefreshAvailable]);

  const handleAutoRefreshChange = (event) => {
    const enabled = event.target.checked;
    setAutoRefresh(enabled);
    if (enabled) handleRefreshPrices();
  };

  return (
    <div className="page-stack">
      <header className="standard-page-header">
        <div>
          <div className="eyebrow">Private assets</div>
          <h1>Portfolio</h1>
          <p>Holdings split by account currency, with manual prices and optional Yahoo quote refresh.</p>
        </div>
      </header>

      <section className="card" aria-labelledby="portfolio-price-refresh-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="card-title" id="portfolio-price-refresh-title">Market price refresh</div>
            <p className="section-note">
              Best-effort Yahoo quotes may be delayed or unavailable. Only quote symbols are sent; quantities,
              costs, accounts, and portfolio values stay in your private app.
            </p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!quoteRefreshAvailable || holdings.length === 0 || quoteStatus.phase === 'refreshing'}
            onClick={handleRefreshPrices}
          >
            <RefreshCw size={16} className={quoteStatus.phase === 'refreshing' ? 'spin' : undefined} />
            {quoteStatus.phase === 'refreshing' ? 'Refreshing…' : 'Refresh prices'}
          </button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            disabled={!quoteRefreshAvailable}
            onChange={handleAutoRefreshChange}
          />
          Refresh every 15 minutes while this page is open
        </label>
        {!runtimeConfig.privateSyncEnabled && (
          <p className="section-note" role="status" style={{ marginTop: 10 }}>
            Price refresh requires the private-sync server; manual prices remain available in browser-only mode.
          </p>
        )}
        {runtimeConfig.privateSyncEnabled && syncStatus.phase !== 'synced' && (
          <p className="section-note" role="status" style={{ marginTop: 10 }}>
            Unlock private sync in Settings to use server-side quote refresh.
          </p>
        )}
        {quoteStatus.message && (
          <p className={quoteStatus.phase === 'degraded' ? 'form-error' : 'section-note'} role="status" style={{ marginTop: 10 }}>
            {quoteStatus.message}
          </p>
        )}
      </section>

      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Portfolio currency">
        {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => {
          const count = insightRows.filter((holding) => holding.reportingCurrency === currency).length;
          return <button key={currency} className={`btn${activeCurrency === currency ? ' btn-primary' : ''}`} type="button" onClick={() => setActiveCurrency(currency)}>{currency} ({count})</button>;
        })}
      </div>

      <div className="kpi-grid" aria-label={`${activeCurrency} portfolio summary`}>
        <div className="kpi blue"><div className="lbl">Positions</div><div className="val">{summary.rows.length}</div></div>
        <div className="kpi green"><div className="lbl">Market value</div><div className="val">{formatCurrency(summary.totalMarketValue, activeCurrency)}</div></div>
        <div className="kpi amber"><div className="lbl">Cost basis</div><div className="val">{formatCurrency(summary.totalCostBasis, activeCurrency)}</div></div>
        <div className={`kpi ${summary.gainLoss >= 0 ? 'green' : 'red'}`}>
          <div className="lbl">Unrealized P/L</div>
          <div className="val">{formatCurrency(summary.gainLoss, activeCurrency)}</div>
        </div>
      </div>

      <div className="grid2">
        <section className="card" aria-labelledby="portfolio-investment-chart-title">
          <div className="card-title" id="portfolio-investment-chart-title">Most invested · cost basis</div>
          {topInvestment && <p className="section-note" style={{ marginBottom: 12 }}>Largest investment: <strong>{topInvestment.ticker}</strong> · {formatCurrency(topInvestment.costBasis, activeCurrency)}</p>}
          <ChartWrapper type="bar" data={investmentChartData} height={260} horizontal showLegend={false} currency={activeCurrency} />
        </section>
        <section className="card" aria-labelledby="portfolio-account-totals-title">
          <div className="card-title" id="portfolio-account-totals-title">Broker account totals</div>
          {summary.accountTotals.length ? summary.accountTotals.map((account) => (
            <div key={account.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div><strong>{account.broker}</strong><div className="section-note">{account.account}</div></div>
              <div style={{ textAlign: 'right' }}><strong>{formatCurrency(account.marketValue, activeCurrency)}</strong><div className="section-note">Cost {formatCurrency(account.costBasis, activeCurrency)}</div></div>
            </div>
          )) : <p className="section-note">No {activeCurrency} portfolio positions yet.</p>}
        </section>
      </div>

      <form className="card" onSubmit={handleSave} noValidate>
        <div className="card-title">Add a manual holding</div>
        <div className="field-stack" style={{ marginBottom: 14 }}>
          <span>Find an instrument</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input"
              value={instrumentQuery}
              onChange={(event) => {
                setInstrumentQuery(event.target.value);
                setYahooInstruments([]);
                setInstrumentStatus({ phase: 'idle', message: '' });
              }}
              placeholder="Try TLV, Banca Transilvania, Apple, or an ETF"
              autoComplete="off"
              style={{ flex: '1 1 320px' }}
            />
            <button
              className="btn"
              type="button"
              onClick={handleYahooInstrumentSearch}
              disabled={instrumentStatus.phase === 'searching' || instrumentQuery.trim().length < 2}
            >
              {instrumentStatus.phase === 'searching' ? 'Searching…' : 'Search Yahoo'}
            </button>
          </div>
          <p className="section-note">Local BVB and common global instruments appear instantly. Yahoo search is optional and sends only this search phrase.</p>
          {localInstruments.length > 0 && (
            <div className="tbl-wrap" style={{ marginTop: 8 }}>
              <table><tbody>{localInstruments.map((instrument) => (
                <tr key={`${instrument.exchange}:${instrument.quoteSymbol}`}>
                  <td><strong>{instrument.ticker}</strong><div className="section-note">{instrument.name}</div></td>
                  <td className="section-note">{instrument.exchange} · {instrument.assetClass} · {instrument.currency}</td>
                  <td><button className="btn" type="button" onClick={() => selectInstrument(instrument)}>Use</button></td>
                </tr>
              ))}</tbody></table>
            </div>
          )}
          {yahooInstruments.length > 0 && (
            <div className="tbl-wrap" style={{ marginTop: 8 }}>
              <table><tbody>{yahooInstruments.map((instrument) => (
                <tr key={`yahoo:${instrument.quoteSymbol}`}>
                  <td><strong>{instrument.ticker}</strong><div className="section-note">{instrument.name}</div></td>
                  <td className="section-note">{instrument.exchange} · {instrument.assetClass} · {instrument.currency || 'currency unknown'}</td>
                  <td><button className="btn" type="button" onClick={() => selectInstrument(instrument)}>Use</button></td>
                </tr>
              ))}</tbody></table>
            </div>
          )}
          {instrumentStatus.message && <p className={instrumentStatus.phase === 'degraded' ? 'form-error' : 'section-note'} role="status">{instrumentStatus.message}</p>}
        </div>
        <div className="portfolio-form-grid">
          <label className="field-stack"><span>Broker</span><input className="input" value={draft.broker} onChange={updateDraft('broker')} autoComplete="off" /></label>
          <label className="field-stack"><span>Account</span><input className="input" value={draft.account} onChange={updateDraft('account')} autoComplete="off" /></label>
          <label className="field-stack"><span>Account currency</span><select className="input" value={draft.accountCurrency} onChange={updateDraft('accountCurrency')}>{SUPPORTED_DISPLAY_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label className="field-stack"><span>Ticker</span><input className="input" value={draft.ticker} onChange={updateDraft('ticker')} autoComplete="off" /></label>
          <label className="field-stack"><span>Yahoo symbol (optional)</span><input className="input" value={draft.quoteSymbol} onChange={updateDraft('quoteSymbol')} placeholder="e.g. TLV.RO" autoComplete="off" /></label>
          <label className="field-stack"><span>Name</span><input className="input" value={draft.name} onChange={updateDraft('name')} autoComplete="off" /></label>
          <label className="field-stack"><span>Asset class</span><input className="input" value={draft.assetClass} onChange={updateDraft('assetClass')} /></label>
          <label className="field-stack"><span>Quantity</span><input className="input" type="number" min="0" step="any" inputMode="decimal" value={draft.quantity} onChange={updateDraft('quantity')} /></label>
          <label className="field-stack"><span>Average cost</span><input className="input" type="number" min="0" step="any" inputMode="decimal" value={draft.avgCost} onChange={updateDraft('avgCost')} /></label>
          <label className="field-stack"><span>Currency</span><select className="input" value={draft.currency} onChange={updateDraft('currency')}>{SUPPORTED_DISPLAY_CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label className="field-stack"><span>Current price</span><input className="input" type="number" min="0" step="any" inputMode="decimal" value={draft.currentPrice} onChange={updateDraft('currentPrice')} /></label>
          <button className="btn btn-primary" type="submit"><Plus size={16} /> Add holding</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>

      <section className="card">
        <div className="card-title">Portfolio recovery</div>
        <p className="section-note">Portfolio positions are included in SSB JSON backups and private sync. Restore a backup instead of compiling private holdings into the application bundle.</p>
        <Link className="btn" to="/app/import">Restore a backup</Link>
      </section>

      <section className="card" aria-labelledby="portfolio-positions-title">
        <div className="card-title" id="portfolio-positions-title">Positions</div>
        {summary.rows.length === 0 ? (
          <p className="section-note">No positions yet. Add only synthetic data when preparing screenshots or public demos.</p>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th scope="col">Holding</th><th scope="col">Source</th><th scope="col">Asset class</th><th scope="col">Market value</th><th scope="col">P/L</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>{summary.rows.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <strong>{holding.ticker}</strong>
                    <div className="section-note">{holding.name}</div>
                    <label className="section-note">
                      Yahoo symbol
                      <input
                        className="input"
                        style={{ width: 110, minHeight: 32, marginLeft: 6, padding: '4px 7px' }}
                        value={quoteSymbolDrafts[holding.id] ?? holding.quoteSymbol ?? holding.ticker}
                        onChange={(event) => setQuoteSymbolDrafts((current) => ({
                          ...current,
                          [holding.id]: event.target.value,
                        }))}
                        onBlur={() => handleQuoteSymbolBlur(holding)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                        autoComplete="off"
                      />
                    </label>
                  </td>
                  <td>{holding.broker || 'Manual'}{holding.account ? <div className="section-note">{holding.account}</div> : null}</td>
                  <td>{holding.assetClass}</td>
                  <td>
                    {formatCurrency(holding.marketValue, activeCurrency)}
                    <div className="section-note">{holding.quantity} × {formatCurrency(holding.currentPrice, holding.currency)}</div>
                    <div className="section-note">
                      {holding.priceSource === 'yahoo' ? `Yahoo · ${holding.quoteSymbol || holding.ticker}` : 'Manual price'}
                      {holding.priceUpdatedAt ? ` · ${new Date(holding.priceUpdatedAt).toLocaleString()}` : ''}
                    </div>
                  </td>
                  <td>{formatCurrency(holding.gainLoss, activeCurrency)} <span className="section-note">({(holding.gainLossPct * 100).toFixed(1)}%)</span></td>
                  <td><button className="icon-button danger-button" type="button" aria-label={`Remove ${holding.ticker}`} onClick={() => handleRemove(holding)}><Trash2 size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
