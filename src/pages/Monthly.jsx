import { useMemo, useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { getDailySpend, getLatestMonth, getMonthlySummary, getUniqueMonths } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';

export default function Monthly() {
  const { data } = useAppContext();
  const txns = data.transactions;
  
  const lastUpdated = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never';

  const uniqueMonths = useMemo(() => getUniqueMonths(txns), [txns]);
  const mostRecentMonth = txns.length > 0 ? getLatestMonth(txns) : null;
  
  const [selectedMonth, setSelectedMonth] = useState(null);
  const effectiveSelectedMonth = selectedMonth === 'All'
    ? 'All'
    : selectedMonth && uniqueMonths.includes(selectedMonth)
      ? selectedMonth
      : (mostRecentMonth || 'All');

  const monthlySummary = useMemo(() => {
    return getMonthlySummary(txns);
  }, [txns]);

  const dailyData = useMemo(() => {
    if (effectiveSelectedMonth === 'All') return null;
    return getDailySpend(txns, effectiveSelectedMonth).map((day) => ({
      day: day.day,
      inc: day.income,
      exp: day.spendNet,
    }));
  }, [txns, effectiveSelectedMonth]);

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

  const chartData = effectiveSelectedMonth === 'All' ? {
    labels: monthlySummary.map(d => d.month),
    datasets: [
      { label: 'Income', data: monthlySummary.map(d => d.inc), borderColor: '#34C759', backgroundColor: 'rgba(52, 199, 89, 0.15)', borderWidth: 3, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#34C759', pointBorderColor: '#FFFFFF', pointBorderWidth: 2 },
      { label: 'Expenses', data: monthlySummary.map(d => d.exp), borderColor: '#FF3B30', backgroundColor: 'rgba(255, 59, 48, 0.15)', borderWidth: 3, fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#FF3B30', pointBorderColor: '#FFFFFF', pointBorderWidth: 2 },
      { label: 'Net', data: monthlySummary.map(d => d.net), borderColor: '#007AFF', borderWidth: 3, tension: 0.4, pointRadius: 4, pointHoverRadius: 6, borderDash: [6, 6], pointBackgroundColor: '#007AFF', pointBorderColor: '#FFFFFF', pointBorderWidth: 2 }
    ]
  } : {
    labels: dailyData.map(d => d.day.toString()),
    datasets: [
      { 
        label: 'Income', 
        data: dailyData.map(d => d.inc), 
        backgroundColor: 'rgba(52, 199, 89, 0.85)',
        borderColor: '#FFFFFF',
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.65,
      },
      { 
        label: 'Expenses', 
        data: dailyData.map(d => d.exp), 
        backgroundColor: 'rgba(255, 59, 48, 0.85)',
        borderColor: '#FFFFFF',
        borderWidth: 2,
        borderRadius: 6,
        barPercentage: 0.65,
      }
    ]
  };

  const currentMonthStats = effectiveSelectedMonth === 'All' 
    ? null 
    : monthlySummary.find(m => m.month === effectiveSelectedMonth) || { inc: 0, exp: 0, net: 0 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Monthly Breakdown</h2>
        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Last updated: {lastUpdated}</div>
      </div>

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
        
        {currentMonthStats && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '24px', fontSize: '14px' }}>
            <span>Income: <strong style={{ color: 'var(--green)' }}>{formatCurrency(currentMonthStats.inc)}</strong></span>
            <span>Expenses: <strong style={{ color: 'var(--red)' }}>{formatCurrency(currentMonthStats.exp)}</strong></span>
            <span>Net: <strong style={{ color: currentMonthStats.net >= 0 ? 'var(--accent)' : 'var(--red)' }}>{formatCurrency(currentMonthStats.net)}</strong></span>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">{effectiveSelectedMonth === 'All' ? 'Monthly Trend' : `Daily Breakdown: ${effectiveSelectedMonth}`}</div>
        <ChartWrapper
          type={effectiveSelectedMonth === 'All' ? 'line' : 'bar'}
          data={chartData}
          height={300}
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
                  <td style={{textAlign:'right', color:'var(--green)'}}>{formatCurrency(row.inc)}</td>
                  <td style={{textAlign:'right', color:'var(--red)'}}>{formatCurrency(row.exp)}</td>
                  <td style={{textAlign:'right', fontWeight:600, color: row.net >= 0 ? 'var(--accent)' : 'var(--red)'}}>{formatCurrency(row.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
