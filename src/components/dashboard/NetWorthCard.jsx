import { Link } from 'react-router-dom';
import DashboardCard from './DashboardCard';
import UnconvertedNote from './UnconvertedNote';
import { CARD_ROUTES, money, plural } from './dashboardFormat';

const INFO = (
  <>
    Signed account balances (credit accounts count as negative) minus vendor debt, as of the last
    day of the chosen period. Balances are monthly, so the comparison is with the month the previous
    period ended in. Portfolio holdings are not added again. The full calculation is on Accounts.
  </>
);

export default function NetWorthCard({ netWorth, currency }) {
  const { hasData, current, delta, deltaPct, asOfMonth, previousMonth, accountCounts } = netWorth;
  let comparison = 'No earlier balance to compare with';
  if (delta !== null) {
    const direction = delta === 0 ? 'No change' : delta > 0 ? 'Up' : 'Down';
    const pct = deltaPct === null ? '' : ` (${(Math.abs(deltaPct) * 100).toFixed(1)}%)`;
    comparison = `${direction}${delta === 0 ? '' : ` ${money(Math.abs(delta), currency)}${pct}`} vs ${previousMonth}`;
  }
  return (
    <DashboardCard id="net-worth" title="Net worth" info={INFO} className="dash-kpi">
      {hasData ? (
        <>
          <p className="dash-value">{money(current, currency)}</p>
          <p className="dash-sub">{comparison}</p>
          <p className="dash-note">
            As of {asOfMonth}
            {accountCounts.missing > 0
              ? ` · ${plural(accountCounts.missing, 'account')} without a balance`
              : ''}
          </p>
        </>
      ) : (
        <p className="dash-sub">
          No account balances yet. <Link to={CARD_ROUTES.balances}>Add a balance</Link> to track net
          worth.
        </p>
      )}
      <UnconvertedNote lists={[netWorth.unconverted]} />
    </DashboardCard>
  );
}
