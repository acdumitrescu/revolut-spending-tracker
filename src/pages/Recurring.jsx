import { useMemo } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { detectRecurringTransactions } from '../lib/recurring';

export default function Recurring() {
  const { data } = useAppContext();
  const recurring = useMemo(() => detectRecurringTransactions(data.transactions), [data.transactions]);

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Recurring Transactions</h2>

      {data.transactions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128260;</div>
          <div className="empty-state-title">No data yet</div>
          <div className="empty-state-desc">Upload a few months of transactions to detect subscriptions and repeating bills.</div>
        </div>
      ) : recurring.length === 0 ? (
        <div className="card">
          <div className="card-title">Upcoming Bills</div>
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>
            Nothing has enough history yet. Detection looks for at least 3 similar debit transactions with a mostly consistent interval.
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi blue">
              <div className="lbl">Detected Recurring Charges</div>
              <div className="val">{recurring.length}</div>
            </div>
            <div className="kpi red">
              <div className="lbl">Estimated Next 30 Days</div>
              <div className="val">{formatCurrency(recurring.reduce((sum, item) => sum + item.amount, 0))}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Upcoming Bills</div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Typical Amount</th>
                    <th style={{ textAlign: 'right' }}>Interval</th>
                    <th>Next Expected Date</th>
                    <th style={{ textAlign: 'right' }}>Occurrences</th>
                  </tr>
                </thead>
                <tbody>
                  {recurring.map((item) => (
                    <tr key={`${item.vendor}-${item.amount}`}>
                      <td>{item.label}</td>
                      <td>{item.cat}</td>
                      <td style={{ textAlign: 'right', color: 'var(--red)' }}>{formatCurrency(item.amount)}</td>
                      <td style={{ textAlign: 'right' }}>{item.avgInterval} days</td>
                      <td>{item.nextExpectedDate}</td>
                      <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{item.occurrences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
