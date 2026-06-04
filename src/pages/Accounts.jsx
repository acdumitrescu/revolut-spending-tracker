import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { getAccountTotalsByMonth, getLatestAccountTotal, getMonthlySummary } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';

export default function Accounts() {
  const { data, addAccount, updateAccountBalance, updateAccountContribution, removeAccount } = useAppContext();
  const [newAccName, setNewAccName] = useState('');

  const handleAdd = () => {
    if (newAccName.trim()) {
      addAccount(newAccName.trim());
      setNewAccName('');
    }
  };

  const txns = data.transactions;
  const monthlySummary = useMemo(() => getMonthlySummary(txns), [txns]);
  const balanceSeries = useMemo(() => getAccountTotalsByMonth(data.accounts), [data.accounts]);
  const latestBalance = getLatestAccountTotal(data.accounts);

  const balanceChartData = {
    labels: balanceSeries.map((point) => point.month),
    datasets: [
      {
        label: 'Tracked Account Balances',
        data: balanceSeries.map((point) => point.total),
        borderColor: '#007AFF',
        backgroundColor: 'rgba(0, 122, 255, 0.18)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#007AFF',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
      }
    ]
  };

  const cashflowChartData = {
    labels: monthlySummary.map((point) => point.month),
    datasets: [
      {
        label: 'Monthly Net Cashflow',
        data: monthlySummary.map((point) => point.net),
        backgroundColor: monthlySummary.map((point) => point.net >= 0 ? 'rgba(52, 199, 89, 0.8)' : 'rgba(255, 59, 48, 0.8)'),
        borderRadius: 6,
      }
    ]
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Accounts & Savings Tracking</h2>

      <div className="kpi-grid">
        <div className="kpi blue">
          <div className="lbl">Latest Tracked Balance</div>
          <div className="val">{formatCurrency(latestBalance)}</div>
        </div>
        <div className="kpi green">
          <div className="lbl">Monthly Contributions</div>
          <div className="val">{formatCurrency(data.accounts.reduce((sum, account) => sum + (account.monthlyContribution || 0), 0))}</div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Tracked Account Balances</div>
          {balanceSeries.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Enter at least one monthly balance to chart savings progress. This chart only shows values you explicitly entered.</div>
          ) : (
            <ChartWrapper type="line" data={balanceChartData} height={300} />
          )}
        </div>

        <div className="card">
          <div className="card-title">Revolut Cashflow Trend</div>
          {monthlySummary.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Upload transactions to compare your monthly cashflow separately from tracked balances.</div>
          ) : (
            <>
              <ChartWrapper type="bar" data={cashflowChartData} height={300} showLegend={false} />
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>
                Cashflow is shown separately from account balances so the app does not imply a net worth number without opening balances.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Manage Accounts</div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="text"
            className="input"
            placeholder="E.g., ING Savings, Emergency Fund"
            value={newAccName}
            onChange={e => setNewAccName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={handleAdd}><Plus size={16} /> Add</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.accounts.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '12px' }}>No tracked accounts yet.</div>}
          {data.accounts.map((acc) => {
            const monthKeys = [...new Set([...monthlySummary.map((item) => item.month), ...Object.keys(acc.balances)])].sort();
            const visibleMonths = monthKeys.slice(-6);
            return (
              <div key={acc.id} style={{ background: 'var(--surface2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{acc.name}</div>
                  <button className="btn" onClick={() => removeAccount(acc.id)} style={{ padding: '4px 8px', color: 'var(--red)', borderColor: 'transparent' }}><Trash2 size={14} /></button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Monthly Contribution</div>
                    <input
                      type="number"
                      className="input"
                      placeholder="0"
                      value={acc.monthlyContribution || ''}
                      onChange={(e) => updateAccountContribution(acc.id, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {visibleMonths.map((month) => (
                    <div key={month} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{month}</span>
                      <input
                        type="number"
                        className="input"
                        placeholder="0"
                        value={acc.balances[month] || ''}
                        onChange={(e) => updateAccountBalance(acc.id, month, e.target.value)}
                        style={{ width: '100px', padding: '4px 8px', fontSize: '11px' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
