import { useMemo, useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { getDailySpend, getMonthlySummary, getUniqueMonths } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';

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
            backgroundColor: 'rgba(52, 199, 89, 0.82)',
            borderColor: '#FFFFFF',
            borderWidth: 2,
            borderRadius: 6,
            barPercentage: 0.7,
            categoryPercentage: 0.7,
          } : null,
          includeExpenses ? {
            label: 'Expenses',
            data: monthlySummary.map(d => d.exp),
            backgroundColor: 'rgba(255, 59, 48, 0.82)',
            borderColor: '#FFFFFF',
            borderWidth: 2,
            borderRadius: 6,
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
          backgroundColor: 'rgba(52, 199, 89, 0.85)',
          borderColor: '#FFFFFF',
          borderWidth: 2,
          borderRadius: 6,
          barPercentage: 0.65,
        } : null,
        includeExpenses ? {
          label: 'Expenses',
          data: (dailyData || []).map(d => d.exp),
          backgroundColor: 'rgba(255, 59, 48, 0.85)',
          borderColor: '#FFFFFF',
          borderWidth: 2,
          borderRadius: 6,
          barPercentage: 0.65,
        } : null,
      ].filter(Boolean),
    };
  }, [dailyData, effectiveSelectedMonth, monthlySummary, seriesFilter]);

  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Monthly Breakdown</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#128197;</div>
          <div className="empty-state-title">No data yet</div>
          <div className="empty-state-desc">Upload a CSV to view monthly breakdowns.</div>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '10px' }}>Last data update: {lastUpdated}</div>
      </div>
    );
  }

  const currentMonthStats = effectiveSelectedMonth === 'All' 
    ? null 
    : monthlySummary.find(m => m.month === effectiveSelectedMonth) || { inc: 0, exp: 0, net: 0 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Monthly Breakdown</h2>
        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Last updated: {lastUpdated}</div>
      </div>
      {currencySummary.hasMixedCurrencies && (
        <div style={{ marginBottom: '20px' }}>
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        </div>
      )}

      <div className="card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--muted)' }}>View:</label>
        <select 
          value={effectiveSelectedMonth} 
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ 
            padding: '8px 12px', 
            borderRadius: '6px', 
            border: '1px solid var(--border)', 
            background: 'var(--bg)', 
            color: 'var(--text)',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          {uniqueMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value="All">All Months (Trend)</option>
        </select>
        <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--muted)' }}>Series:</label>
        <select
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <option value="both">Income + Expenses</option>
          <option value="income">Income only</option>
          <option value="expenses">Expenses only</option>
        </select>
        
        {currentMonthStats && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '24px', fontSize: '14px' }}>
            <span>Income: <strong style={{ color: 'var(--green)' }}>{formatCurrency(currentMonthStats.inc, displayCurrency)}</strong></span>
            <span>Expenses: <strong style={{ color: 'var(--red)' }}>{formatCurrency(currentMonthStats.exp, displayCurrency)}</strong></span>
            <span>Net: <strong style={{ color: currentMonthStats.net >= 0 ? 'var(--accent)' : 'var(--red)' }}>{formatCurrency(currentMonthStats.net, displayCurrency)}</strong></span>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">{effectiveSelectedMonth === 'All' ? 'Monthly Trend' : `Daily Breakdown: ${effectiveSelectedMonth}`}</div>
        <ChartWrapper
          type="bar"
          data={chartData}
          height={300}
          currency={displayCurrency}
        />
      </div>

      <div className="card">
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
