import { useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { convertAmountToDisplay } from '../lib/fx';
import { getAccountBalanceSnapshot } from '../lib/selectors';
import { calculateCashFlowScenario } from '../lib/forecast';
import ChartWrapper from '../components/ChartWrapper';

const amount = (value, signed = false) => {
  if (!(signed ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/).test(value))
    throw new Error(
      'Enter all amounts with at most two decimals. Income and expenses cannot be negative.',
    );
  return Number(value);
};

export default function Forecast() {
  const { data } = useAppContext();
  const [income, setIncome] = useState('');
  const [expenses, setExpenses] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [balanceSource, setBalanceSource] = useState('manual');
  const [selectedIds, setSelectedIds] = useState([]);
  const [months, setMonths] = useState(12);
  const [zeroBasedChart, setZeroBasedChart] = useState(false);
  const [today] = useState(() => new Date());
  const currentMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  const displayCurrency = data.displayCurrency || 'RON';
  const money = (value) =>
    formatCurrency(
      convertAmountToDisplay(value, 'RON', displayCurrency, data.fxRates),
      displayCurrency,
    );
  const selected = data.accounts.filter((account) => selectedIds.includes(account.id));
  const records = selected.map((account) => ({
    account,
    month: Object.keys(account.balances || {})
      .filter((month) => month <= currentMonth)
      .sort()
      .at(-1),
  }));
  let scenario = null,
    error = '',
    snapshot = null;
  const incomplete =
    income === '' ||
    expenses === '' ||
    (balanceSource === 'manual' ? startingBalance === '' : selected.length === 0);
  try {
    if (balanceSource === 'accounts' && selected.length) {
      snapshot = getAccountBalanceSnapshot(selected, {
        month: currentMonth,
        displayCurrency: 'RON',
        fxRates: data.fxRates,
      });
      if (snapshot.missing)
        throw new Error(
          'A selected account has no balance on or before this month. Add its balance or deselect it.',
        );
      money(snapshot.total);
    }
    if (!incomplete) {
      scenario = calculateCashFlowScenario({
        startingBalance:
          balanceSource === 'manual' ? amount(startingBalance, true) : snapshot.total,
        monthlyIncome: amount(income),
        monthlyExpenses: amount(expenses),
        months,
      });
      money(scenario.endingBalance);
    }
  } catch (failure) {
    error = failure.message;
    scenario = null;
  }
  const labels = Array.from({ length: months + 1 }, (_, index) =>
    index === 0
      ? 'Starting balance'
      : new Date(today.getFullYear(), today.getMonth() + index, 1).toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
  );

  return (
    <div>
      <h2>Cash-flow scenario</h2>
      <p className="section-note">
        Plan with explicit income and expenses. No salary estimate is inferred from transaction
        history and no accounts are included automatically.
      </p>
      <div className="grid2" style={{ marginTop: 20 }}>
        <section className="card" aria-label="Monthly cash flow assumptions">
          <h3>Monthly estimates</h3>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Estimated monthly income (RON)
            <input
              className="input"
              inputMode="decimal"
              placeholder="Enter expected take-home income"
              value={income}
              onChange={(event) => setIncome(event.target.value)}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Estimated monthly expenses (RON)
            <input
              className="input"
              inputMode="decimal"
              placeholder="Enter your spending budget"
              value={expenses}
              onChange={(event) => setExpenses(event.target.value)}
            />
          </label>
          <button className="btn" onClick={() => setExpenses('5000')}>
            Use 5,000 RON expenses
          </button>
          <p className="section-note">
            Include income and spending for the same scope. Transfers between accounts included in
            this scenario are neither income nor expenses. No extra savings override or expense
            reduction is applied.
          </p>
        </section>
        <section className="card" aria-label="Scenario starting balance">
          <h3>Starting balance</h3>
          <label>
            Starting balance source
            <select
              className="input"
              value={balanceSource}
              onChange={(event) => setBalanceSource(event.target.value)}
            >
              <option value="manual">Enter manually</option>
              <option value="accounts">Use selected accounts</option>
            </select>
          </label>
          {balanceSource === 'manual' ? (
            <label style={{ display: 'block', marginTop: 16 }}>
              Starting balance (RON)
              <input
                className="input"
                inputMode="decimal"
                placeholder="Enter a balance, including zero"
                value={startingBalance}
                onChange={(event) => setStartingBalance(event.target.value)}
              />
            </label>
          ) : (
            <>
              <fieldset style={{ border: 0, padding: '12px 0', minWidth: 0 }}>
                <legend>Include only these accounts</legend>
                {data.accounts.map((account) => (
                  <label key={account.id} style={{ display: 'block', margin: '8px 0' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(account.id)}
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked
                            ? [...selectedIds, account.id]
                            : selectedIds.filter((id) => id !== account.id),
                        )
                      }
                    />{' '}
                    {account.name} ({account.currency || 'RON'})
                  </label>
                ))}
                {!data.accounts.length && (
                  <p>No accounts available. Enter a starting balance manually.</p>
                )}
              </fieldset>
              {records.map(({ account, month }) => (
                <p className="section-note" key={account.id}>
                  {account.name}:{' '}
                  {month ? 'using balance recorded ' + month : 'no eligible balance'}
                </p>
              ))}
              {snapshot && !error && (
                <p>
                  Selected starting balance: <strong>{money(snapshot.total)}</strong>
                </p>
              )}
              <p className="section-note">
                Latest recorded balances on or before {currentMonth}; older snapshots may be stale.
                Foreign currencies use saved FX rates. Unselected savings and investments are
                excluded.
              </p>
            </>
          )}
        </section>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, margin: '20px 0' }}>
        <label>
          Scenario period
          <select
            className="input"
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
          >
            {[3, 6, 12, 24].map((value) => (
              <option key={value} value={value}>
                {value} months
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn"
          onClick={() => {
            setIncome('');
            setExpenses('');
            setStartingBalance('');
            setSelectedIds([]);
            setBalanceSource('manual');
          }}
        >
          Clear scenario
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!scenario && !error && (
        <p role="status">
          Enter monthly income, monthly expenses and a starting balance to see your scenario. Enter
          0 explicitly when appropriate.
        </p>
      )}
      {scenario && (
        <>
          <div className="kpi-grid">
            {[
              ['Starting balance', scenario.balances[0]],
              ['Monthly surplus / shortfall', scenario.monthlyNet],
              ['Balance after ' + months + ' months', scenario.endingBalance],
              ['Total balance change', scenario.totalChange],
            ].map(([label, value]) => (
              <div className="kpi" key={label}>
                <div className="lbl">{label}</div>
                <div className="val">{money(value)}</div>
              </div>
            ))}
          </div>
          <section
            className="card"
            style={{ marginTop: 24, minWidth: 0 }}
            aria-label="Cash-flow projection"
          >
            <h3>{months}-month cash-flow scenario</h3>
            <p>Starting balance + months × (estimated income − estimated expenses).</p>
            <label>
              <input
                type="checkbox"
                checked={zeroBasedChart}
                onChange={(event) => setZeroBasedChart(event.target.checked)}
              />{' '}
              Include zero on balance axis
            </label>
            <ChartWrapper
              type="line"
              currency={displayCurrency}
              height={300}
              showLegend={false}
              data={{
                labels,
                datasets: [
                  {
                    label: 'Scenario balance',
                    data: scenario.balances.map((value) =>
                      convertAmountToDisplay(value, 'RON', displayCurrency, data.fxRates),
                    ),
                    borderColor: '#007AFF',
                    borderWidth: 3,
                    fill: false,
                    tension: 0,
                    pointRadius: 2,
                    pointHoverRadius: 6,
                  },
                ],
              }}
              options={{
                interaction: { mode: 'index', intersect: false },
                scales: {
                  x: { ticks: { maxTicksLimit: 7, font: { size: 12 } } },
                  y: {
                    beginAtZero: zeroBasedChart,
                    grace: '10%',
                    ticks: {
                      maxTicksLimit: 6,
                      font: { size: 12 },
                      callback: (value) => formatCurrency(Number(value), displayCurrency),
                    },
                  },
                },
              }}
            />
            <p className="section-note">
              {zeroBasedChart
                ? 'Zero included on balance axis.'
                : 'Focused balance scale: the vertical axis may not start at zero.'}{' '}
              One full month of net cash flow per step, starting next month. Income, expenses and FX
              are held constant; interest, inflation and market returns are not modelled.
            </p>
            {scenario.monthlyNet < 0 && (
              <p role="status">
                Expenses exceed income. This scenario uses the starting balance to cover the
                shortfall.
              </p>
            )}
            <details>
              <summary>Monthly projection amounts</summary>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Scenario balance ({displayCurrency})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.balances.map((value, index) => (
                      <tr key={index}>
                        <td>{labels[index]}</td>
                        <td>{money(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
      <p className="section-note" style={{ marginTop: 20 }}>
        Temporary what-if scenario only. Changing these inputs never updates account balances,
        transactions or saved budgets. Inputs reset when you leave or reload this page.
      </p>
    </div>
  );
}
