import { getNetWorthBreakdown } from '../lib/overviewPosition';
import { ACCOUNT_GROUP_LABELS } from '../../backend/accountGroups';
import { formatCurrency } from '../lib/utils';

export default function NetWorthBreakdown({ data }) {
  const rows = getNetWorthBreakdown(data);
  const total = rows.reduce((sum,row) => sum + (row.contribution ?? 0), 0);
  return <details className="dashboard-panel" style={{padding:16,marginBottom:16}}>
    <summary>How net worth is calculated</summary>
    <p className="section-note">Signed account balances minus separate vendor debt. Credit-account debt is already inside account balances. Portfolio holdings and instalment schedules are not added or deducted again.</p>
    <p>Account groups are editable in Accounts → Balances → Account settings.</p>
    <div style={{overflowX:'auto'}} tabIndex={0} role="region" aria-label="Net worth calculation details">
      <table style={{width:'100%',minWidth:740,textAlign:'left'}}><caption>Every contribution to tracked net worth</caption>
        <thead><tr>{['Account / debt','Group','Balance date','Original amount','FX rate','Contribution','Status'].map(label => <th key={label} scope="col" style={{padding:8}}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row" style={{padding:8}}>{row.name}</th><td>{ACCOUNT_GROUP_LABELS[row.group]}</td><td>{row.date || 'Not recorded'}</td>
          <td>{row.value === null ? '—' : formatCurrency(row.value,row.currency)}</td>
          <td>1 {row.currency} = {Number(row.rate.toFixed(6))} {data.displayCurrency}</td>
          <td>{row.contribution === null ? '—' : formatCurrency(row.contribution,data.displayCurrency)}</td><td>{row.status}</td>
        </tr>)}</tbody><tfoot><tr><th colSpan={5} scope="row">Tracked net worth</th><td colSpan={2}>{formatCurrency(total,data.displayCurrency)}</td></tr></tfoot>
      </table>
    </div>
    <p className="section-note">FX source: {data.fxSource || 'Not recorded'} · Updated: {data.fxUpdatedAt ? new Date(data.fxUpdatedAt).toLocaleString() : 'Not recorded'}. These are configured rates, not guaranteed live quotes.</p>
  </details>;
}
