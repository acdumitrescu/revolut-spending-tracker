import { getAccountGroups } from '../lib/overviewPosition';
import { formatCurrency } from '../lib/utils';

const GROUPS = [
  ['shares', 'Shares & ETFs', 'Accounts assigned to Investments (including brokerage cash)'],
  ['cash', 'Total cash', 'Accounts assigned to Cash'],
  ['bank', 'Total bank', 'Accounts assigned to Bank'],
  ['credits', 'Total credits', 'Signed credit-account balances; already included in net worth'],
];

// Balance totals per account group. They used to sit on the Overview page; the dashboard now
// shows only the headline net worth, so the breakdown lives with the balances.
export default function AccountGroupTotals({ data }) {
  const groups = getAccountGroups(data);
  const displayCurrency = data.displayCurrency;
  return (
    <section
      className="kpi-grid"
      aria-label="Account balance groups"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: 16,
      }}
    >
      {GROUPS.map(([key, label, note]) => (
        <div className="kpi" key={key}>
          <h3 className="lbl">{label}</h3>
          <div className="val">
            {formatCurrency(groups[key].total, key === 'shares' ? 'USD' : displayCurrency)}
          </div>
          <p className="section-note">{note}</p>
          <p className="section-note">
            {[...new Set(groups[key].accounts)].join(' · ') || 'No matching accounts'}
            {groups[key].missing > 0 ? ` · ${groups[key].missing} missing balances` : ''}
          </p>
        </div>
      ))}
      <p className="section-note" style={{ gridColumn: '1 / -1' }}>
        Shares & ETFs are shown in USD using your configured exchange rates; other groups use{' '}
        {displayCurrency}. Balances as of {groups.month || 'not recorded'}; earlier entries carry
        forward.
        {groups.other.accounts.length > 0 &&
          ` Other assets / crypto (${groups.other.accounts.join(', ')}): ${formatCurrency(groups.other.total, displayCurrency)}, included in net worth but outside these four groups.`}
      </p>
    </section>
  );
}
