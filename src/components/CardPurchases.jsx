import { useState } from 'react';
import { buildCardPurchase, getCardPurchaseSummary } from '../lib/credit';
import { formatCurrency } from '../lib/utils';

function PurchaseEditor({ purchase, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    name: '',
    initialCost: '',
    totalCost: '',
    instalmentAmount: '',
    totalMonths: '',
    remainingMonths: '',
    remainingBalance: '',
    notes: '',
    priceMode: 'total',
    ...purchase,
  });
  const [error, setError] = useState('');
  const update = (field) => (event) =>
    setDraft((value) => ({ ...value, [field]: event.target.value }));
  const number = (field, label, min, required = true, placeholder = '') => (
    <label>
      {label}
      <input
        className="input"
        type="number"
        min={min}
        step={field.includes('Months') ? '1' : '0.01'}
        required={required}
        value={draft[field]}
        onChange={update(field)}
        placeholder={placeholder}
      />
    </label>
  );
  return (
    <form
      className="credit-editor"
      aria-label="Purchase editor"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          onSave(buildCardPurchase(draft));
        } catch {
          setError(
            'Check amounts and months. Remaining amounts cannot exceed the total, and remaining months cannot exceed the term.',
          );
        }
      }}
    >
      <h3>Purchase instalments</h3>
      <div className="credit-form-grid">
        <label>
          Purchase name
          <input
            className="input"
            required
            maxLength={160}
            value={draft.name}
            onChange={update('name')}
            placeholder="e.g. Laptop"
          />
        </label>
        {number('initialCost', 'Original purchase price', '0.01')}
        {number('totalMonths', 'Total instalments (months)', '1')}
        <label>
          Enter price as
          <select className="input" value={draft.priceMode} onChange={update('priceMode')}>
            <option value="total">Total repayment price</option>
            <option value="instalment">Price per instalment</option>
          </select>
        </label>
        {draft.priceMode === 'total'
          ? number(
              'totalCost',
              'Total repayment price',
              '0.01',
              false,
              'Defaults to original price',
            )
          : number('instalmentAmount', 'Price per instalment', '0.01')}
        {number(
          'remainingBalance',
          'Amount still owed',
          '0',
          false,
          'Defaults to full repayment price',
        )}
        {number(
          'remainingMonths',
          'Instalments remaining',
          '0',
          false,
          'Defaults to total instalments',
        )}
        <label className="credit-form-notes">
          Purchase notes
          <textarea
            className="input"
            maxLength={4000}
            rows={2}
            value={draft.notes}
            onChange={update('notes')}
          />
        </label>
      </div>
      <p className="section-note">
        Amounts use the card currency. Total repayment may include interest or fees. Monthly amounts
        calculated from a total are rounded; the final instalment may differ. Update the remaining
        balance and months after paying; no bank payment is recorded here.
      </p>
      {error && (
        <p role="alert" className="credit-error">
          {error}
        </p>
      )}
      <div className="credit-actions">
        <button type="submit" className="btn btn-primary">
          Save purchase
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel purchase
        </button>
      </div>
    </form>
  );
}

export default function CardPurchases({ card, onSave, onArchive, onReopen, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [message, setMessage] = useState('');
  const summary = getCardPurchaseSummary(card.purchases);
  const money = (amount) =>
    card.currency
      ? formatCurrency(amount, card.currency, { decimals: 2 })
      : `${amount} (account currency unavailable)`;
  const renderPurchase = (item) => {
    const archived = item.status === 'archived';
    const completed = item.remainingBalance === 0 && item.remainingMonths === 0;
    return (
      <article className="card-purchase" key={item.id}>
        <div className="credit-record-heading">
          <h4>{item.name}</h4>
          <span className="credit-date-status">
            {archived
              ? 'Archived'
              : completed
                ? 'Completed'
                : `${item.remainingMonths} / ${item.totalMonths} instalments left`}
          </span>
        </div>
        <dl className="credit-record-values">
          <div>
            <dt>Original price</dt>
            <dd>{money(item.initialCost)}</dd>
          </div>
          <div>
            <dt>Total repayment</dt>
            <dd>{money(item.totalCost)}</dd>
          </div>
          <div>
            <dt>Still owed</dt>
            <dd>{money(item.remainingBalance)}</dd>
          </div>
          <div>
            <dt>Per instalment</dt>
            <dd>{money(item.instalmentAmount)}</dd>
          </div>
        </dl>
        <progress
          aria-label={`Repayment progress for ${item.name}`}
          max={item.totalCost}
          value={item.totalCost - item.remainingBalance}
        />
        {item.notes && <p className="credit-record-notes">{item.notes}</p>}
        {archived ? (
          <>
            <p className="section-note">
              Archived {new Date(item.archivedAt).toLocaleDateString()} · {item.totalMonths}{' '}
              instalments
            </p>
            <button
              className="btn"
              disabled={!!editing}
              onClick={() => {
                onReopen(card.accountId, item.id);
                setMessage(`${item.name} reopened. Edit its remaining amounts if needed.`);
              }}
            >
              Reopen {item.name}
            </button>
          </>
        ) : (
          <div className="credit-actions">
            <button
              className="btn"
              disabled={!!editing || card.missingAccount}
              onClick={() => setEditing(item)}
            >
              Edit {item.name}
            </button>
            <button
              className="btn"
              disabled={!completed || !!editing}
              onClick={() => {
                onArchive(card.accountId, item.id);
                setMessage(`${item.name} archived. History retained.`);
              }}
            >
              Archive {item.name}
            </button>
          </div>
        )}
        <div className="credit-actions purchase-delete-action">
          <button
            className="btn credit-delete"
            disabled={!!editing}
            onClick={() => setDeleteId(item.id)}
          >
            Delete {item.name}
          </button>
        </div>
        {deleteId === item.id && (
          <div
            className="credit-delete-confirm"
            role="group"
            aria-label={`Delete purchase ${item.name}`}
          >
            <p>
              Delete “{item.name}” and its tracking history? This cannot be undone here; an earlier
              backup may contain a copy. It does not settle debt or change the ING account balance.
            </p>
            <div className="credit-actions">
              <button className="btn" onClick={() => setDeleteId(null)}>
                Keep purchase
              </button>
              <button
                className="btn credit-delete"
                onClick={() => {
                  onDelete(card.accountId, item.id);
                  setDeleteId(null);
                  setMessage(`${item.name} deleted. The account balance is unchanged.`);
                }}
              >
                Confirm delete
              </button>
            </div>
          </div>
        )}
      </article>
    );
  };
  return (
    <section className="card-purchases" aria-label={`Purchases on ${card.name}`}>
      <div className="credit-section-heading">
        <div>
          <h3>Purchase instalments</h3>
          <p>Track individual items without adding their debt a second time.</p>
        </div>
        <button
          className="btn"
          disabled={!!editing || card.missingAccount}
          onClick={() => {
            setEditing({ id: globalThis.crypto.randomUUID() });
            setMessage('');
          }}
        >
          Add purchase
        </button>
      </div>
      <p className="section-note">
        Active purchases: {money(summary.remaining)} remaining · {money(summary.monthly)} in
        scheduled instalments. These are a breakdown only, not added to the card’s totals.
      </p>
      {card.remainingBalance !== null && summary.active.length > 0 && (
        <p className="section-note">
          Difference vs card balance:{' '}
          {money(Math.round((card.remainingBalance - summary.remaining) * 100) / 100)}. Other
          spending, fees or different snapshot dates may explain the difference.
        </p>
      )}
      <p className="section-note">
        To complete a purchase, edit its amount still owed and instalments remaining to zero, then
        archive it. Archived history stays available below.
      </p>
      {message && (
        <p role="status" className="credit-status">
          {message}
        </p>
      )}
      {editing && (
        <PurchaseEditor
          key={editing.id}
          purchase={editing}
          onCancel={() => setEditing(null)}
          onSave={(item) => {
            onSave(card.accountId, item);
            setEditing(null);
            setMessage('Purchase saved. The linked account balance is unchanged.');
          }}
        />
      )}
      {summary.active.length ? (
        summary.active.map(renderPurchase)
      ) : (
        <p className="credit-empty">No active purchases. Add an item to track its instalments.</p>
      )}
      {summary.archived.length > 0 && (
        <details className="purchase-archive">
          <summary>Archived purchases ({summary.archived.length})</summary>
          {summary.archived.map(renderPurchase)}
        </details>
      )}
    </section>
  );
}
