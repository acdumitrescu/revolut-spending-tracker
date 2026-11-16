import { useMemo } from 'react';
import { useAppContext } from '../lib/AppContext';
import { getVendorVisual } from '../lib/displayAssets';
import { BASE_CURRENCY, convertAmountToDisplay } from '../lib/fx';
import { detectRecurringTransactions } from '../lib/recurring';
import { formatCurrency } from '../lib/utils';

// Recurring charges found in the imported history. This used to be "Upcoming bills" on the
// Overview page; the dashboard's Coming up card now lists your own subscription plans, so the
// detected ones live here, next to the plans they could become.
export default function DetectedRecurring() {
  const { data } = useAppContext();
  const detected = useMemo(
    () => detectRecurringTransactions(data.transactions || []).slice(0, 6),
    [data.transactions],
  );
  if (detected.length === 0) return null;
  return (
    <section className="card" aria-labelledby="detected-recurring-heading">
      <h2 id="detected-recurring-heading" className="card-title">
        Detected from your history
      </h2>
      <p className="section-note">
        Recurring charges found in imported transactions. Add the ones you want to track above.
      </p>
      <ul className="command-bill-grid" style={{ listStyle: 'none', padding: 0 }}>
        {detected.map((bill) => {
          const amount = convertAmountToDisplay(
            bill.amount,
            bill.currency === 'N/A' ? BASE_CURRENCY : bill.currency,
            data.displayCurrency,
            data.fxRates,
          );
          const visual = getVendorVisual(bill.label);
          return (
            <li key={`${bill.vendor}-${bill.amount}`} className="command-bill">
              <div className={visual.className} aria-hidden="true">
                {visual.text}
              </div>
              <span>
                <strong>{bill.label}</strong>
                <small>Next expected {bill.nextExpectedDate}</small>
              </span>
              <strong>{formatCurrency(amount, data.displayCurrency, { decimals: 2 })}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
