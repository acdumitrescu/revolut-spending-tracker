import { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { BASE_CURRENCY, convertAmountToDisplay } from '../lib/fx';
import { getLatestAccountTotal, getMonthlySummary, getTotalAccountContributions } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { EmptyState } from '../components/ui';

export default function Forecast() {
  const { data, currencySummary } = useAppContext();
  const txns = data.transactions;
  const accounts = data.accounts;
  const displayCurrency = data.displayCurrency;

  // User-adjustable forecast inputs
  const [customMonthlySavings, setCustomMonthlySavings] = useState(null);
  const [expenseReduction, setExpenseReduction] = useState(0);
  const [emergencyMonths, setEmergencyMonths] = useState(6);

  const analysis = useMemo(() => {
    if (txns.length === 0 || accounts.length === 0) return null;

    const monthlyStats = getMonthlySummary(txns, { displayCurrency: BASE_CURRENCY, fxRates: data.fxRates });
    const mostRecentMonth = monthlyStats.at(-1)?.month;
    const currentTotalBalance = getLatestAccountTotal(accounts, { displayCurrency: BASE_CURRENCY, fxRates: data.fxRates });

    const avgMonthlyExp = monthlyStats.reduce((s, m) => s + m.exp, 0) / monthlyStats.length;
    const avgMonthlyNet = monthlyStats.reduce((s, m) => s + m.net, 0) / monthlyStats.length;

    const totalAccountContributions = getTotalAccountContributions(accounts, { displayCurrency: BASE_CURRENCY, fxRates: data.fxRates });
    const baselineMonthlySavings = totalAccountContributions > 0 ? totalAccountContributions : avgMonthlyNet;
    const effectiveMonthlySavings = customMonthlySavings !== null ? customMonthlySavings : baselineMonthlySavings;

    const projectedMonthlyExp = Math.max(0, avgMonthlyExp - expenseReduction);
    const projectedMonthlyNet = avgMonthlyNet + expenseReduction;

    const emergencyFundTarget = avgMonthlyExp * emergencyMonths;
    const monthsToEmergencyFund = effectiveMonthlySavings > 0 && emergencyFundTarget > currentTotalBalance
      ? Math.ceil((emergencyFundTarget - currentTotalBalance) / effectiveMonthlySavings) 
      : 0;

    const projectionLabels = [];
    const runningBalance = [];
    let projBalance = currentTotalBalance;
    const today = new Date();
    
    for (let i = 0; i <= 24; i++) {
      const futureDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      projectionLabels.push(i === 0 ? 'Current' : futureDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
      runningBalance.push(projBalance);
      projBalance += effectiveMonthlySavings;
    }

    return {
      mostRecentMonth,
      currentTotalBalance,
      baselineMonthlySavings,
      avgMonthlyExp,
      avgMonthlyNet,
      totalAccountContributions,
      effectiveMonthlySavings,
      projectedMonthlyExp,
      projectedMonthlyNet,
      emergencyFundTarget,
      monthsToEmergencyFund,
      projectionLabels,
      runningBalance
    };
  }, [txns, accounts, customMonthlySavings, expenseReduction, emergencyMonths, data.fxRates]);

  if (!analysis) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Forecast needs activity and a balance"
        description="Import transactions, then add at least one account balance to explore planning scenarios."
      />
    );
  }

  const chartData = {
    labels: analysis.projectionLabels,
    datasets: [
      {
        label: 'Projected Total Account Balance',
        data: analysis.runningBalance.map((value) => convertAmountToDisplay(value, BASE_CURRENCY, displayCurrency, data.fxRates)),
        borderColor: '#007AFF',
        backgroundColor: 'rgba(0, 122, 255, 0.2)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#007AFF',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
      }
    ]
  };

  const inputStyle = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    width: '100%',
    fontSize: '14px',
    marginTop: '4px'
  };

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--muted)',
    marginBottom: '4px',
    display: 'block'
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Expense & Account Forecast</h2>
      {currencySummary.hasMixedCurrencies && (
        <div style={{ marginBottom: '20px' }}>
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        </div>
      )}
      
      {/* Top Level KPIs */}
      <div className="kpi-grid">
        <div className="kpi blue">
          <div className="lbl">Current Total Balance</div>
          <div className="val">{formatCurrency(convertAmountToDisplay(analysis.currentTotalBalance, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</div>
        </div>
        <div className="kpi amber">
          <div className="lbl">Projected Monthly Expenses</div>
          <div className="val">{formatCurrency(convertAmountToDisplay(analysis.projectedMonthlyExp, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</div>
        </div>
        <div className="kpi green">
          <div className="lbl">Effective Monthly Savings</div>
          <div className="val">{formatCurrency(convertAmountToDisplay(analysis.effectiveMonthlySavings, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</div>
        </div>
        <div className="kpi blue">
          <div className="lbl">Emergency Fund Target ({emergencyMonths}mo)</div>
          <div className="val">{formatCurrency(convertAmountToDisplay(analysis.emergencyFundTarget, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: '24px' }}>
        {/* Tool 1: Running Balance Projection Chart */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">24-Month Running Balance Forecast</div>
          <div style={{ marginTop: '16px' }}>
            <ChartWrapper type="line" data={chartData} height={300} currency={displayCurrency} />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px', textAlign: 'center' }}>
            * Projection starts from your most recent account balances and adds your defined monthly savings.
          </p>
        </div>

        {/* Tool 2: Savings Override */}
        <div className="card">
          <div className="card-title">Monthly Savings Configuration</div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              Total from Accounts: <strong>{formatCurrency(convertAmountToDisplay(analysis.totalAccountContributions, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</strong>
            </label>
            <label style={labelStyle}>Baseline monthly savings: <strong>{formatCurrency(convertAmountToDisplay(analysis.baselineMonthlySavings, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</strong></label>
            <label style={labelStyle}>Override with Custom Monthly Savings Amount (stored in RON)</label>
            <input 
              type="number" 
              placeholder="Leave blank to use account totals"
              value={customMonthlySavings === null ? '' : customMonthlySavings} 
              onChange={(e) => setCustomMonthlySavings(e.target.value === '' ? null : Number(e.target.value))} 
              style={inputStyle} 
            />
          </div>
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--muted)' }}>Balance in 12 Months:</span>
              <strong style={{ color: 'var(--green)' }}>
                {formatCurrency(convertAmountToDisplay(analysis.currentTotalBalance + (analysis.effectiveMonthlySavings * 12), BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}
              </strong>
            </div>
          </div>
        </div>

        {/* Tool 3: Expense Reduction Impact */}
        <div className="card">
          <div className="card-title">Expense Reduction Impact</div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>If I reduce monthly expenses by (stored in RON)</label>
            <input 
              type="number" 
              value={expenseReduction} 
              onChange={(e) => setExpenseReduction(Number(e.target.value))} 
              style={inputStyle} 
            />
          </div>
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)' }}>New Projected Monthly Expenses:</span>
              <strong>{formatCurrency(convertAmountToDisplay(analysis.projectedMonthlyExp, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)' }}>New Projected Monthly Net:</span>
              <strong style={{ color: 'var(--green)' }}>{formatCurrency(convertAmountToDisplay(analysis.projectedMonthlyNet, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Extra Yearly Savings:</span>
              <strong style={{ color: 'var(--green)' }}>+{formatCurrency(convertAmountToDisplay(expenseReduction * 12, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</strong>
            </div>
          </div>
        </div>

        {/* Tool 4: Emergency Fund Calculator */}
        <div className="card">
          <div className="card-title">Emergency Fund Timeline</div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Months of expenses to cover</label>
            <select 
              value={emergencyMonths} 
              onChange={(e) => setEmergencyMonths(Number(e.target.value))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={9}>9 Months</option>
              <option value={12}>12 Months</option>
            </select>
          </div>
          <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)' }}>Avg. Monthly Expenses:</span>
              <strong>{formatCurrency(convertAmountToDisplay(analysis.avgMonthlyExp, BASE_CURRENCY, displayCurrency, data.fxRates), displayCurrency)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>Time to Reach Target:</span>
              <strong>{analysis.monthsToEmergencyFund === 0 ? 'Already covered' : `${analysis.monthsToEmergencyFund} months`}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
