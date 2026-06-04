import { useAppContext } from '../lib/AppContext';
import { formatCurrency, getColorForCategory } from '../lib/utils';
import { detectRecurringTransactions } from '../lib/recurring';
import { getCategoryTotals, getLatestAccountTotal, getMonthlySummary, getVendorTotals } from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';

export default function Overview() {
  const { data } = useAppContext();
  const txns = data.transactions;
  const recurring = detectRecurringTransactions(txns).slice(0, 3);
  const latestSavings = getLatestAccountTotal(data.accounts);

  if (txns.length === 0) return (
    <div className="empty-state">
      <div className="empty-state-icon">&#128202;</div>
      <div className="empty-state-title">No data yet</div>
      <div className="empty-state-desc">Import a Revolut CSV to build your dashboard. Data stays in your browser, and you can restore/export JSON backups anytime from the sidebar.</div>
    </div>
  );

  const monthlySummary = getMonthlySummary(txns);
  const inc = monthlySummary.reduce((sum, month) => sum + month.inc, 0);
  const exp = monthlySummary.reduce((sum, month) => sum + month.exp, 0);
  const net = inc - exp;
  const uniqueMonths = monthlySummary.map((month) => month.month);
  const avg = uniqueMonths.length ? exp / uniqueMonths.length : 0;

  // New Insights
  const savingsRate = inc > 0 ? ((net / inc) * 100).toFixed(1) : 0;
  
  let momChange = 0;
  let momChangePercent = 0;
  if (uniqueMonths.length >= 2) {
    const lastMonthExp = monthlySummary[monthlySummary.length - 1].exp;
    const prevMonthExp = monthlySummary[monthlySummary.length - 2].exp;
    momChange = lastMonthExp - prevMonthExp;
    momChangePercent = prevMonthExp > 0 ? ((momChange / prevMonthExp) * 100).toFixed(1) : 0;
  }

  // Monthly Chart
  const monthlyData = monthlySummary;

  const chartData = {
    labels: monthlyData.map(d => d.month),
    datasets: [
      { 
        label: 'Income', 
        data: monthlyData.map(d => d.inc), 
        backgroundColor: 'rgba(52, 199, 89, 0.8)', // Bold iOS Green
        borderColor: '#FFFFFF',
        borderWidth: 2,
        borderRadius: 6,
      },
      { 
        label: 'Expenses', 
        data: monthlyData.map(d => d.exp), 
        backgroundColor: 'rgba(255, 59, 48, 0.8)', // Bold iOS Red
        borderColor: '#FFFFFF',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  };

  // Cumulative Net Balance Chart
  const cumulativeData = monthlyData.reduce((acc, d) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    const cumulative = prev + (d.inc - d.exp);
    acc.push({ month: d.month, cumulative });
    return acc;
  }, []);

  const cumulativeChartData = {
    labels: cumulativeData.map(d => d.month),
    datasets: [
      {
        label: 'Cumulative Savings',
        data: cumulativeData.map(d => d.cumulative),
        borderColor: '#007AFF',
        backgroundColor: 'rgba(0, 122, 255, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#007AFF',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2,
      }
    ]
  };

  // Pie Chart
  const catTotals = getCategoryTotals(txns);
  const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const pieData = {
    labels: sortedCats.map(c => c[0]),
    datasets: [{
      data: sortedCats.map(c => c[1]),
      backgroundColor: sortedCats.map(c => getColorForCategory(c[0])),
      borderWidth: 2,
      borderColor: '#FFFFFF',
      hoverOffset: 8,
    }]
  };

  // Top Vendors Chart
  const vendors = getVendorTotals(txns);
  const sortedVendors = Object.entries(vendors).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  const vendorChartData = {
    labels: sortedVendors.map(v => v[0]),
    datasets: [{
      label: 'Spend',
      data: sortedVendors.map(v => v[1].total),
      backgroundColor: sortedVendors.map(v => getColorForCategory(v[1].cat)),
      borderColor: '#FFFFFF',
      borderWidth: 2,
      borderRadius: 6,
      barPercentage: 0.7,
    }]
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Overview</h2>
      <div className="kpi-grid">
        <div className="kpi green"><div className="lbl">Total Income</div><div className="val">{formatCurrency(inc)}</div></div>
        <div className="kpi red"><div className="lbl">Total Expenses</div><div className="val">{formatCurrency(exp)}</div></div>
        <div className={`kpi ${net >= 0 ? 'blue' : 'red'}`}><div className="lbl">Net Balance</div><div className="val">{formatCurrency(net)}</div></div>
        <div className="kpi amber"><div className="lbl">Avg Monthly Spend</div><div className="val">{formatCurrency(avg)}</div></div>
        <div className="kpi blue"><div className="lbl">Savings Rate</div><div className="val">{savingsRate}%</div></div>
        <div className="kpi blue"><div className="lbl">Tracked Savings</div><div className="val">{formatCurrency(latestSavings)}</div></div>
        <div className={`kpi ${momChange <= 0 ? 'green' : 'red'}`}>
          <div className="lbl">MoM Expense Change</div>
          <div className="val">
            {uniqueMonths.length >= 2 ? `${momChange > 0 ? '+' : ''}${momChangePercent}%` : 'N/A'}
          </div>
        </div>
      </div>
      
      <div className="grid2">
        <div className="card">
          <div className="card-title">Monthly Income vs Expenses</div>
          <ChartWrapper type="bar" data={chartData} height={250} />
        </div>
        <div className="card">
          <div className="card-title">Cumulative Savings Trajectory</div>
          <ChartWrapper type="line" data={cumulativeChartData} height={250} />
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Top Expense Categories</div>
          <ChartWrapper type="doughnut" data={pieData} height={280} />
        </div>
        <div className="card">
          <div className="card-title">Top 10 Vendors</div>
          <ChartWrapper type="bar" data={vendorChartData} height={280} horizontal showLegend={false} />
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Savings Goals Snapshot</div>
          {data.goals.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Create a goal from the Goals page to track progress using your entered account balances.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.goals.slice(0, 3).map((goal) => {
                const pct = Math.min((latestSavings / goal.targetAmount) * 100, 100);
                return (
                  <div key={goal.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong>{goal.name}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{formatCurrency(latestSavings)} / {formatCurrency(goal.targetAmount)}</span>
                    </div>
                    <div style={{ height: '8px', background: 'var(--surface3)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title">Upcoming Bills</div>
          {recurring.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>No reliable recurring transactions detected yet. Once you have 3 similar charges with a steady interval, they will appear here.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {recurring.map((bill) => (
                <div key={`${bill.vendor}-${bill.amount}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{bill.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Every ~{bill.avgInterval} days</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{formatCurrency(bill.amount)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{bill.nextExpectedDate}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
