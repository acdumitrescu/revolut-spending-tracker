import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { getDailySpend, getMonthlySummary, getUniqueMonths } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { EmptyState } from '../components/ui';

export default function Monthly() {
  const { data, currencySummary } = useAppContext();
  const txns = data.transactions;
  const displayCurrency = data.displayCurrency;
  
  const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never';

  const uniqueMonths = useMemo(() => getUniqueMonths(txns), [txns]);
  
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [seriesFilter, setSeriesFilter] = useState('both');
  const effectiveSelectedMonth = selectedMonth === 'All'
    ? 'All'
    : selectedMonth && uniqueMonths.includes(selectedMonth)
      ? selectedMonth
      : 'All';

  const monthlySummary = useMemo(() => {
    return getMonthlySummary(txns, { displayCurrency, fxRates: data.fxRates });
  }, [txns, displayCurrency, data.fxRates]);

  const dailyData = useMemo(() => {
    if (effectiveSelectedMonth === 'All') return null;
    return getDailySpend(txns, effectiveSelectedMonth, { displayCurrency, fxRates: data.fxRates }).map((day) => ({
      day: day.day,
      inc: day.income,
      exp: day.spendNet,
    }));
  }, [txns, effectiveSelectedMonth, displayCurrency, data.fxRates]);

  const chartData = useMemo(() => {
    const includeIncome = seriesFilter === 'both' || seriesFilter === 'income';
    const includeExpenses = seriesFilter === 'both' || seriesFilter === 'expenses';

    if (effectiveSelectedMonth === 'All') {
      return {
        labels: monthlySummary.map(d => d.month),
        datasets: [
          includeIncome ? {
            label: 'Income',
            data: monthlySummary.map(d => d.inc),
            backgroundColor: 'rgba(31, 157, 90, 0.82)',
            borderColor: 'rgba(31, 157, 90, 0.95)',
            borderWidth: 1,
            borderRadius: 10,
            barPercentage: 0.7,
            categoryPercentage: 0.7,
          } : null,
          includeExpenses ? {
            label: 'Expenses',
            data: monthlySummary.map(d => d.exp),
            backgroundColor: 'rgba(209, 79, 69, 0.82)',
            borderColor: 'rgba(209, 79, 69, 0.95)',
            borderWidth: 1,
            borderRadius: 10,
            barPercentage: 0.7,
            categoryPercentage: 0.7,
          } : null,
        ].filter(Boolean),
      };
    }

    return {
      labels: (dailyData || []).map(d => d.day.toString()),
      datasets: [
        includeIncome ? {
          label: 'Income',
          data: (dailyData || []).map(d => d.inc),
          backgroundColor: 'rgba(31, 157, 90, 0.85)',
          borderColor: 'rgba(31, 157, 90, 0.95)',
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.65,
        } : null,
        includeExpenses ? {
          label: 'Expenses',
          data: (dailyData || []).map(d => d.exp),
          backgroundColor: 'rgba(209, 79, 69, 0.85)',
          borderColor: 'rgba(209, 79, 69, 0.95)',
          borderWidth: 1,
          borderRadius: 10,
          barPercentage: 0.65,
        } : null,
      ].filter(Boolean),
    };
  }, [dailyData, effectiveSelectedMonth, monthlySummary, seriesFilter]);

  if (txns.length === 0) {
    return (
      <div className="page-stack">
        <div>
          <h2 className="page-title" style={{ marginBottom: '10px' }}>Monthly Breakdown</h2>
          <div className="page-subtitle">Use this page to compare months and then zoom into a single month’s daily movement.</div>
        </div>
        <EmptyState icon={CalendarDays} title="No monthly activity yet" description="Import transactions to compare months and inspect daily movement." />
        <div className="section-note">Last data update: {lastUpdated}</div>
      </div>
    );
  }

  const currentMonthStats = effectiveSelectedMonth === 'All' 
    ? null 
    : monthlySummary.find(m => m.month === effectiveSelectedMonth) || { inc: 0, exp: 0, net: 0 };

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Monthly Breakdown</h2>
          <div className="page-subtitle">Switch between the full monthly trend and a single month’s daily spending pattern.</div>
        </div>
        <div className="topbar-meta">Last updated: {lastUpdated}</div>
      </div>
      {currencySummary.hasMixedCurrencies && (
        <div style={{ marginBottom: '20px' }}>
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        </div>
      )}

      <div className="card" style={{ marginBottom: '0' }}>
        <div className="filter-row">
        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>View</label>
        <select 
          className="input select-inline"
          value={effectiveSelectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value)}
        >
          {uniqueMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value="All">All Months (Trend)</option>
        </select>
        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>Series</label>
        <select
          className="input select-inline"
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
        >
          <option value="both">Income + Expenses</option>
          <option value="income">Income only</option>
          <option value="expenses">Expenses only</option>
        </select>
        
        {currentMonthStats && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '18px', fontSize: '13px', flexWrap: 'wrap' }}>
            <span className="tag-pill">Income <strong style={{ color: 'var(--success)' }}>{formatCurrency(currentMonthStats.inc, displayCurrency)}</strong></span>
            <span className="tag-pill">Expenses <strong style={{ color: 'var(--danger)' }}>{formatCurrency(currentMonthStats.exp, displayCurrency)}</strong></span>
            <span className="tag-pill">Net <strong style={{ color: currentMonthStats.net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{formatCurrency(currentMonthStats.net, displayCurrency)}</strong></span>
          </div>
        )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '0' }}>
        <div className="card-title">{effectiveSelectedMonth === 'All' ? 'Monthly Trend' : `Daily Breakdown: ${effectiveSelectedMonth}`}</div>
        <div className="section-note" style={{ marginBottom: '16px' }}>
          {effectiveSelectedMonth === 'All'
            ? 'Compare income and expenses across months to see structural changes in your finances.'
            : 'Use the daily view to identify spikes, clustered bills, or quiet spending periods inside one month.'}
        </div>
        <ChartWrapper
          type="bar"
          data={chartData}
          height={300}
          currency={displayCurrency}
        />
      </div>

      <div className="card" style={{ marginBottom: '0' }}>
        <div className="card-title">Monthly Summary Table</div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Month</th><th style={{textAlign:'right'}}>Income</th><th style={{textAlign:'right'}}>Expenses</th><th style={{textAlign:'right'}}>Net</th></tr>
            </thead>
            <tbody>
              {monthlySummary.map(row => (
                <tr key={row.month} style={{ background: row.month === effectiveSelectedMonth ? 'var(--blue-glow)' : 'transparent' }}>
                  <td>{row.month}</td>
                  <td style={{textAlign:'right', color:'var(--green)'}}>{formatCurrency(row.inc, displayCurrency)}</td>
                  <td style={{textAlign:'right', color:'var(--red)'}}>{formatCurrency(row.exp, displayCurrency)}</td>
                  <td style={{textAlign:'right', fontWeight:600, color: row.net >= 0 ? 'var(--accent)' : 'var(--red)'}}>{formatCurrency(row.net, displayCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
