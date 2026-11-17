import { Link } from 'react-router-dom';
import DashboardCard from './DashboardCard';
import UnconvertedNote from './UnconvertedNote';
import { CARD_ROUTES, money } from './dashboardFormat';

const INFO = (
  <>
    Debits in the chosen period minus refunds, leaving out transfers and savings moves. The change
    compares with the same number of days at the start of the previous period, so a month in
    progress is not measured against a whole month. The bar shows spending against the budget for
    the months the period touches.
  </>
);

export default function SpentCard({ spent, period, currency }) {
  const { current, change, changePct, budget } = spent;
  const comparedWith = period.inProgress
    ? 'the same days of the previous period'
    : 'the previous period';
  let comparison = 'Nothing to compare with in the previous period';
  if (spent.previousToDate > 0 || current > 0) {
    if (change === 0) comparison = `Same as ${comparedWith}`;
    else {
      const pct = changePct === null ? '' : ` (${(Math.abs(changePct) * 100).toFixed(0)}%)`;
      comparison = `${money(Math.abs(change), currency)}${pct} ${change > 0 ? 'more' : 'less'} than ${comparedWith}`;
    }
  }
  const percent =
    budget?.ratio === null || !budget ? 0 : Math.min(100, Math.round(budget.ratio * 100));
  return (
    <DashboardCard id="spent" title={`Spent · ${period.label}`} info={INFO} className="dash-kpi">
      <p className="dash-value">{money(current, currency)}</p>
      <p className="dash-sub">{comparison}</p>
      {budget ? (
        <div className="dash-budget">
          <div
            className={`dash-bar${budget.over ? ' is-over' : ''}`}
            role="progressbar"
            aria-label="Spent against budget"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${money(current, currency)} of ${money(budget.total, currency)} budget`}
          >
            <i style={{ width: `${percent}%` }} />
          </div>
          <p className="dash-note">
            {money(current, currency)} of {money(budget.total, currency)} budget
            {budget.over ? ` · ${money(-budget.remaining, currency)} over budget` : ''}
          </p>
        </div>
      ) : (
        <p className="dash-note">
          No budget for this period. <Link to={CARD_ROUTES.budget}>Set a budget</Link>
        </p>
      )}
      <UnconvertedNote
        lists={[spent.unconverted, spent.previousUnconverted, spent.budgetUnconverted]}
      />
    </DashboardCard>
  );
}
