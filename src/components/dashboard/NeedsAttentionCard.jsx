import { Link } from 'react-router-dom';
import DashboardCard from './DashboardCard';
import { plural } from './dashboardFormat';

const INFO = (
  <>
    Things that make the numbers less trustworthy: import batches with suspect currencies, account
    balances older than 35 days, transactions still in Other, and an old backup. Each item opens the
    page where you can fix it. The card disappears when there is nothing to do.
  </>
);

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

function describeAttention(item) {
  switch (item.id) {
    case 'suspect-currency':
      return `${plural(item.count, 'import batch', 'import batches')} with suspect currencies`;
    case 'stale-balances':
      return `${plural(item.count, 'account')} not updated in over 35 days`;
    case 'uncategorised':
      return `${plural(item.count, 'transaction')} still in Other`;
    case 'backup-age':
      return `Last backup was ${item.value} days ago`;
    default:
      return item.id;
  }
}

export default function NeedsAttentionCard({ items }) {
  if (items.length === 0) return null;
  return (
    <DashboardCard id="attention" title="Needs attention" info={INFO} className="dash-attention">
      <ul className="dash-attention-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link to={item.href}>{describeAttention(item)}</Link>
            <span className={`dash-severity ${item.severity}`}>
              {SEVERITY_LABEL[item.severity]}
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
