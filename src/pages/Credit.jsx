import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Store, Car, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { CreditRecordSchema } from '../lib/validation';
import { getCreditOverview, creditDateStatus, isIngCreditAccount } from '../lib/credit';
import { BASE_CURRENCY, SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
import { formatCurrency } from '../lib/utils';
import './Credit.css';
import CardPurchases from '../components/CardPurchases';

const sections = [
  {
    kind: 'card',
    title: 'Credit cards',
    icon: CreditCard,
    action: 'Link a credit card',
    description:
      'ING credit-card balances are linked automatically from Accounts. No bank connection or duplicate balance entry.',
  },
  {
    kind: 'vendor',
    title: 'Other credit',
    icon: Store,
    action: 'Add vendor credit',
    description:
      'Track instalments or amounts owed directly to a shop, service provider, or other non-bank vendor.',
  },
  {
    kind: 'planned',
    title: 'Future financing',
    icon: Car,
    action: 'Add financing plan',
    description:
      'Keep car leases, bank loans, and other financing ideas separate from your actual commitments.',
  },
];

function CreditEditor({ record, accounts, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    name: '',
    accountId: '',
    currency: BASE_CURRENCY,
    remainingBalance: '',
    amountFinanced: '',
    dueDate: '',
    notes: '',
    ...record,
    monthlyPayment: record.monthlyPayment ?? '',
    termMonths: record.termMonths ?? '',
  });
  const [error, setError] = useState('');
  const card = record.kind === 'card';
  const planned = record.kind === 'planned';
  const update = (field) => (event) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  const save = (event) => {
    event.preventDefault();
    const candidate = {
      ...draft,
      monthlyPayment: draft.monthlyPayment === '' ? null : Number(draft.monthlyPayment),
      termMonths: draft.termMonths === '' ? null : Number(draft.termMonths),
      remainingBalance: draft.remainingBalance === '' ? NaN : Number(draft.remainingBalance),
      amountFinanced: draft.amountFinanced === '' ? NaN : Number(draft.amountFinanced),
    };
    const result = CreditRecordSchema.safeParse(candidate);
    if (!result.success) {
      setError('Check the required fields, amounts and dates. Amounts cannot be negative.');
      return;
    }
    try {
      onSave(result.data);
    } catch (saveError) {
      setError(saveError.message);
    }
  };
  return (
    <form
      className="credit-editor"
      onSubmit={save}
      aria-label={`${card ? 'Credit card' : planned ? 'Financing plan' : 'Vendor credit'} editor`}
    >
      <h3>
        {card
          ? 'Card payment details'
          : planned
            ? 'Financing plan details'
            : 'Vendor credit details'}
      </h3>
      <div className="credit-form-grid">
        {card ? (
          <label>
            Linked account
            <select
              className="input"
              required
              disabled={!!record.purchases?.length}
              value={draft.accountId}
              onChange={update('accountId')}
            >
              <option value="">Choose a credit-card account</option>
              {draft.accountId && !accounts.some((account) => account.id === draft.accountId) && (
                <option value={draft.accountId} disabled>
                  Missing account — choose a replacement
                </option>
              )}
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency || BASE_CURRENCY})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              {planned ? 'Plan name' : 'Vendor / creditor'}
              <input
                className="input"
                required
                maxLength={160}
                value={draft.name}
                onChange={update('name')}
                placeholder={planned ? 'e.g. Car lease' : 'e.g. Furniture store'}
              />
            </label>
            <label>
              Currency
              <select className="input" value={draft.currency} onChange={update('currency')}>
                {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </label>
            <label>
              {planned ? 'Amount to finance' : 'Amount still owed'}
              <input
                className="input"
                type="number"
                min="0"
                step="any"
                required
                value={planned ? draft.amountFinanced : draft.remainingBalance}
                onChange={update(planned ? 'amountFinanced' : 'remainingBalance')}
              />
            </label>
          </>
        )}
        <label>
          {planned ? 'Estimated monthly payment (optional)' : 'Monthly payment (optional)'}
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={draft.monthlyPayment}
            onChange={update('monthlyPayment')}
            placeholder="Not entered"
          />
        </label>
        <label>
          {planned ? 'Expected start date (optional)' : 'Next payment date (optional)'}
          <input className="input" type="date" value={draft.dueDate} onChange={update('dueDate')} />
        </label>
        {planned && (
          <label>
            Term in months (optional)
            <input
              className="input"
              type="number"
              min="1"
              max="600"
              step="1"
              value={draft.termMonths}
              onChange={update('termMonths')}
            />
          </label>
        )}
        <label className="credit-form-notes">
          Notes
          <textarea
            className="input"
            rows={2}
            maxLength={4000}
            value={draft.notes}
            onChange={update('notes')}
            placeholder={
              planned
                ? 'Quote assumptions, deposit, fees or final balloon payment…'
                : 'Payment reference, instalment details…'
            }
          />
        </label>
      </div>
      <p className="section-note">
        {card
          ? 'Choose a credit account, not ING Debit. Negative account balances mean debt; positive balances mean no debt. Payment amounts use the linked account’s currency.'
          : 'Enter amounts in the selected currency.'}{' '}
        {planned
          ? 'These are your estimates, not a lender quote. Plans do not change actual debt, budgets, or transactions.'
          : 'Saving a payment date does not schedule or record a payment. Update the balance and next date after paying.'}
      </p>
      {error && (
        <p role="alert" className="credit-error">
          {error}
        </p>
      )}
      <div className="credit-actions">
        <button className="btn btn-primary" type="submit">
          Save {planned ? 'plan' : 'credit details'}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Credit() {
  const {
    data,
    upsertCreditRecord,
    removeCreditRecord,
    upsertCardPurchase,
    archiveCardPurchase,
    reopenCardPurchase,
    deleteCardPurchase,
  } = useAppContext();
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [message, setMessage] = useState('');
  const overview = getCreditOverview(data);
  const grouped = { card: overview.cards, vendor: overview.vendors, planned: overview.plans };
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currency = data.displayCurrency;
  const newRecord = (kind) => {
    setMessage('');
    setEditing({ id: globalThis.crypto.randomUUID(), kind });
  };
  const availableAccounts = data.accounts.filter(
    (account) =>
      account.id === editing?.accountId ||
      !overview.cards.some((card) => card.accountId === account.id),
  );
  const save = (record) => {
    upsertCreditRecord(record);
    setEditing(null);
    setMessage(
      record.kind === 'planned'
        ? 'Financing plan saved. Actual debt is unchanged.'
        : 'Credit details saved. No transaction was created.',
    );
  };

  return (
    <div className="page-stack credit-page">
      <header className="credit-page-heading">
        <div className="eyebrow">COMMITMENTS & PLANS</div>
        <h2>Credit & financing</h2>
        <p>See what you owe, keep payment details together, and plan what comes next.</p>
      </header>
      <div className="credit-kpis">
        <div className="kpi blue">
          <div className="lbl">Tracked outstanding debt</div>
          <div className="val">{formatCurrency(overview.outstanding, currency)}</div>
          <p>
            Credit cards + vendor credit.{' '}
            {overview.missingBalances
              ? `${overview.missingBalances} card balance(s) missing — total is incomplete.`
              : 'Future plans excluded.'}
          </p>
        </div>
        <div className="kpi">
          <div className="lbl">Recorded monthly payments</div>
          <div className="val">{formatCurrency(overview.monthlyPayments, currency)}</div>
          <p>
            {overview.missingPayments
              ? `${overview.missingPayments} commitment(s) need a payment amount or linked account. This is a partial total.`
              : 'Your entered amounts, not an automatic minimum-payment calculation.'}
          </p>
        </div>
        <div className="kpi">
          <div className="lbl">Future plans</div>
          <div className="val">{overview.plans.length}</div>
          <p>Scenarios only. Not included in current debt or monthly payments.</p>
        </div>
      </div>
      <p className="section-note">
        This is a credit register, not an expense ledger. Linked card debt is already reflected in
        Accounts; it is not subtracted again. Vendor credit is tracked here only. Converted totals
        use your configured FX rates.
      </p>
      <nav className="credit-jump-links" aria-label="Credit categories">
        {sections.map((section) => (
          <a className="btn" key={section.kind} href={`#credit-${section.kind}`}>
            {section.title} · {grouped[section.kind].length}
          </a>
        ))}
      </nav>
      {message && (
        <p role="status" className="credit-status">
          {message}
        </p>
      )}
      {sections.map(({ kind, title, icon: Icon, action, description }) => (
        <section
          className={`card credit-section credit-${kind}`}
          id={`credit-${kind}`}
          key={kind}
          aria-labelledby={`credit-${kind}-title`}
        >
          <div className="credit-section-heading">
            <div className="credit-section-title">
              <span className="credit-section-icon">
                <Icon size={21} aria-hidden="true" />
              </span>
              <div>
                <h3 id={`credit-${kind}-title`}>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
            <button
              className="btn"
              onClick={() => newRecord(kind)}
              disabled={!!editing || (kind === 'card' && availableAccounts.length === 0)}
            >
              <Plus size={16} aria-hidden="true" />
              {action}
            </button>
          </div>
          {editing?.kind === kind && (
            <CreditEditor
              key={editing.id}
              record={editing}
              accounts={availableAccounts}
              onSave={save}
              onCancel={() => setEditing(null)}
            />
          )}
          {grouped[kind].length === 0 && (
            <div className="credit-empty">
              {kind === 'card' ? (
                <>
                  No ING credit-card account found.{' '}
                  <Link to="/app/accounts/balances">Add it in Balances</Link>, or explicitly link an
                  existing credit account above.
                </>
              ) : kind === 'vendor' ? (
                'No vendor credit recorded. Add the creditor, remaining amount, monthly instalment and next payment date.'
              ) : (
                'Thinking about a car lease or bank loan? Save the expected amount and payment here without changing today’s debt.'
              )}
            </div>
          )}
          <div className="credit-records">
            {grouped[kind].map((record) => {
              const planned = kind === 'planned';
              const card = kind === 'card';
              const isAuto =
                card &&
                data.accounts.some(
                  (account) => account.id === record.accountId && isIngCreditAccount(account),
                );
              const amount = planned ? record.amountFinanced : record.remainingBalance;
              const status = planned ? 'Plan only' : creditDateStatus(record.dueDate, today);
              return (
                <article className="credit-record" key={record.id}>
                  <div className="credit-record-heading">
                    <div>
                      <h4>{record.name}</h4>
                      <span className="credit-record-subtitle">
                        {card
                          ? record.missingAccount
                            ? 'Linked account unavailable — relink to restore the balance'
                            : `Linked account · ${record.latestMonth ? `balance from ${record.latestMonth}` : 'no balance entered yet'}`
                          : planned
                            ? 'Future financing · not active debt'
                            : 'Non-bank vendor credit'}
                      </span>
                    </div>
                    <span
                      className={`credit-date-status${!planned && record.dueDate && record.dueDate < today ? ' needs-review' : ''}`}
                    >
                      {status}
                    </span>
                  </div>
                  <dl className="credit-record-values">
                    <div>
                      <dt>{planned ? 'Amount to finance' : 'Still owed'}</dt>
                      <dd>
                        {amount === null
                          ? 'Not available'
                          : formatCurrency(amount, record.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt>{planned ? 'Estimated monthly payment' : 'Monthly payment'}</dt>
                      <dd>
                        {record.monthlyPayment === null || !record.currency
                          ? 'Not entered'
                          : formatCurrency(record.monthlyPayment, record.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt>{planned ? 'Expected start' : 'Next payment'}</dt>
                      <dd>{record.dueDate || 'Not set'}</dd>
                    </div>
                    {planned && (
                      <div>
                        <dt>Term</dt>
                        <dd>{record.termMonths ? `${record.termMonths} months` : 'Not entered'}</dd>
                      </div>
                    )}
                  </dl>
                  {card && record.balance > 0 && (
                    <p className="section-note">
                      Positive account balance; no outstanding card debt shown.
                    </p>
                  )}
                  {record.notes && <p className="credit-record-notes">{record.notes}</p>}
                  <div className="credit-actions">
                    <button
                      className="btn"
                      disabled={!!editing}
                      aria-label={`Edit ${record.name}`}
                      onClick={() => {
                        setEditing(record);
                        setMessage('');
                      }}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      Edit details
                    </button>
                    {card && (
                      <Link className="btn" to="/app/accounts/balances">
                        View account balances
                      </Link>
                    )}
                    {!isAuto && (
                      <button
                        className="btn credit-delete"
                        aria-label={`Remove ${record.name}`}
                        onClick={() => setDeleteId(record.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        {card ? 'Unlink' : 'Remove'}
                      </button>
                    )}
                  </div>
                  {card && (
                    <CardPurchases
                      card={record}
                      onSave={upsertCardPurchase}
                      onArchive={archiveCardPurchase}
                      onReopen={reopenCardPurchase}
                      onDelete={deleteCardPurchase}
                    />
                  )}
                  {deleteId === record.id && (
                    <div
                      className="credit-delete-confirm"
                      role="group"
                      aria-label={`Confirm removal of ${record.name}`}
                    >
                      <p>
                        Remove this {planned ? 'plan' : 'credit record'}? This does not settle debt
                        or change accounts and transactions.
                      </p>
                      <button className="btn" onClick={() => setDeleteId(null)}>
                        Keep record
                      </button>
                      <button
                        className="btn credit-delete"
                        disabled={!!record.purchases?.length}
                        onClick={() => {
                          removeCreditRecord(record.id);
                          setDeleteId(null);
                          if (editing?.id === record.id) setEditing(null);
                          setMessage('Record removed. Accounts and transactions are unchanged.');
                        }}
                      >
                        Confirm removal
                      </button>
                      {!!record.purchases?.length && (
                        <p>
                          Cards with purchase history cannot be unlinked. Archive completed
                          purchases instead.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
