import { Link } from 'react-router-dom';
import DashboardCard from './DashboardCard';
import UnconvertedNote from './UnconvertedNote';
import { CARD_ROUTES, money } from './dashboardFormat';

const INFO = (
  <>
    Budget assigned to categories minus spending in those same categories, for the months the period
    touches (the Budget page&apos;s rule). Spending in categories without a budget is not
    subtracted; it is shown separately.
  </>
);

export default function LeftInBudgetCard({ left, currency }) {
  const tight = left.categories.slice(0, 2);
  return (
    <DashboardCard id="left" title="Left in budget" info={INFO} className="dash-kpi">
      {left.hasBudget ? (
        <>
          <p className={`dash-value${left.over ? ' is-over' : ''}`}>
            {left.over
              ? `${money(-left.remaining, currency)} over`
              : money(left.remaining, currency)}
          </p>
          <p className="dash-sub">
            {money(left.spent, currency)} of {money(left.budgeted, currency)} budgeted
            {left.over ? ' · over budget' : ''}
          </p>
          <ul className="dash-mini-list">
            {tight.map((entry) => (
              <li key={entry.cat}>
                <span>{entry.cat}</span>
                <span>
                  {entry.over
                    ? `${money(-entry.remaining, currency)} over`
                    : `${money(entry.remaining, currency)} left`}
                </span>
              </li>
            ))}
          </ul>
          {left.unbudgetedSpend > 0 && (
            <p className="dash-note">
              {money(left.unbudgetedSpend, currency)} spent outside budgeted categories
            </p>
          )}
        </>
      ) : (
        <p className="dash-sub">
          No budget set for this period. <Link to={CARD_ROUTES.budget}>Set a budget</Link> to see
          what is left.
        </p>
      )}
      <UnconvertedNote lists={[left.unconverted, left.budgetUnconverted]} />
    </DashboardCard>
  );
}
