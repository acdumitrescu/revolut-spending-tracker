import { useState } from 'react';
import { formatCurrency } from '../lib/utils';

import { needsBalanceConfirmation } from '../lib/balanceSafety';

export default function BalanceInput({ accountName, month, value, referenceValue = value, currency = 'RON', onCommit }) {
  const [draft, setDraft] = useState(value ?? '');
  const [pending, setPending] = useState(false);
  const cancel = () => { setDraft(value ?? ''); setPending(false); };
  return <div>
    <input type="number" step="0.01" className="input" aria-label={`${accountName} balance for ${month}`} placeholder="Not entered" value={draft}
      onChange={event => { setDraft(event.target.value); setPending(false); }}
      onBlur={event => {
        if (!event.target.validity.valid) { cancel(); return; }
        if (String(draft) === String(value ?? '')) return;
        if (needsBalanceConfirmation(referenceValue, draft)) setPending(true);
        else onCommit(draft);
      }}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') cancel(); }}
      style={{width:'100%',padding:'4px 8px',fontSize:'12px'}} />
    {pending && <div role="group" aria-label={`Confirm balance for ${accountName} ${month}`}>
      <p>Review balance change: {referenceValue === undefined ? 'Not entered' : formatCurrency(referenceValue, currency)} → {draft === '' ? 'Not entered' : formatCurrency(Number(draft), currency)}.</p>
      <button className="btn" type="button" onClick={() => { onCommit(draft); setPending(false); }}>Confirm balance</button>
      <button className="btn" type="button" onClick={cancel}>Cancel change</button>
    </div>}
  </div>;
}
