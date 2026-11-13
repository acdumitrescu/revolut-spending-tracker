import { useState } from 'react';
import ChartWrapper from './ChartWrapper';
import { monthlyIncome } from '../lib/moneyFlow';
import { formatCurrency } from '../lib/utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function IncomeChart({ incomes }) {
  const currentYear = String(new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const [currency, setCurrency] = useState('RON');
  const years = [...new Set([currentYear, year, ...incomes.map((row) => row.date.slice(0, 4))])]
    .sort()
    .reverse();
  const totals = monthlyIncome(incomes, year, currency);
  const total = totals.reduce((sum, value) => sum + value, 0);
  return (
    <section className="card" aria-label="Monthly income chart">
      <div className="flow-heading">
        <div>
          <h3>Monthly income</h3>
          <p className="section-note">
            All income recorded for the selected year, independent of the receipt-month filter
            below.
          </p>
        </div>
        <div className="flow-actions" style={{ marginTop: 0 }}>
          <label>
            Income chart year
            <select
              className="input"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            >
              {years.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Income chart currency
            <select
              className="input"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {['RON', 'EUR', 'USD'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p>
        <strong>
          {year} total: {formatCurrency(total / 100, currency)}
        </strong>
      </p>
      {!total && (
        <p className="section-note">
          No {currency} income recorded in {year}.
        </p>
      )}
      <ChartWrapper
        type="bar"
        currency={currency}
        height={280}
        showLegend={false}
        data={{
          labels: MONTHS,
          datasets: [
            {
              label: `Income · ${currency}`,
              data: totals.map((value) => value / 100),
              backgroundColor: '#5bd6c7',
              borderRadius: 6,
            },
          ],
        }}
      />
      <p className="section-note">
        Months without recorded income show zero. Transfers are excluded. Currencies are shown
        separately without conversion.
      </p>
      <details>
        <summary>View monthly amounts</summary>
        <table style={{ width: '100%', marginTop: 12 }}>
          <caption>
            Recorded income in {year} ({currency})
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Income</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((month, index) => (
              <tr key={month}>
                <th scope="row">{month}</th>
                <td>{formatCurrency(totals[index] / 100, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
