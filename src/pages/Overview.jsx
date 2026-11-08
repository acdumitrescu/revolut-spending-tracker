import {
  Activity,
  ArrowDown,
  CircleDollarSign,
  Clock3,
  Database,
  HandCoins,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ChartWrapper from '../components/ChartWrapper';
import NetWorthBreakdown from '../components/NetWorthBreakdown';
import { computeGoals, STATUS_LABELS } from '../lib/goals';
import { useAppContext } from '../lib/AppContext';
import { getVendorVisual } from '../lib/displayAssets';
import { BASE_CURRENCY, convertAmountToDisplay } from '../lib/fx';
import { detectRecurringTransactions } from '../lib/recurring';
import { getAccountGroups, getOverviewPosition, getRevolutTransactions } from '../lib/overviewPosition';
import {
  filterTransactionsByPeriod,
  getCategoryTotals,
  getMonthlySummary,
  getUniqueYears,
  getVendorTotals,
} from '../lib/selectors';
import { formatCurrency, formatPercentage, getColorForCategory } from '../lib/utils';

const TIME_OPTIONS = ['ALL TIME', 'Today', 'Last Week', 'Last Month', 'Last Year'];

function formatMonthWithYearLabel(monthKey) {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1)
    .toLocaleString('en-US', { month: 'short', year: '2-digit' })
    .replace(' ', " '");
}

function getPercentChange(current, previous) {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatFreshness(timestamp) {
  if (!timestamp) return { label: 'No import yet', detail: 'Add local data to begin' };
  const ageMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (ageMinutes < 1) return { label: 'Up to date', detail: 'Updated just now' };
  if (ageMinutes < 60) return { label: 'Up to date', detail: `Updated ${ageMinutes}m ago` };
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return { label: 'Up to date', detail: `Updated ${ageHours}h ago` };
  const ageDays = Math.floor(ageHours / 24);
  return { label: ageDays > 7 ? 'Review data' : 'Recently updated', detail: `Updated ${ageDays}d ago` };
}

function splitCurrencyValue(value) {
  const match = String(value).match(/^(.*?)[\s\u00A0]([A-Z]{3})$/);
  return {
    number: match ? match[1] : value,
    unit: match ? match[2] : null,
  };
}

export default function Overview() {
  const { data } = useAppContext();
  const includePortfolio = false;
  const [includeNormalized, setIncludeNormalized] = useState(false);
  const [now] = useState(() => new Date());
  const goalResults = useMemo(() => computeGoals(data.goals, data.accounts, { fxRates: data.fxRates, now }).slice(0, 3), [data.goals, data.accounts, data.fxRates, now]);
  const txns = useMemo(() => getRevolutTransactions(data.transactions, includeNormalized), [data.transactions, includeNormalized]);
  const displayCurrency = data.displayCurrency;
  const selectorOptions = { displayCurrency, fxRates: data.fxRates };
  const [timeFilter, setTimeFilter] = useState('ALL TIME');
  const [yearFilter, setYearFilter] = useState('ALL');

  const uniqueYears = useMemo(() => getUniqueYears(txns), [txns]);
  const filteredTxns = useMemo(
    () => filterTransactionsByPeriod(txns, timeFilter, yearFilter),
    [txns, timeFilter, yearFilter]
  );
  const handleTimeFilterChange = (value) => {
    setTimeFilter(value);
    if (value !== 'ALL TIME') setYearFilter('ALL');
  };
  const handleYearFilterChange = (value) => {
    setYearFilter(value);
    if (value !== 'ALL') setTimeFilter('ALL TIME');
  };

  const monthlySummary = getMonthlySummary(filteredTxns, selectorOptions);
  const recurring = detectRecurringTransactions(filteredTxns).slice(0, 4);
  const position = getOverviewPosition(data, includePortfolio);
  const groups = getAccountGroups(data);
  const latestSavings = position.snapshot.total;
  const expenses = monthlySummary.reduce((sum, month) => sum + month.exp, 0);
  const monthsShown = monthlySummary.length;
  const avgMonthlySpend = monthsShown ? expenses / monthsShown : 0;
  const latestMonth = monthlySummary.at(-1);
  const previousMonth = monthlySummary.at(-2);
  const expenseChange = getPercentChange(latestMonth?.exp, previousMonth?.exp);
  const freshness = formatFreshness(data.importMeta?.latestSummary?.importedAt || data.lastUpdated);

  const spendingChartData = {
    labels: monthlySummary.map((month) => formatMonthWithYearLabel(month.month)),
    datasets: [
      {
        label: 'Revolut spending',
        data: monthlySummary.map((month) => month.exp),
        borderColor: '#ff746a',
        backgroundColor: 'rgba(255, 116, 106, 0.14)',
        borderWidth: 2.2,
        fill: true,
        tension: 0.38,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointBackgroundColor: '#ff746a',
      },
    ],
  };

  const categoryEntries = Object.entries(getCategoryTotals(filteredTxns, null, selectorOptions))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const categoryTotal = categoryEntries.reduce((sum, [, value]) => sum + value, 0);
  const categoryChartData = {
    labels: categoryEntries.map(([category]) => category),
    datasets: [{
      data: categoryEntries.map(([, value]) => value),
      backgroundColor: categoryEntries.map(([category]) => getColorForCategory(category)),
      borderColor: 'transparent',
      borderWidth: 0,
      hoverOffset: 5,
    }],
  };

  const vendorEntries = Object.entries(getVendorTotals(filteredTxns, null, selectorOptions))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);
  const highestVendorSpend = vendorEntries[0]?.[1].total || 1;
  const sparkValues = monthlySummary.slice(-10).map((month) => month.exp);
  const selectedRangeLabel = yearFilter !== 'ALL'
    ? yearFilter
    : timeFilter === 'ALL TIME' ? 'All time' : timeFilter;

  return (
    <div className="page-stack overview-command-center">
      <header className="overview-command-header">
        <div>
          <h1>Overview</h1>
          <p>Your balances, tracked net worth, and Revolut spending.</p>
        </div>
        <div className="overview-filters" aria-label="Overview filters">
          <label className="overview-filter-control">
            <span>Period</span>
            <select value={timeFilter} onChange={(event) => handleTimeFilterChange(event.target.value)}>
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>{option === 'ALL TIME' ? 'All time' : option}</option>
              ))}
            </select>
          </label>
          <label className="overview-filter-control">
            <span>Year</span>
            <select value={yearFilter} onChange={(event) => handleYearFilterChange(event.target.value)}>
              <option value="ALL">All years</option>
              {uniqueYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
        </div>
      </header>

      <p className="section-note">Period and year filter Revolut spending only. Balances and net worth use your latest recorded values; transfers into Revolut are not income.</p>
      <details className="dashboard-panel" style={{padding: 16, marginBottom: 16}}>
        <summary>Net worth and spending coverage</summary>
        <p className="section-note">XTB and TradeVille are counted from Accounts. Portfolio holdings are not added again.</p>
        <label style={{display: 'block', marginTop: 12}}><input type="checkbox" checked={includeNormalized} onChange={event => setIncludeNormalized(event.target.checked)} /> Include normalized / unlabelled imports as Revolut spending</label>
        <p className="section-note">Net worth = signed account balances{includePortfolio ? ' + portfolio market value' : ''} − vendor credit. Negative account balances already deduct card debt. Planned financing and card-purchase schedules are not deducted again. Only tracked assets and debts are included.</p>
        {!includeNormalized && <p className="section-note">Normalized / unlabelled imports are excluded until their source is confirmed.</p>}
        {(position.snapshot.missing > 0 || position.missingCreditBalances > 0) && <p className="section-note">Incomplete coverage: {position.snapshot.missing} account balances and {position.missingCreditBalances} linked card balances are missing.</p>}
      </details>
      <NetWorthBreakdown data={data} />
      <section className="kpi-grid" aria-label="Account balance groups" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 16}}>
        {[
          ['shares', 'Shares & ETFs', 'USD', 'Accounts assigned to Investments (including brokerage cash)'],
          ['cash', 'Total cash', displayCurrency, 'Accounts assigned to Cash'],
          ['bank', 'Total bank', displayCurrency, 'Accounts assigned to Bank'],
          ['credits', 'Total credits', displayCurrency, 'Signed credit-account balances; already included in net worth'],
        ].map(([key, label, currency, note]) => <div className="kpi" key={key}>
          <h2 className="lbl">{label}</h2><div className="val">{formatCurrency(groups[key].total, currency)}</div>
          <p className="section-note">{note}</p>
          <p className="section-note">{[...new Set(groups[key].accounts)].join(' · ') || 'No matching accounts'}{groups[key].missing > 0 ? ` · ${groups[key].missing} missing balances` : ''}</p>
        </div>)}
      </section>
      <p className="section-note">Shares & ETFs are shown in USD using your configured exchange rates. Other groups use {displayCurrency}. Balances as of {groups.month || 'not recorded'}; earlier entries carry forward.</p>
      {groups.other.accounts.length > 0 && <p className="section-note">Other assets / crypto ({groups.other.accounts.join(', ')}): {formatCurrency(groups.other.total, displayCurrency)} — included in the total and net worth, outside the four groups.{groups.other.missing > 0 ? ` ${groups.other.missing} missing balances.` : ''}</p>}
      <div className="overview-primary-grid">
        <section className="dashboard-panel overview-hero-panel" aria-labelledby="net-balance-heading">
          <div className="overview-balance-summary">
            <div>
              <div className="dashboard-label" id="net-balance-heading">
                Total account balance <span className="metric-info" title="Latest recorded balances across all accounts, including negative balances">i</span>
              </div>
              <CurrencyValue value={formatCurrency(latestSavings, displayCurrency)} className="hero-balance-value" />
              <p className="section-note">{position.snapshot.month ? `Balances as of ${position.snapshot.month}` : 'No account balances recorded yet'}</p>
              <p className="section-note">{position.snapshot.updated} updated · {position.snapshot.carried} carried forward · {position.snapshot.missing} missing</p>
            </div>

            <div className="balance-breakdown"><Link to="/app/accounts/balances">Review account balances</Link><Link to="/app/accounts/income">Income & allocation</Link></div>
          </div>

          <div className="overview-cashflow">
            <div className="dashboard-panel-heading">
              <div>
                <h2>Revolut spending</h2>
                <div className="chart-key" aria-label="Spending legend">
                  <span><i className="expense" />Spending after refunds</span>
                </div>
              </div>
              <span className="dashboard-chip">Selected period: {selectedRangeLabel}</span>
            </div>
            {!filteredTxns.length && <p className="section-note">No Revolut spending recorded in this range.</p>}
            <ChartWrapper
              type="line"
              data={spendingChartData}
              height={250}
              currency={displayCurrency}
              showLegend={false}
              options={{
                interaction: { intersect: false, mode: 'index' },
                layout: { padding: { top: 18, right: 4, bottom: 0, left: 0 } },
                scales: {
                  x: { ticks: { maxTicksLimit: 7 }, grid: { display: false } },
                  y: { ticks: { maxTicksLimit: 5 }, grid: { drawTicks: false } },
                },
              }}
            />
          </div>
        </section>

        <div className="overview-metric-stack">
          <section className="dashboard-panel compact-metric-panel rate-panel" aria-labelledby="net-worth-heading">
            <div className="dashboard-label" id="net-worth-heading"><CircleDollarSign size={17} />Tracked net worth</div>
            <CurrencyValue value={formatCurrency(position.netWorth, displayCurrency)} className="compact-metric-value" />
            <p>Account balances{includePortfolio ? ' + portfolio' : ''} − vendor debt</p>
            <p className="section-note">{formatCurrency(position.vendorDebt, displayCurrency)} vendor debt deducted</p>
          </section>
          <section className="dashboard-panel compact-metric-panel tracked-panel" aria-labelledby="revolut-spending-heading">
            <div className="dashboard-label" id="revolut-spending-heading"><HandCoins size={17} />Revolut spending</div>
            <CurrencyValue value={formatCurrency(expenses, displayCurrency)} className="compact-metric-value" />
            <p>{selectedRangeLabel} · after refunds, excluding transfers</p>
          </section>

          <section className="dashboard-panel spend-spark-panel" aria-labelledby="monthly-spend-heading">
            <div>
              <div className="dashboard-label purple" id="monthly-spend-heading"><Activity size={17} />Avg monthly Revolut spend</div>
              <CurrencyValue value={formatCurrency(avgMonthlySpend, displayCurrency)} className="spend-value" />
              <p>{monthsShown} visible {monthsShown === 1 ? 'month' : 'months'}</p>
            </div>
            <SparkBars values={sparkValues} />
          </section>
        </div>
      </div>

      <div className="overview-insight-bento">
        <section className="dashboard-panel vendor-panel" aria-labelledby="top-vendors-heading">
          <div className="dashboard-panel-heading">
            <h2 id="top-vendors-heading">Top vendors</h2>
            <Link to="/app/insights/vendors">View all</Link>
          </div>
          {vendorEntries.length === 0 ? (
            <p className="section-note">No vendor spend is visible in this range.</p>
          ) : (
            <div className="vendor-command-list">
              {vendorEntries.map(([vendor, details]) => {
                const vendorVisual = getVendorVisual(vendor);
                return (
                  <div key={vendor} className="vendor-command-row">
                    <div className={vendorVisual.className} aria-hidden="true">{vendorVisual.text}</div>
                    <div className="vendor-command-main">
                      <div><strong>{vendor}</strong><span>{formatCurrency(details.total, displayCurrency)}</span></div>
                      <div className="command-progress"><i style={{ width: `${Math.max((details.total / highestVendorSpend) * 100, 8)}%` }} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="dashboard-panel category-panel" aria-labelledby="spending-category-heading">
          <div className="dashboard-panel-heading">
            <h2 id="spending-category-heading">Spending by category</h2>
            <Link to="/app/insights/categories">View all</Link>
          </div>
          {categoryEntries.length === 0 ? (
            <p className="section-note">No expense categories are visible in this range.</p>
          ) : (
            <div className="category-command-layout">
              <div className="category-command-chart">
                <ChartWrapper type="doughnut" data={categoryChartData} height={205} showLegend={false} currency={displayCurrency} />
                <div className="category-chart-center" aria-hidden="true">
                  <strong>{formatCurrency(categoryTotal, displayCurrency)}</strong>
                </div>
              </div>
              <div className="category-command-legend">
                {categoryEntries.map(([category, value]) => (
                  <div key={category}>
                    <span><i style={{ backgroundColor: getColorForCategory(category) }} />{category}</span>
                    <strong>{formatPercentage(value, categoryTotal)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="dashboard-panel goals-panel" aria-labelledby="upcoming-goals-heading">
          <div className="dashboard-panel-heading">
            <h2 id="upcoming-goals-heading">Upcoming goals</h2>
            <Link to="/app/planning/goals">View all goals</Link>
          </div>
          {data.goals.length === 0 ? (
            <div className="goal-command-empty">
              <Shield size={22} />
              <strong>Build your next milestone</strong>
              <span>Create a savings goal to track it here.</span>
              <Link to="/app/planning/goals">Create a goal</Link>
            </div>
          ) : (
            <div className="goal-command-list">
              {goalResults.map((item, index) => (
                <div key={item.goal.id} className={`goal-command-row tone-${(index % 3) + 1}`}>
                  <span className="goal-command-icon"><Shield size={18} /></span>
                  <div className="goal-command-main">
                    <div className="goal-command-copy">
                      <span><strong>{item.goal.name}</strong><small>{item.goal.targetMonth || 'Open target'} · {STATUS_LABELS[item.status]}</small></span>
                      <span><strong>{formatCurrency(item.saved, item.currency)}</strong><small>of {formatCurrency(item.target, item.currency)}</small></span>
                    </div>
                    <div className="command-progress"><i style={{ width: `${item.progress * 100}%` }} /></div>
                    <small className="goal-percent">{Math.round(item.progress * 100)}%</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="dashboard-status-strip" aria-label="Financial overview status">
        <StatusItem
          icon={<ArrowDown size={20} />}
          value={expenseChange === null ? '—' : `${expenseChange >= 0 ? '↑' : '↓'} ${Math.abs(expenseChange).toFixed(1)}%`}
          label={expenseChange === null ? 'Comparison unavailable' : 'Expenses vs previous visible month'}
          tone="negative"
        />
        <StatusItem icon={<Clock3 size={20} />} value={monthsShown} label="Visible months" tone="info" />
        <StatusItem icon={<Database size={20} />} value={data.accounts.length} label="Accounts tracked" tone="purple" />
        <StatusItem icon={<RefreshCw size={20} />} value={freshness.label} label={freshness.detail} tone="positive" />
      </section>

      {recurring.length > 0 && (
        <section className="dashboard-panel compact-bills-panel" aria-labelledby="upcoming-bills-heading">
          <div className="dashboard-panel-heading">
            <div>
              <h2 id="upcoming-bills-heading">Upcoming bills</h2>
              <p>Recurring charges detected from your local history.</p>
            </div>
            <Link to="/app/activity/subscriptions">View subscriptions</Link>
          </div>
          <div className="command-bill-grid">
            {recurring.map((bill) => {
              const amount = convertAmountToDisplay(
                bill.amount,
                bill.currency === 'N/A' ? BASE_CURRENCY : bill.currency,
                displayCurrency,
                data.fxRates
              );
              const vendorVisual = getVendorVisual(bill.label);
              return (
                <div key={`${bill.vendor}-${bill.amount}`} className="command-bill">
                  <div className={vendorVisual.className} aria-hidden="true">{vendorVisual.text}</div>
                  <span><strong>{bill.label}</strong><small>{bill.nextExpectedDate}</small></span>
                  <strong>{formatCurrency(amount, displayCurrency)}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function CurrencyValue({ value, className }) {
  const { number, unit } = splitCurrencyValue(value);
  return (
    <div className={className} aria-label={value}>
      <strong>{number}</strong>
      {unit && <span aria-hidden="true">{unit}</span>}
    </div>
  );
}

function SparkBars({ values }) {
  const maximum = Math.max(...values, 1);
  return (
    <div className="spark-bars" role="img" aria-label="Recent monthly spending trend">
      {values.map((value, index) => (
        <i key={`${index}-${value}`} style={{ height: `${Math.max((value / maximum) * 100, 10)}%` }} />
      ))}
    </div>
  );
}

function StatusItem({ icon, value, label, tone }) {
  return (
    <div className={`dashboard-status-item ${tone}`}>
      <span className="dashboard-status-icon">{icon}</span>
      <span><strong>{value}</strong><small>{label}</small></span>
    </div>
  );
}
