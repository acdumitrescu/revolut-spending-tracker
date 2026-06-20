import {
  Activity,
  ArrowDown,
  ArrowUp,
  CircleDollarSign,
  HandCoins,
  Shield,
  WalletCards,
  ChartNoAxesCombined,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { BASE_CURRENCY, convertAmountToDisplay } from '../lib/fx';
import { detectRecurringTransactions } from '../lib/recurring';
import {
  filterTransactionsByPeriod,
  getCategoryTotals,
  getLatestAccountTotal,
  getMonthlySummary,
  getRolling12MonthSummary,
  getUniqueYears,
  getVendorTotals,
} from '../lib/selectors';
import { getVendorVisual } from '../lib/displayAssets';
import { formatCurrency, formatPercentage, getColorForCategory } from '../lib/utils';
import ChartWrapper from '../components/ChartWrapper';
import { EmptyState } from '../components/ui';

const TIME_OPTIONS = ['ALL TIME', 'Today', 'Last Week', 'Last Month', 'Last Year'];

function formatMonthWithYearLabel(monthKey) {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1)
    .toLocaleString('en-US', { month: 'short', year: '2-digit' })
    .replace(' ', " '");
}

export default function Overview() {
  const { data } = useAppContext();
  const txns = data.transactions;
  const displayCurrency = data.displayCurrency;
  const selectorOptions = { displayCurrency, fxRates: data.fxRates };
  const [timeFilter, setTimeFilter] = useState('ALL TIME');
  const [yearFilter, setYearFilter] = useState('ALL');

  const uniqueYears = useMemo(() => getUniqueYears(txns), [txns]);
  const filteredTxns = useMemo(
    () => filterTransactionsByPeriod(txns, timeFilter, yearFilter),
    [txns, timeFilter, yearFilter]
  );

  if (txns.length === 0) {
    return (
      <EmptyState
        icon={ChartNoAxesCombined}
        title="Build your first financial overview"
        description="Import a Revolut CSV or use synthetic demo data. Processing happens locally and you remain in control of backups."
      />
    );
  }

  const rolling12MonthSummary = getRolling12MonthSummary(txns, new Date(), selectorOptions);
  const monthlySummary = getMonthlySummary(filteredTxns, selectorOptions);
  const recurring = detectRecurringTransactions(filteredTxns).slice(0, 4);
  const latestSavings = getLatestAccountTotal(data.accounts, selectorOptions);
  const latestSavingsBase = getLatestAccountTotal(data.accounts, { displayCurrency: BASE_CURRENCY, fxRates: data.fxRates });
  const income = monthlySummary.reduce((sum, month) => sum + month.inc, 0);
  const expenses = monthlySummary.reduce((sum, month) => sum + month.exp, 0);
  const net = income - expenses;
  const monthsShown = monthlySummary.length;
  const avgMonthlySpend = monthsShown ? expenses / monthsShown : 0;
  const savingsRate = income > 0 ? ((net / income) * 100).toFixed(1) : '0.0';

  let momChangePercent = null;
  if (monthlySummary.length >= 2) {
    const lastMonthExp = monthlySummary.at(-1).exp;
    const prevMonthExp = monthlySummary.at(-2).exp;
    momChangePercent = prevMonthExp > 0 ? ((lastMonthExp - prevMonthExp) / prevMonthExp) * 100 : 0;
  }

  const monthlyChartData = {
    labels: rolling12MonthSummary.map((d) =>
      new Date(`${d.month}-01`).toLocaleString('en-US', { month: 'short' })
    ),
    datasets: [
      {
        label: 'Income',
        data: rolling12MonthSummary.map((d) => d.inc),
        backgroundColor: 'rgba(39, 174, 96, 0.88)',
        borderColor: 'rgba(39, 174, 96, 1)',
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 14,
        categoryPercentage: 0.56,
        barPercentage: 0.78,
      },
      {
        label: 'Expenses',
        data: rolling12MonthSummary.map((d) => d.exp),
        backgroundColor: 'rgba(236, 93, 78, 0.86)',
        borderColor: 'rgba(236, 93, 78, 1)',
        borderRadius: 10,
        borderSkipped: false,
        maxBarThickness: 14,
        categoryPercentage: 0.56,
        barPercentage: 0.78,
      },
    ],
  };

  const cumulativeData = monthlySummary.reduce((acc, d) => {
    const previous = acc.length > 0 ? acc[acc.length - 1].cumulative : 0;
    acc.push({ month: d.month, cumulative: previous + d.net });
    return acc;
  }, []);

  const cumulativeChartData = {
    labels: cumulativeData.map((d) => formatMonthWithYearLabel(d.month)),
    datasets: [
      {
        label: 'Cumulative Savings',
        data: cumulativeData.map((d) => d.cumulative),
        borderColor: '#2db36d',
        backgroundColor: 'rgba(45, 179, 109, 0.12)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.28,
        pointRadius: 1.8,
        pointHoverRadius: 4,
        pointBackgroundColor: '#2db36d',
        pointBorderWidth: 0,
      },
    ],
  };

  const categoryEntries = Object.entries(getCategoryTotals(filteredTxns, null, selectorOptions))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const categoryTotal = categoryEntries.reduce((sum, [, value]) => sum + value, 0);
  const categoryChartData = {
    labels: categoryEntries.map(([cat]) => cat),
    datasets: [
      {
        data: categoryEntries.map(([, value]) => value),
        backgroundColor: categoryEntries.map(([cat]) => getColorForCategory(cat)),
        borderWidth: 0,
        hoverOffset: 5,
      },
    ],
  };

  const vendorEntries = Object.entries(getVendorTotals(filteredTxns, null, selectorOptions))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6);
  const highestVendorSpend = vendorEntries[0]?.[1].total || 1;

  return (
    <div className="page-stack">
      <div className="page-header overview-header">
        <div>
          <h2 className="page-title overview-title">Overview</h2>
          <div className="page-subtitle">Your financial picture at a glance</div>
        </div>

        <div className="page-actions overview-filters">
          <label className="inline-control">
            <span>View</span>
            <select className="input select-inline" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === 'ALL TIME' ? 'All Time' : option}</option>
              ))}
            </select>
          </label>
          <label className="inline-control">
            <span>Year</span>
            <select className="input select-inline" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
              <option value="ALL">All Years</option>
              {uniqueYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="overview-kpis">
        <KpiCard
          icon={<ArrowUp size={16} />}
          label="Total Income"
          value={formatCurrency(income, displayCurrency)}
          tone="green"
          note={momChangePercent !== null ? `${momChangePercent < 0 ? '↓' : '↑'} ${Math.abs(momChangePercent).toFixed(1)}% vs previous period` : 'Credits in current view'}
        />
        <KpiCard
          icon={<ArrowDown size={16} />}
          label="Total Expenses"
          value={formatCurrency(expenses, displayCurrency)}
          tone="red"
          note="Refund-adjusted real spend"
        />
        <KpiCard
          icon={<WalletCards size={16} />}
          label="Net Balance"
          value={formatCurrency(net, displayCurrency)}
          tone={net >= 0 ? 'blue' : 'red'}
          note={net >= 0 ? 'Positive current spread' : 'Spending above income'}
        />
        <KpiCard
          icon={<Activity size={16} />}
          label="Avg Monthly Spend"
          value={formatCurrency(avgMonthlySpend, displayCurrency)}
          tone="amber"
          note={monthsShown ? `${monthsShown} visible ${monthsShown === 1 ? 'month' : 'months'}` : 'No visible months'}
        />
        <KpiCard
          icon={<CircleDollarSign size={16} />}
          label="Savings Rate"
          value={`${savingsRate}%`}
          tone="green"
          note="Share of income left after spend"
        />
        <KpiCard
          icon={<HandCoins size={16} />}
          label="Tracked Savings"
          value={formatCurrency(latestSavings, displayCurrency)}
          tone="blue"
          note="Latest account balances entered"
        />
      </div>

      <div className="overview-chart-grid">
        <section className="card overview-chart-card">
          <div className="overview-card-head">
            <div>
              <h3 className="overview-section-title">Income vs Expenses</h3>
            </div>
            <div className="chart-mini-filter">Last 12 months</div>
          </div>
          <ChartWrapper
            type="bar"
            data={monthlyChartData}
            height={280}
            currency={displayCurrency}
            options={{
              plugins: { legend: { labels: { usePointStyle: true, pointStyle: 'circle' } } },
              scales: {
                x: {
                  ticks: {
                    maxRotation: 0,
                    minRotation: 0,
                    callback: (_, index) => (index % 2 === 0 ? monthlyChartData.labels[index] : ''),
                  },
                },
                y: { ticks: { maxTicksLimit: 6 } },
              },
            }}
          />
        </section>

        <section className="card overview-chart-card">
          <div className="overview-card-head">
            <div>
              <h3 className="overview-section-title">Cumulative Savings</h3>
            </div>
            <div className="chart-mini-filter">
              {timeFilter === 'ALL TIME' && yearFilter === 'ALL' ? 'All Time' : 'Filtered'}
            </div>
          </div>
          <ChartWrapper
            type="line"
            data={cumulativeChartData}
            height={280}
            currency={displayCurrency}
            options={{
              plugins: { legend: { labels: { usePointStyle: true, pointStyle: 'circle' } } },
              scales: {
                x: {
                  ticks: {
                    maxRotation: 0,
                    minRotation: 0,
                    callback: (_, index) => (index % 2 === 0 ? cumulativeChartData.labels[index] : ''),
                  },
                },
                y: { ticks: { maxTicksLimit: 6 } },
              },
            }}
          />
        </section>
      </div>

      <div className="overview-insight-grid">
        <section className="card overview-split-card">
          <h3 className="overview-section-title">Top Expense Categories</h3>
          {categoryEntries.length === 0 ? (
            <div className="section-note">No expense categories are visible in the selected range yet.</div>
          ) : (
            <div className="category-card-layout">
              <div className="category-chart-wrap">
                <ChartWrapper type="doughnut" data={categoryChartData} height={220} showLegend={false} currency={displayCurrency} />
              </div>
              <div className="category-legend">
                {categoryEntries.map(([category, value]) => (
                  <div key={category} className="category-legend-row">
                    <div className="category-legend-main">
                      <span className="category-dot" style={{ backgroundColor: getColorForCategory(category) }} />
                      <span>{category}</span>
                    </div>
                    <div className="category-legend-meta">
                      <strong>{formatCurrency(value, displayCurrency)}</strong>
                      <span>{formatPercentage(value, categoryTotal)}</span>
                    </div>
                  </div>
                ))}
                <div className="category-total-row">
                  <span>Total</span>
                  <strong>{formatCurrency(categoryTotal, displayCurrency)}</strong>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <div className="overview-card-head">
            <h3 className="overview-section-title">Top Vendors</h3>
          </div>
          {vendorEntries.length === 0 ? (
            <div className="section-note">No vendor spend is visible in the selected range yet.</div>
          ) : (
            <div className="vendor-rank-list">
              {vendorEntries.map(([vendor, details]) => (
                <div key={vendor} className="vendor-rank-item">
                  <div className="vendor-rank-row">
                    <span className="vendor-name">{vendor}</span>
                    <span className="vendor-amount">{formatCurrency(details.total, displayCurrency)}</span>
                  </div>
                  <div className="vendor-bar-track">
                    <div
                      className="vendor-bar-fill"
                      style={{
                        width: `${Math.max((details.total / highestVendorSpend) * 100, 10)}%`,
                        backgroundColor: getColorForCategory(details.cat),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="overview-card-head">
            <h3 className="overview-section-title">Savings Goals Snapshot</h3>
            <Link className="overview-linkish" to="/app/planning/goals">View all goals</Link>
          </div>
          {data.goals.length === 0 ? (
            <div className="section-note">Create a goal on the Goals page to track progress against your account balances.</div>
          ) : (
            <div className="goal-preview-list">
              {data.goals.slice(0, 2).map((goal) => {
                const convertedGoalTarget = convertAmountToDisplay(goal.targetAmount, BASE_CURRENCY, displayCurrency, data.fxRates);
                const pct = goal.targetAmount > 0 ? Math.min((latestSavingsBase / goal.targetAmount) * 100, 100) : 0;
                return (
                  <div key={goal.id} className="goal-preview-card">
                    <div className="goal-preview-icon">
                      <Shield size={16} />
                    </div>
                    <div className="goal-preview-body">
                      <div className="goal-preview-top">
                        <div>
                          <strong>{goal.name}</strong>
                          <span>Target {formatCurrency(convertedGoalTarget, displayCurrency)}</span>
                        </div>
                        <strong>{Math.round(pct)}%</strong>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="goal-preview-foot">
                        {formatCurrency(latestSavings, displayCurrency)} / {formatCurrency(convertedGoalTarget, displayCurrency)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="card upcoming-bills-card">
        <div className="overview-card-head">
          <h3 className="overview-section-title">Upcoming Bills</h3>
          <Link className="overview-linkish" to="/app/activity/recurring">View all bills</Link>
        </div>
        {recurring.length === 0 ? (
          <div className="section-note">No recurring charges are stable enough yet. Once three similar charges line up, they will appear here.</div>
        ) : (
          <div className="bill-strip">
            {recurring.map((bill) => {
              const amount = convertAmountToDisplay(
                bill.amount,
                bill.currency === 'N/A' ? BASE_CURRENCY : bill.currency,
                displayCurrency,
                data.fxRates
              );
              const vendorVisual = getVendorVisual(bill.label);
              return (
                <div key={`${bill.vendor}-${bill.amount}`} className="bill-card">
                  <div className={vendorVisual.className}>{vendorVisual.text}</div>
                  <div className="bill-card-main">
                    <strong>{bill.label}</strong>
                    <span>{bill.nextExpectedDate}</span>
                  </div>
                  <div className="bill-card-side">
                    <strong>{formatCurrency(amount, displayCurrency)}</strong>
                    <span>Every ~{bill.avgInterval} days</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function KpiCard({ icon, label, value, note, tone }) {
  const lastSpace = value.lastIndexOf(' ');
  const hasCurrencyUnit = lastSpace > 0 && /^[A-Z]{3}$/.test(value.slice(lastSpace + 1));
  const number = hasCurrencyUnit ? value.slice(0, lastSpace) : value;
  const unit = hasCurrencyUnit ? value.slice(lastSpace + 1) : null;

  return (
    <div className={`overview-kpi-card ${tone}`}>
      <div className="overview-kpi-top">
        <div className="overview-kpi-icon">{icon}</div>
        <span>{label}</span>
      </div>
      <div className="overview-kpi-value" aria-label={value}>
        <span className="overview-kpi-number">{number}</span>
        {unit && <span className="overview-kpi-unit" aria-hidden="true">{unit}</span>}
      </div>
      <div className="overview-kpi-note">{note}</div>
    </div>
  );
}
