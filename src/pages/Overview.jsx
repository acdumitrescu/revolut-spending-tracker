import { useMemo, useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { runtimeConfig } from '../lib/runtimeConfig';
import { EmptyState } from '../components/ui';
import ComingUpCard from '../components/dashboard/ComingUpCard';
import CumulativeSpendCard from '../components/dashboard/CumulativeSpendCard';
import LeftInBudgetCard from '../components/dashboard/LeftInBudgetCard';
import NeedsAttentionCard from '../components/dashboard/NeedsAttentionCard';
import NetWorthCard from '../components/dashboard/NetWorthCard';
import SpentCard from '../components/dashboard/SpentCard';
import TopCategoriesCard from '../components/dashboard/TopCategoriesCard';
import '../components/dashboard/Dashboard.css';
import {
  DASHBOARD_PERIOD_KINDS,
  DASHBOARD_ROUTES,
  resolveDashboardPeriod,
  selectComingUp,
  selectCumulativeSpend,
  selectLeftInBudget,
  selectNeedsAttention,
  selectNetWorth,
  selectSpent,
  selectTopCategories,
} from '../lib/dashboard';
import { getEffectiveCurrency } from '../lib/fx';

const PERIOD_LABELS = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3-months': 'Last 3 months',
  'year-to-date': 'Year to date',
  custom: 'Custom range',
};

// The dashboard (Plan 1, 1.2). All numbers come from src/lib/dashboard.js; this page only picks
// the period and lays the cards out. The chosen period lives in component state, for the session.
export default function Overview() {
  const { data } = useAppContext();
  const [now] = useState(() => new Date());
  const [choice, setChoice] = useState({ kind: 'this-month', from: '', to: '' });
  const currency = getEffectiveCurrency(data.displayCurrency);

  const period = useMemo(
    () => resolveDashboardPeriod({ kind: choice.kind, now, from: choice.from, to: choice.to }),
    [choice, now],
  );
  const netWorth = useMemo(() => selectNetWorth(data, period), [data, period]);
  const spent = useMemo(() => selectSpent(data, period), [data, period]);
  const left = useMemo(() => selectLeftInBudget(data, period), [data, period]);
  const series = useMemo(() => selectCumulativeSpend(data, period), [data, period]);
  const top = useMemo(() => selectTopCategories(data, period), [data, period]);
  const coming = useMemo(() => selectComingUp(data, now), [data, now]);
  // The workspace stores no backup time and AppContext does not expose one, so the backup-age
  // item is not shown (selectNeedsAttention omits it without `lastBackupAt`).
  const attention = useMemo(() => selectNeedsAttention(data, now), [data, now]);

  const isEmpty = (data.transactions?.length || 0) === 0 && (data.accounts?.length || 0) === 0;
  if (isEmpty) {
    return (
      <div className="page-stack dash-page">
        <header className="dash-header">
          <h1>Overview</h1>
        </header>
        <EmptyState
          title="Nothing to show yet"
          description="Import a Revolut CSV or add an account balance to see your net worth, spending and budget here."
          actionLabel="Import transactions"
          actionTo={DASHBOARD_ROUTES.importAndBackup}
          {...(runtimeConfig.privateSyncEnabled
            ? {}
            : {
                secondaryActionLabel: 'Receive from Mac',
                secondaryActionTo: `${DASHBOARD_ROUTES.importAndBackup}#receive-from-mac`,
              })}
        />
      </div>
    );
  }

  const selectKind = (kind) =>
    setChoice((current) =>
      kind === 'custom'
        ? { kind, from: current.from || period.start, to: current.to || period.end }
        : { ...current, kind },
    );

  return (
    <div className="page-stack dash-page">
      <header className="dash-header">
        <div>
          <h1>Overview</h1>
          <p className="dash-range">
            {period.start} to {period.end}
          </p>
        </div>
        <div className="dash-period">
          <label>
            Period
            <select value={choice.kind} onChange={(event) => selectKind(event.target.value)}>
              {DASHBOARD_PERIOD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PERIOD_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          {choice.kind === 'custom' && (
            <>
              <label>
                From
                <input
                  type="date"
                  value={choice.from}
                  onChange={(event) => setChoice({ ...choice, from: event.target.value })}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={choice.to}
                  onChange={(event) => setChoice({ ...choice, to: event.target.value })}
                />
              </label>
            </>
          )}
        </div>
      </header>
      {choice.kind === 'custom' && period.fallback && (
        <p className="dash-note dash-note-warn" role="status">
          Choose a valid start and end date. Showing this month meanwhile.
        </p>
      )}

      <div className="dash-grid">
        <NetWorthCard netWorth={netWorth} currency={currency} />
        <SpentCard spent={spent} period={period} currency={currency} />
        <LeftInBudgetCard left={left} currency={currency} />
        <CumulativeSpendCard series={series} period={period} currency={currency} />
        <ComingUpCard coming={coming} currency={currency} />
        <TopCategoriesCard
          top={top}
          currency={currency}
          className={attention.length === 0 ? 'is-wide' : ''}
        />
        <NeedsAttentionCard items={attention} />
      </div>
    </div>
  );
}
