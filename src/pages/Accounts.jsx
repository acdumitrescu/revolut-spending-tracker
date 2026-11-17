import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { BASE_CURRENCY, SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
import {
  getAccountBalanceSnapshot,
  getAccountEntryMonths,
  getAccountTotalsByMonth,
  getLatestAccountTotal,
  getLatestAccountTotalsByCurrency,
  getMonthlySummary,
} from '../lib/selectors';
import ChartWrapper from '../components/ChartWrapper';
import AccountBalanceCard from '../components/AccountBalanceCard';
import '../components/AccountBalanceCard.css';

export default function Accounts() {
  const {
    data,
    addAccount,
    updateAccountCurrency,
    updateAccountBalance,
    setAccountGroup,
    setAccountReconciled,
    undoAccountBalance,
    updateAccountNote,
    removeAccount,
  } = useAppContext();
  const [newAccName, setNewAccName] = useState('');
  const [newAccCurrency, setNewAccCurrency] = useState(BASE_CURRENCY);
  const displayCurrency = data.displayCurrency;
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const todayDate = `${currentMonth}-${String(today.getDate()).padStart(2, '0')}`;

  const handleAdd = () => {
    if (newAccName.trim()) {
      addAccount(newAccName.trim(), newAccCurrency);
      setNewAccName('');
      setNewAccCurrency(BASE_CURRENCY);
    }
  };

  const txns = data.transactions;
  const monthlySummary = useMemo(
    () => getMonthlySummary(txns, { displayCurrency, fxRates: data.fxRates }),
    [txns, displayCurrency, data.fxRates],
  );
  const balanceSeries = useMemo(
    () => getAccountTotalsByMonth(data.accounts, { displayCurrency, fxRates: data.fxRates }),
    [data.accounts, displayCurrency, data.fxRates],
  );
  const latestBalance = getLatestAccountTotal(data.accounts, {
    displayCurrency,
    fxRates: data.fxRates,
  });
  const balanceSnapshot = getAccountBalanceSnapshot(data.accounts, {
    displayCurrency,
    fxRates: data.fxRates,
  });
  const currencyTotals = useMemo(
    () => getLatestAccountTotalsByCurrency(data.accounts),
    [data.accounts],
  );
  const entryMonths = useMemo(() => getAccountEntryMonths(data.accounts), [data.accounts]);

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
      },
    ],
  };

  const expensesChartData = {
    labels: monthlySummary.map((point) => point.month),
    datasets: [
      {
        label: 'Monthly Expenses',
        data: monthlySummary.map((point) => point.exp),
        backgroundColor: 'rgba(255, 99, 71, 0.82)',
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="page-stack accounts-page">
      <h2>Accounts & Savings Tracking</h2>

      <div className="kpi-grid">
        <div className="kpi blue">
          <div className="lbl">Latest Tracked Balance</div>
          <div className="val">
            {formatCurrency(latestBalance, displayCurrency, { decimals: 2 })}
          </div>
          {balanceSnapshot.month && (
            <p className="section-note">
              As of {balanceSnapshot.month}: {balanceSnapshot.updated} of {data.accounts.length}{' '}
              accounts updated. {balanceSnapshot.carried} carried forward ·{' '}
              {balanceSnapshot.missing} not entered.
            </p>
          )}
        </div>
        <div className="kpi green">
          <div className="lbl">Accounts by Currency</div>
          <div className="val">
            {data.accounts.length} account{data.accounts.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: '10px' }}>
            {currencyTotals.map((item) => (
              <span key={item.currency} style={{ color: 'var(--muted)', fontSize: '12px' }}>
                <strong style={{ color: 'var(--text)' }}>
                  {formatCurrency(item.total, item.currency, { decimals: 2 })}
                </strong>{' '}
                · {item.accounts} account{item.accounts === 1 ? '' : 's'}
              </span>
            ))}
            {currencyTotals.length === 0 && (
              <span style={{ color: 'var(--muted)', fontSize: '12px' }}>
                No accounts tracked yet.
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-title">Tracked Account Balances</div>
          {balanceSeries.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
              Enter at least one monthly balance to chart savings progress.
            </div>
          ) : (
            <ChartWrapper
              type="line"
              data={balanceChartData}
              height={300}
              currency={displayCurrency}
            />
          )}
          <p className="section-note">
            Totals use the last known balance on or before each month. Missing updates carry
            forward; accounts with no recorded balance are excluded. Converted values use the
            configured FX rates.
          </p>
        </div>

        <div className="card">
          <div className="card-title">Imported Expenses Trend</div>
          {monthlySummary.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
              Upload transactions to chart monthly expenses.
            </div>
          ) : (
            <>
              <ChartWrapper
                type="bar"
                data={expensesChartData}
                height={300}
                showLegend={false}
                currency={displayCurrency}
              />
              <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>
                Shows imported expenses only. Income and other positive cashflow are excluded.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="card accounts-manage-card">
        <div className="account-list-heading">
          <div>
            <h2>Your accounts</h2>
            <p>
              Balances at a glance. Open any accounts below to compare and update them side by side.
            </p>
          </div>
        </div>
        <form
          className="account-form-row"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <input
            type="text"
            className="input"
            aria-label="New account name"
            placeholder="New account name"
            value={newAccName}
            onChange={(e) => setNewAccName(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            className="input"
            aria-label="New account currency"
            value={newAccCurrency}
            onChange={(e) => setNewAccCurrency(e.target.value)}
            style={{ width: '100px' }}
          >
            {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit" disabled={!newAccName.trim()}>
            <Plus size={16} /> Add account
          </button>
        </form>

        <div className="account-list">
          {data.accounts.length === 0 && (
            <p className="section-note">
              No accounts yet. Add your first account above, then enter a balance.
            </p>
          )}
          {data.accounts.map((account) => (
            <AccountBalanceCard
              key={account.id}
              account={account}
              months={entryMonths}
              displayCurrency={displayCurrency}
              fxRates={data.fxRates}
              asOfMonth={balanceSnapshot.month}
              currentMonth={currentMonth}
              onGroup={setAccountGroup}
              onUndo={undoAccountBalance}
              onBalance={updateAccountBalance}
              onNote={updateAccountNote}
              onCurrency={updateAccountCurrency}
              onDelete={removeAccount}
              today={todayDate}
              onReconciled={setAccountReconciled}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
