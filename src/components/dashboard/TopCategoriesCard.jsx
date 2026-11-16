import { Link } from 'react-router-dom';
import { getColorForCategory } from '../../lib/utils';
import DashboardCard from './DashboardCard';
import UnconvertedNote from './UnconvertedNote';
import { CARD_ROUTES, money, plural } from './dashboardFormat';

const INFO = (
  <>
    Where the money went in the chosen period: expenses by category before refunds, transfers
    excluded. Categories beyond the top five are grouped as Other. The total can differ slightly
    from Spent, which nets refunds.
  </>
);

const percent = (share) => `${Math.round(share * 100)}%`;

export default function TopCategoriesCard({ top, currency, className = '' }) {
  return (
    <DashboardCard
      id="categories"
      title="Top 5 categories"
      info={INFO}
      className={`dash-categories ${className}`.trim()}
    >
      {top.categories.length === 0 ? (
        <p className="dash-sub">No spending in this period.</p>
      ) : (
        <ul className="dash-category-list">
          {top.categories.map((entry) => (
            <li key={entry.category}>
              <span className="dash-category-name">
                <i
                  className="dash-dot"
                  style={{ backgroundColor: getColorForCategory(entry.category) }}
                  aria-hidden="true"
                />
                {entry.category}
              </span>
              <span className="dash-category-bar" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.max(entry.share * 100, 2)}%`,
                    backgroundColor: getColorForCategory(entry.category),
                  }}
                />
              </span>
              <span className="dash-category-amount">
                {money(entry.amount, currency)} · {percent(entry.share)}
              </span>
            </li>
          ))}
          {top.other && (
            <li className="dash-category-other">
              <span className="dash-category-name">
                Other ({plural(top.other.count, 'category', 'categories')})
              </span>
              <span className="dash-category-bar" aria-hidden="true" />
              <span className="dash-category-amount">
                {money(top.other.amount, currency)} · {percent(top.other.share)}
              </span>
            </li>
          )}
        </ul>
      )}
      <UnconvertedNote lists={[top.unconverted]} />
      <p className="dash-footer-link">
        <Link to={CARD_ROUTES.categories}>All categories</Link>
      </p>
    </DashboardCard>
  );
}
