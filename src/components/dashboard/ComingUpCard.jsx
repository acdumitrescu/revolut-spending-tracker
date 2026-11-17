import { Link } from 'react-router-dom';
import DashboardCard from './DashboardCard';
import UnconvertedNote from './UnconvertedNote';
import { moneyExact, money, plural, shortDate } from './dashboardFormat';

const VISIBLE_ITEMS = 4;

const INFO = (
  <>
    Active plans on the Subscriptions page whose next renewal falls in the coming days. It lists one
    next charge per plan and does not project later cycles. Plans whose renewal date has passed need
    a new date and are counted separately.
  </>
);

function when(daysUntil) {
  if (daysUntil === 0) return 'today';
  if (daysUntil === 1) return 'tomorrow';
  return `in ${daysUntil} days`;
}

export default function ComingUpCard({ coming, currency }) {
  const shown = coming.items.slice(0, VISIBLE_ITEMS);
  const hidden = coming.items.length - shown.length;
  return (
    <DashboardCard
      id="coming-up"
      title={`Coming up · ${coming.days} days`}
      info={INFO}
      className="dash-coming"
    >
      {coming.items.length === 0 ? (
        <p className="dash-sub">Nothing due in the next {coming.days} days.</p>
      ) : (
        <>
          <p className="dash-sub">{money(coming.total, currency)} due in total</p>
          <ul className="dash-coming-list">
            {shown.map((item) => (
              <li key={item.id}>
                <span className="dash-coming-name">
                  <strong>{item.name}</strong>
                  <small>
                    <time dateTime={item.date}>{shortDate(item.date)}</time> ·{' '}
                    {when(item.daysUntil)}
                  </small>
                </span>
                <span className="dash-coming-amount">
                  {item.amountDisplay === null
                    ? moneyExact(item.amount, item.currency)
                    : moneyExact(item.amountDisplay, currency)}
                </span>
              </li>
            ))}
          </ul>
          {hidden > 0 && <p className="dash-note">+{hidden} more</p>}
        </>
      )}
      {coming.needsReview > 0 && (
        <p className="dash-note">
          {plural(coming.needsReview, 'plan')} with a past renewal date need review.
        </p>
      )}
      <UnconvertedNote lists={[coming.unconverted]} />
      <p className="dash-footer-link">
        <Link to={coming.href}>All subscriptions</Link>
      </p>
    </DashboardCard>
  );
}
