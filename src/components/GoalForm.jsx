import { useState } from 'react';
import { accountGroup } from '../../backend/accountGroups.js';
import { SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';

// `takenBy` maps an account id to the name of another goal that already uses it.
export default function GoalForm({
  initial,
  accounts,
  takenBy = {},
  onSubmit,
  onCancel,
  submitLabel,
  today,
}) {
  const [name, setName] = useState(initial?.name || '');
  const [targetAmount, setTargetAmount] = useState(initial ? String(initial.targetAmount) : '');
  const [currency, setCurrency] = useState(initial?.currency || 'RON');
  const [targetMonth, setTargetMonth] = useState(initial?.targetMonth || '');
  const [note, setNote] = useState(initial?.note || '');
  const [linked, setLinked] = useState(initial?.linkedAccountIds || []);
  const [error, setError] = useState('');

  const fundable = accounts.filter((account) => accountGroup(account) !== 'credit');
  const toggle = (id) =>
    setLinked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const submit = (event) => {
    event.preventDefault();
    const amount = Number(targetAmount);
    if (!name.trim()) return setError('Give the goal a name.');
    if (!(amount > 0)) return setError('The target must be more than zero.');
    if (targetMonth && targetMonth < today.slice(0, 7) && !initial)
      return setError('Pick a target month that is not in the past, or leave it empty.');
    setError('');
    onSubmit({
      name: name.trim(),
      targetAmount: amount,
      currency,
      targetMonth,
      note: note.trim(),
      linkedAccountIds: linked,
    });
  };

  return (
    <form className="goal-form" onSubmit={submit}>
      <label className="goal-field goal-field-wide">
        <span>Name</span>
        <input
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Emergency fund, holiday, taxes…"
          autoFocus
        />
      </label>
      <label className="goal-field">
        <span>Target</span>
        <input
          className="input"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={targetAmount}
          onChange={(event) => setTargetAmount(event.target.value)}
        />
      </label>
      <label className="goal-field">
        <span>Currency</span>
        <select
          className="input"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
        >
          {SUPPORTED_DISPLAY_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <label className="goal-field">
        <span>
          Reach it by <small>(optional)</small>
        </span>
        <input
          className="input"
          type="month"
          value={targetMonth}
          onChange={(event) => setTargetMonth(event.target.value)}
        />
      </label>
      <label className="goal-field goal-field-wide">
        <span>
          Note <small>(optional)</small>
        </span>
        <input
          className="input"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <fieldset className="goal-field goal-field-wide goal-accounts">
        <legend>Accounts that fund this goal</legend>
        {fundable.length === 0 ? (
          <p className="section-note">Add an account on the Balances page to link it here.</p>
        ) : (
          fundable.map((account) => {
            const other = takenBy[account.id];
            return (
              <label key={account.id} className={`goal-account${other ? ' is-taken' : ''}`}>
                <input
                  type="checkbox"
                  checked={linked.includes(account.id)}
                  disabled={Boolean(other)}
                  onChange={() => toggle(account.id)}
                />
                <span>
                  {account.name} <small>{account.currency || 'RON'}</small>
                </span>
                {other && <em>used by “{other}”</em>}
              </label>
            );
          })
        )}
        <p className="section-note">
          The latest balance of each linked account counts toward this goal. An account can fund one
          goal only, so the same money is never counted twice.
        </p>
      </fieldset>

      {error && (
        <p className="goal-error" role="alert">
          {error}
        </p>
      )}
      <div className="goal-form-actions">
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
