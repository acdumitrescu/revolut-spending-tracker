import { useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { MoneyFlowSchema } from '../lib/validation';
import { moneyToMinor, incomeAllocation, incomeTotals, emptyMoneyFlow } from '../lib/moneyFlow';
import { formatCurrency } from '../lib/utils';
import IncomeChart from '../components/IncomeChart';
import BrdCashflow from '../components/BrdCashflow';
import './MoneyFlow.css';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const cash = (currency) => ({ kind: 'cash', label: 'Cash', accountId: null, currency });
const amount = (minor, currency) => formatCurrency(minor / 100, currency);
const locationValue = (location) =>
  location.kind === 'account' ? `account:${location.accountId}` : location.kind;

function Location({ label, value, onChange, accounts, currency }) {
  const current = locationValue(value);
  return (
    <label>
      {label}
      <select
        className="input"
        value={current}
        onChange={(event) => {
          const account = accounts.find((row) => `account:${row.id}` === event.target.value);
          onChange(
            account
              ? {
                  kind: 'account',
                  label: account.name,
                  accountId: account.id,
                  currency: account.currency,
                }
              : {
                  kind: event.target.value,
                  label: event.target.value === 'cash' ? 'Cash' : 'Other',
                  accountId: null,
                  currency,
                },
          );
        }}
      >
        <option value="cash">Cash</option>
        <option value="other">Other</option>
        {accounts.map((account) => (
          <option key={account.id} value={`account:${account.id}`}>
            {account.name} · {account.currency}
          </option>
        ))}
        {value.kind === 'account' &&
          !accounts.some((account) => account.id === value.accountId) && (
            <option value={current}>{value.label} (removed account)</option>
          )}
      </select>
    </label>
  );
}

export default function MoneyFlow() {
  const { data, setMoneyFlow } = useAppContext();
  const flow = data.moneyFlow || emptyMoneyFlow();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [incomeForm, setIncomeForm] = useState(null);
  const [transferForm, setTransferForm] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removal, setRemoval] = useState(null);
  const incomes = flow.incomes
    .filter((row) => row.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totals = incomeTotals(incomes);
  const selectedIncome = flow.incomes.find((row) => row.id === transferForm?.incomeId);
  const updateIncome = (patch) => setIncomeForm((current) => ({ ...current, ...patch }));
  const updateTransfer = (patch) => setTransferForm((current) => ({ ...current, ...patch }));
  function save(next) {
    const parsed = MoneyFlowSchema.safeParse(next);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    setMoneyFlow(parsed.data);
    setError('');
    setMessage('Saved. Account balances and imported transactions are unchanged.');
  }
  function editIncome(record) {
    setError('');
    setTransferForm(null);
    setIncomeForm(
      record
        ? { ...record, amount: String(record.amountMinor / 100) }
        : {
            id: crypto.randomUUID(),
            date: month === today().slice(0, 7) ? today() : `${month}-01`,
            source: '',
            kind: 'salary',
            amount: '',
            currency: 'RON',
            receivedIn: cash('RON'),
            notes: '',
          },
    );
  }
  function editTransfer(income, record) {
    setError('');
    setIncomeForm(null);
    setTransferForm(
      record
        ? {
            ...record,
            amount: String(record.amountMinor / 100),
            received: String(record.receivedMinor / 100),
          }
        : {
            id: crypto.randomUUID(),
            incomeId: income.id,
            date: income.date,
            amount: '',
            received: '',
            destination: cash(income.currency),
            status: 'planned',
            notes: '',
          },
    );
  }
  function submitIncome(event) {
    event.preventDefault();
    try {
      const { amount: entered, ...record } = incomeForm;
      record.amountMinor = moneyToMinor(entered);
      save({
        ...flow,
        incomes: flow.incomes.some((row) => row.id === record.id)
          ? flow.incomes.map((row) => (row.id === record.id ? record : row))
          : [...flow.incomes, record],
      });
      setIncomeForm(null);
    } catch (e) {
      setError(e.message);
    }
  }
  function submitTransfer(event) {
    event.preventDefault();
    try {
      const { amount: entered, received, ...record } = transferForm;
      record.amountMinor = moneyToMinor(entered);
      record.receivedMinor =
        record.destination.currency === selectedIncome.currency
          ? record.amountMinor
          : moneyToMinor(received);
      save({
        ...flow,
        transfers: flow.transfers.some((row) => row.id === record.id)
          ? flow.transfers.map((row) => (row.id === record.id ? record : row))
          : [...flow.transfers, record],
      });
      setTransferForm(null);
    } catch (e) {
      setError(e.message);
    }
  }
  function removeRecord() {
    try {
      if (removal.kind === 'income' && flow.transfers.some((row) => row.incomeId === removal.id))
        throw new Error('Remove the allocations for this income first.');
      save(
        removal.kind === 'income'
          ? { ...flow, incomes: flow.incomes.filter((row) => row.id !== removal.id) }
          : { ...flow, transfers: flow.transfers.filter((row) => row.id !== removal.id) },
      );
      setRemoval(null);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="page-stack money-flow">
      <header className="flow-heading">
        <div>
          <h2>Income & allocation</h2>
          <p className="section-note">
            Track BRD statement activity separately from manual income and allocation plans. Manual
            entries never change account balances.
          </p>
        </div>
        <label>
          Receipt month
          <input
            className="input"
            type="month"
            required
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setIncomeForm(null);
                setTransferForm(null);
                setError('');
              }
            }}
          />
        </label>
      </header>
      <BrdCashflow month={month} setMonth={setMonth} />
      <h3>Manual receipts & allocation plans</h3>
      <IncomeChart incomes={flow.incomes} />
      <div className="kpi-grid">
        {Object.entries(totals).map(([currency, total]) => (
          <div className="kpi green" key={currency}>
            <div className="lbl">Recorded income · {currency}</div>
            <div className="val">{amount(total, currency)}</div>
          </div>
        ))}
      </div>
      <p className="section-note">
        Manual income records only. Imported credits are not added here automatically; transfers
        between your own accounts are not new income. Each currency is totalled separately.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="flow-warning">
          {error}
        </p>
      )}
      <button className="btn btn-primary" onClick={() => editIncome(null)}>
        Record income
      </button>

      {incomeForm && (
        <form className="card flow-form" onSubmit={submitIncome} aria-label="Income receipt">
          <h3>Income received</h3>
          <label>
            Source
            <input
              className="input"
              required
              maxLength={160}
              placeholder="Employer, client, gift…"
              value={incomeForm.source}
              onChange={(e) => updateIncome({ source: e.target.value })}
            />
          </label>
          <label>
            Income type
            <select
              className="input"
              value={incomeForm.kind}
              onChange={(e) => updateIncome({ kind: e.target.value })}
            >
              {['salary', 'freelance', 'interest', 'gift', 'other'].map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          <label>
            Received date
            <input
              className="input"
              type="date"
              required
              value={incomeForm.date}
              onChange={(e) => updateIncome({ date: e.target.value })}
            />
          </label>
          <Location
            label="Received in"
            value={incomeForm.receivedIn}
            accounts={data.accounts}
            currency={incomeForm.currency}
            onChange={(receivedIn) => updateIncome({ receivedIn, currency: receivedIn.currency })}
          />
          <label>
            Currency
            <select
              className="input"
              disabled={incomeForm.receivedIn.kind === 'account'}
              value={incomeForm.currency}
              onChange={(e) =>
                updateIncome({
                  currency: e.target.value,
                  receivedIn: { ...incomeForm.receivedIn, currency: e.target.value },
                })
              }
            >
              {['RON', 'EUR', 'USD'].map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <label>
            Income amount
            <input
              className="input"
              inputMode="decimal"
              required
              value={incomeForm.amount}
              onChange={(e) => updateIncome({ amount: e.target.value })}
            />
          </label>
          <label>
            Income notes
            <textarea
              className="input"
              maxLength={2000}
              value={incomeForm.notes}
              onChange={(e) => updateIncome({ notes: e.target.value })}
            />
          </label>
          <div className="flow-actions">
            <button className="btn btn-primary" type="submit">
              Save income
            </button>
            <button className="btn" type="button" onClick={() => setIncomeForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {transferForm && selectedIncome && (
        <form className="card flow-form" onSubmit={submitTransfer} aria-label="Income allocation">
          <h3>Allocate income from {selectedIncome.source}</h3>
          <p>
            From {selectedIncome.receivedIn.label} · {selectedIncome.currency}
          </p>
          <Location
            label="Destination"
            value={transferForm.destination}
            accounts={data.accounts}
            currency={selectedIncome.currency}
            onChange={(destination) => updateTransfer({ destination })}
          />
          <label>
            Transfer date
            <input
              className="input"
              type="date"
              required
              min={selectedIncome.date}
              value={transferForm.date}
              onChange={(e) => updateTransfer({ date: e.target.value })}
            />
          </label>
          <label>
            Amount from income ({selectedIncome.currency})
            <input
              className="input"
              inputMode="decimal"
              required
              value={transferForm.amount}
              onChange={(e) => updateTransfer({ amount: e.target.value })}
            />
          </label>
          {transferForm.destination.currency !== selectedIncome.currency && (
            <label>
              Amount arriving ({transferForm.destination.currency})
              <input
                className="input"
                inputMode="decimal"
                required
                value={transferForm.received}
                onChange={(e) => updateTransfer({ received: e.target.value })}
              />
            </label>
          )}
          <label>
            Transfer status
            <select
              className="input"
              value={transferForm.status}
              onChange={(e) => updateTransfer({ status: e.target.value })}
            >
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label>
            Transfer notes
            <textarea
              className="input"
              maxLength={2000}
              value={transferForm.notes}
              onChange={(e) => updateTransfer({ notes: e.target.value })}
            />
          </label>
          <div className="flow-actions">
            <button className="btn btn-primary" type="submit">
              Save allocation
            </button>
            <button className="btn" type="button" onClick={() => setTransferForm(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!incomes.length && (
        <div className="card">
          <h3>No income recorded for this month</h3>
          <p>
            Add your salary, freelance payments, cash income or other sources. Then allocate each
            receipt to its destinations.
          </p>
        </div>
      )}
      {incomes.map((income) => {
        const summary = incomeAllocation(income, flow.transfers);
        const transfers = flow.transfers.filter((row) => row.incomeId === income.id);
        return (
          <section className="card" key={income.id} aria-label={`Income from ${income.source}`}>
            <div className="flow-heading">
              <div>
                <h3>{income.source}</h3>
                <p>
                  {income.date} · {income.kind} · Received in {income.receivedIn.label}
                </p>
              </div>
              <strong>{amount(income.amountMinor, income.currency)}</strong>
            </div>
            {income.notes && <p>{income.notes}</p>}
            <div className="flow-summary">
              <span>
                Planned: <strong>{amount(summary.planned, income.currency)}</strong>
              </span>
              <span>
                Completed: <strong>{amount(summary.completed, income.currency)}</strong>
              </span>
              <span>
                {summary.remaining < 0 ? 'Over-allocated' : 'Unallocated'}:{' '}
                <strong>{amount(Math.abs(summary.remaining), income.currency)}</strong>
              </span>
            </div>
            {summary.remaining < 0 && (
              <p className="flow-warning">
                Allocations exceed this income receipt. Review your plan.
              </p>
            )}
            <p className="section-note">
              Unallocated is the remainder of this receipt, not an account balance. Allocations
              below belong to this receipt, including transfers dated in later months.
            </p>
            <div className="flow-actions">
              <button className="btn" onClick={() => editTransfer(income)}>
                Add allocation
              </button>
              <button className="btn" onClick={() => editIncome(income)}>
                Edit income
              </button>
              <button className="btn" onClick={() => setRemoval({ kind: 'income', id: income.id })}>
                Remove income
              </button>
            </div>
            <ul className="flow-transfers">
              {transfers.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>
                      {income.receivedIn.label} → {row.destination.label}
                    </strong>
                    <p>
                      {row.date} · {row.status} · {amount(row.amountMinor, income.currency)}
                      {row.destination.currency !== income.currency &&
                        ` → ${amount(row.receivedMinor, row.destination.currency)}`}
                    </p>
                    {row.notes && <p>{row.notes}</p>}
                  </div>
                  <div className="flow-actions">
                    {row.status === 'planned' && (
                      <button
                        className="btn"
                        onClick={() => {
                          try {
                            save({
                              ...flow,
                              transfers: flow.transfers.map((item) =>
                                item.id === row.id ? { ...item, status: 'completed' } : item,
                              ),
                            });
                          } catch (e) {
                            setError(e.message);
                          }
                        }}
                      >
                        Mark completed
                      </button>
                    )}
                    <button className="btn" onClick={() => editTransfer(income, row)}>
                      Edit allocation
                    </button>
                    <button
                      className="btn"
                      onClick={() => setRemoval({ kind: 'transfer', id: row.id })}
                    >
                      Remove allocation
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {removal && (
        <div className="card" role="alert">
          <p>Remove this {removal.kind === 'income' ? 'income receipt' : 'allocation'}?</p>
          <div className="flow-actions">
            <button className="btn" onClick={removeRecord}>
              Confirm removal
            </button>
            <button className="btn" onClick={() => setRemoval(null)}>
              Keep record
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
