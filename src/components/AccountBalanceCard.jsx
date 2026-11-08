import { useState } from 'react';
import { ChevronDown, MessageSquare, Trash2, Wallet } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { convertAmountToDisplay, SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
import { getAccountCurrency } from '../lib/selectors';
import BalanceInput from './BalanceInput';
import { ACCOUNT_GROUPS, ACCOUNT_GROUP_LABELS, accountGroup } from '../../backend/accountGroups.js';

export default function AccountBalanceCard({ account, months, displayCurrency, fxRates, asOfMonth, currentMonth, onBalance, onNote, onCurrency, onDelete, onGroup, onUndo }) {
  const [lastEdit, setLastEdit] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currency = getAccountCurrency(account);
  const recorded = Object.keys(account.balances).sort();
  const latest = recorded.at(-1);
  const previous = recorded.at(-2);
  const balance = latest ? account.balances[latest] : null;
  const change = previous ? balance - account.balances[previous] : null;
  const percentage = previous && account.balances[previous] !== 0 ? change / Math.abs(account.balances[previous]) * 100 : null;
  const freshness = !latest ? 'No balance yet' : latest > currentMonth ? 'Future entry' : latest === currentMonth ? 'Updated this month' : latest < asOfMonth ? 'Carried forward' : 'Not updated this month';

  return (
    <details className="account-disclosure" onToggle={(event) => { if (!event.currentTarget.open) setConfirmDelete(false); }}>
      <summary className="account-summary" aria-label={`Edit balances for ${account.name}`}>
        <span className="account-identity">
          <span className="account-avatar"><Wallet size={18} aria-hidden="true" /></span>
          <span><strong className="account-name">{account.name}</strong><span className="account-currency-tag">{currency} account</span></span>
        </span>
        <span className="account-metric account-primary-value">
          <span>Latest balance</span>
          <strong>{balance === null ? '—' : formatCurrency(balance, currency)}</strong>
          {balance !== null && currency !== displayCurrency && <small>{formatCurrency(convertAmountToDisplay(balance, currency, displayCurrency, fxRates), displayCurrency)} equivalent</small>}
        </span>
        <span className="account-metric">
          <span>{previous ? `Change since ${previous}` : 'Balance change'}</span>
          <strong>{change === null ? '—' : `${change > 0 ? '+' : ''}${formatCurrency(change, currency)}`}</strong>
          {percentage !== null && <small>{percentage > 0 ? '+' : ''}{percentage.toFixed(1)}%</small>}
        </span>
        <span className="account-metric account-freshness">
          <span>Last recorded</span><strong>{latest || 'Not entered'}</strong>
          <small className={latest === currentMonth ? 'account-current' : ''}>{freshness}</small>
        </span>
        <span className="account-edit-affordance"><span className="account-edit-label">Edit balances</span><span className="account-close-label">Close editor</span><ChevronDown size={16} aria-hidden="true" /></span>
      </summary>
      <div className="account-editor">
        <div className="account-editor-heading"><div><h3>Monthly balances</h3><p>Enter amounts in {currency}. Balances save on Enter or when you leave a field. Blank means not entered.</p></div></div>
        {lastEdit && <div role="status"><p>Last edit: {lastEdit.month}. Undo is available while this editor remains mounted.</p><button className="btn" disabled={(account.balances[lastEdit.month] ?? null) !== lastEdit.expected} onClick={() => { onUndo(account.id, lastEdit.month, lastEdit.previous, lastEdit.expected); setLastEdit(null); }}>Undo last balance change</button></div>}
        <div className="account-month-scroll" role="region" aria-label={`${account.name} monthly balances`} tabIndex={0}>
          <div className="account-month-grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(140px, 1fr))` }}>
            {months.map((month) => (
              <div className={`account-month${month === currentMonth ? ' is-current' : ''}`} key={month}>
                <details className="account-note">
                  <summary aria-label={`${account.name} note for ${month}: ${account.notes?.[month] ? 'edit note' : 'add note'}`} title={account.notes?.[month] || 'Add a note'}>
                    <MessageSquare size={13} aria-hidden="true" /><span>{account.notes?.[month] || 'Add note'}</span>
                  </summary>
                  <textarea className="input" aria-label={`${account.name} note for ${month}`} placeholder="What changed this month?" value={account.notes?.[month] || ''} onChange={(event) => onNote(account.id, month, event.target.value)} rows={3} />
                </details>
                <span className="account-month-label">{month}{month === currentMonth && <small>Current</small>}</span>
                <BalanceInput key={`${month}:${account.balances[month] ?? 'missing'}`} accountName={account.name} month={month} value={account.balances[month]} currency={currency} referenceValue={account.balances[month] ?? account.balances[recorded.filter(entry => entry < month).at(-1)]} onCommit={(value) => { setLastEdit({month,previous:account.balances[month] ?? null,expected:value === '' ? null : Number(value)}); onBalance(account.id, month, value); }} />
              </div>
            ))}
          </div>
        </div>
        <details className="account-settings">
          <summary>Account settings</summary>
          <div className="account-settings-content">
            <label>Account group<select className="input" aria-label={`${account.name} account group`} value={accountGroup(account)} onChange={event => onGroup(account.id, event.target.value)}>{ACCOUNT_GROUPS.map(group => <option key={group} value={group}>{ACCOUNT_GROUP_LABELS[group]}</option>)}</select></label>
            <label>Account currency
              <select className="input" aria-label={`${account.name} account currency`} value={currency} disabled={recorded.length > 0} onChange={(event) => onCurrency(account.id, event.target.value)}>
                {SUPPORTED_DISPLAY_CURRENCIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <p>{recorded.length ? 'Currency is fixed while recorded balances exist, to protect their meaning.' : 'Choose the currency before entering your first balance.'}</p>
            <button className="btn account-delete" aria-label={`Delete ${account.name}`} onClick={() => setConfirmDelete(true)}><Trash2 size={15} aria-hidden="true" /> Delete account</button>
          </div>
          {confirmDelete && <div className="account-delete-confirm" role="group" aria-label={`Confirm deletion of ${account.name}`}>
            <p>Delete {account.name} and all its balances and notes? This cannot be undone here. Keep a backup first.</p>
            <button className="btn" onClick={() => setConfirmDelete(false)}>Keep account</button>
            <button className="btn account-delete" onClick={() => onDelete(account.id)}>Confirm delete</button>
          </div>}
        </details>
      </div>
    </details>
  );
}
