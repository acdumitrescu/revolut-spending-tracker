import { useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { parseBrdStatement, classifyBrdRow, summarizeBrd, manualBrdRow, brdImportMatches } from '../lib/brdStatement';
import ChartWrapper from './ChartWrapper';

const money = minor => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'RON' }).format(minor / 100);
const names = { income: 'Money received', expense: 'Expense', transfer: 'Own-account transfer', 'cash-withdrawal': 'Cash withdrawal', refund: 'Refund / debit reversal' };
const sign = row => row.direction === 'CRDT' || row.reversal ? '+' : '−';

export default function BrdCashflow({ month, setMonth }) {
  const { data, commitBrdStatement, setMoneyFlow, runtimeConfig, syncStatus } = useAppContext();
  const ledger = data.moneyFlow?.brd;
  const accounts = data.accounts.filter(account => account.name.trim().toUpperCase() === 'BRD' && account.currency === 'RON');
  const [preview, setPreview] = useState(null);
  const [accountId, setAccountId] = useState(ledger?.accountId || accounts[0]?.id || '');
  const [ownNames, setOwnNames] = useState((ledger?.ownRecipients || []).join('\n'));
  const [balance, setBalance] = useState('');
  const [balanceDate, setBalanceDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [reconciliation, setReconciliation] = useState({});
  const ready = !runtimeConfig.privateSyncEnabled || syncStatus.phase === 'synced';
  const ownRecipients = ownNames.split('\n').map(value => value.trim()).filter(Boolean);
  const rows = (ledger?.rows || []).filter(row => row.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  const totals = summarizeBrd(rows);
  const months = [...new Set((ledger?.rows || []).map(row => row.date.slice(0, 7)))].sort();
  const series = months.map(value => summarizeBrd(ledger.rows.filter(row => row.date.startsWith(value))));
  const matches = preview ? brdImportMatches(ledger?.rows || [], preview.rows) : [];
  function editManual(row, category = 'expense') {
    setError(''); setMessage('');
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setForm(row ? {...row, amount: (row.amountMinor / 100).toFixed(2)} : {date, category, beneficiary: '', notes: '', amount: '', direction: 'DBIT'});
  }
  function saveManual(event) {
    event.preventDefault(); setError('');
    try {
      if (!ready || busy) throw new Error('Wait for sync before saving.');
      if (!accounts.some(account => account.id === accountId)) throw new Error('Select an available BRD account.');
      const row = manualBrdRow(form);
      const current = ledger || {accountId, rows: [], imports: [], ownRecipients: []};
      if (form.id && !current.rows.some(item => item.id === form.id && item.source === 'manual')) throw new Error('Manual entry no longer exists. Reopen the form.');
      setMoneyFlow({...data.moneyFlow, brd: {...current, rows: form.id ? current.rows.map(item => item.id === row.id ? row : item) : [...current.rows, row]}});
      setMonth(row.date.slice(0, 7)); setForm(null); setMessage('Manual entry updated. Check the save status before closing. Confirmed balances are unchanged.');
    } catch (failure) { setError(failure.message); }
  }
  function deleteManual() {
    try {
      if (!ready || busy) throw new Error('Wait for sync before deleting.');
      setMoneyFlow({...data.moneyFlow, brd: {...ledger, rows: ledger.rows.filter(row => row.id !== removal.id || row.source !== 'manual')}});
      setRemoval(null); setMessage('Manual entry deleted. Confirmed balances are unchanged.');
    } catch (failure) { setError(failure.message); }
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    setPreview(null); setReconciliation({}); setError(''); setMessage('');
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Choose a BRD CSV under 5 MB.');
      const text = await file.text();
      const statement = await parseBrdStatement(text, ownRecipients);
      setPreview({ ...statement, text, fileName: file.name, importedAt: Date.now() });
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); event.target.value = ''; }
  }
  async function confirm() {
    setBusy(true); setError('');
    try {
      let balanceConfirmation = null;
      if (balance !== '') {
        if (!/^\d+(\.\d{1,2})?$/.test(balance) || !balanceDate) throw new Error('Enter a balance with at most two decimals and its confirmation date.');
        balanceConfirmation = { date: balanceDate, amountMinor: Math.round(Number(balance) * 100) };
      }
      const statement = await parseBrdStatement(preview.text, ownRecipients);
      const result = await commitBrdStatement({ statement, accountId, ownRecipients, fileName: preview.fileName, importedAt: preview.importedAt, balanceConfirmation, reconciliation });
      setMessage(`BRD: ${result.added} added, ${result.duplicates} already present. Check the save status before closing.`);
      setMonth(balanceConfirmation?.date.slice(0, 7) || statement.rows.map(row => row.date.slice(0, 7)).sort().at(-1));
      setPreview(null); setBalance(''); setBalanceDate('');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!accounts.length && !ledger) return null;
  return <section className="card brd-cashflow" aria-label="BRD income and expenses">
    <div className="flow-heading"><div><h3>BRD salary card · income & expenses</h3><p className="section-note">BRD imported and manual activity. Separate from Revolut and manual allocation receipts below; never added twice to their totals.</p></div>
      {ledger?.balanceConfirmation && <div><strong>{money(ledger.balanceConfirmation.amountMinor)}</strong><p>Confirmed balance · {ledger.balanceConfirmation.date}</p></div>}
    </div>
    <p className="section-note">A confirmed balance is a dated snapshot, not income minus expenses. Imported activity does not update other accounts or reconstruct missing opening balances.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    <div className="flow-actions">{['income', 'expense', 'transfer'].map(category => <button className="btn" key={category} disabled={!ready || busy || !!form} onClick={() => editManual(null, category)}>Add {category}</button>)}</div>
    {form && <form className="flow-form" aria-label="Manual BRD transaction" onSubmit={saveManual}>
      <fieldset disabled={busy || !ready}>
        <legend>{form.id ? 'Edit' : 'Add'} manual BRD transaction</legend>
        <label>Transaction type<select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>{Object.entries(names).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Transaction date<input className="input" type="date" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} /></label>
        <label>Amount (RON)<input className="input" required inputMode="decimal" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} /></label>
        <label>{form.category === 'transfer' ? 'Own-account destination / origin (optional)' : 'Counterparty'}<input className="input" maxLength={500} value={form.beneficiary} onChange={e => setForm({...form, beneficiary: e.target.value})} /></label>
        {form.category === 'transfer' && <label>Transfer direction<select className="input" value={form.direction} onChange={e => setForm({...form, direction: e.target.value})}><option value="DBIT">Out of BRD</option><option value="CRDT">Into BRD</option></select></label>}
        <label>Notes<textarea className="input" maxLength={2000} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} /></label>
        <p>Updates BRD activity only. No account balance is changed.</p>
        <button className="btn btn-primary" type="submit">Save BRD transaction</button>
        <button className="btn" type="button" onClick={() => setForm(null)}>Cancel transaction</button>
      </fieldset>
    </form>}
    {removal && <div role="alert"><p>Delete this manual entry: {removal.date} · {removal.beneficiary} · {money(removal.amountMinor)}? It will be removed from BRD totals and graphs.</p><button className="btn" disabled={!ready || busy} onClick={deleteManual}>Confirm delete</button><button className="btn" onClick={() => setRemoval(null)}>Keep transaction</button></div>}
    <details open={!ledger}><summary>Import BRD CSV</summary>
      <fieldset disabled={busy} className="flow-form">
        <label>BRD account<select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · RON</option>)}</select></label>
        <label>Own-account recipients (one exact statement name per line)<textarea className="input" rows={5} value={ownNames} onChange={e => setOwnNames(e.target.value)} /></label>
        <p className="section-note">Include all aliases used for your own bank, Revolut and brokerage accounts. Matching ignores case and extra spaces. ATM withdrawals are cash movements, not expenses.</p>
        <label>BRD transaction CSV<input type="file" accept=".csv,text/csv" onChange={upload} /></label>
        <label>Optional confirmed BRD balance (RON)<input className="input" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} /></label>
        <label>Balance confirmed on<input className="input" type="date" value={balanceDate} onChange={e => setBalanceDate(e.target.value)} /></label>
        <p className="section-note">Only a supplied balance updates the BRD month in Accounts → Balances. Leave blank to preserve all balances.</p>
      </fieldset>
      {preview && <div aria-label="Review BRD import">
        <p>{preview.rows.length} processed rows · {preview.skipped} non-processed rows excluded · {preview.rows.map(row => row.date).sort()[0]} to {preview.rows.map(row => row.date).sort().at(-1)}</p>
        <p>{preview.rows.filter(row => ledger?.rows.some(old => old.id === row.id)).length} already imported. Same-date identical payments are preserved by occurrence; this CSV has no bank transaction IDs. Review overlapping exports with differing numbers of identical payments.</p>
        <div className="brd-table"><table><caption>Classification preview</caption><thead><tr><th>Date</th><th>Counterparty</th><th>Amount</th><th>Classification</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.id}><td>{row.date}</td><td>{row.beneficiary || row.details}</td><td>{sign(row)}{money(row.amountMinor)}</td><td>{names[classifyBrdRow(row, ownRecipients)]}</td></tr>)}</tbody></table></div>
        {matches.length > 0 && <fieldset disabled={busy}><legend>Review possible manual matches</legend><p>Same date, amount and direction are only a possible match. Compare descriptions. Replacement preserves manual notes; statement details remain unchanged.</p>{matches.map(({row, candidates}) => <label key={row.id}>{row.date} · {row.beneficiary} · {row.details} · {money(row.amountMinor)}<select className="input" aria-label={`Match for ${row.id}`} value={reconciliation[row.id] || ''} onChange={e => setReconciliation({...reconciliation, [row.id]: e.target.value})}><option value="">Choose how to import</option><option value="keep">Keep both — different transactions</option>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>Replace manual: {candidate.beneficiary || 'No counterparty'} · {candidate.notes || 'No notes'}</option>)}</select></label>)}</fieldset>}
        <button className="btn btn-primary" disabled={busy || !ready || !accountId || !!form || matches.some(({row}) => !reconciliation[row.id])} onClick={confirm}>{busy ? 'Backing up and importing…' : 'Confirm BRD import'}</button>
        <button className="btn" disabled={busy} onClick={() => setPreview(null)}>Cancel BRD import</button>
      </div>}
    </details>
    {ledger && <>
      <div className="flow-actions"><label>BRD statement month<select className="input" value={month} onChange={e => setMonth(e.target.value)}>{[...new Set([...months, month])].sort().reverse().map(value => <option key={value}>{value}</option>)}</select></label></div>
      <p>{rows.length ? `${rows.length} recorded transactions in ${month}.` : `No BRD transactions recorded for ${month}; this does not establish zero activity.`} Latest transaction: {ledger.rows.map(row => row.date).sort().at(-1) || 'None'}. Recorded history may be incomplete.</p>
      <div className="flow-summary">{[['Money received', totals.income], ['Expenses', totals.expense], ['Refunds / reversals', totals.refund], ['Transfers out', totals.transfersOut], ['Transfers in', totals.transfersIn], ['Cash withdrawn', totals.cash], ['Net account movement', totals.net]].map(([label, value]) => <span key={label}>{label}<br /><strong>{rows.length ? money(value) : 'Not available'}</strong></span>)}</div>
      <p className="section-note">Expenses are before refunds; transfers and cash withdrawals are excluded. Negative debit entries are shown as refunds/reversals, not income. Money received includes all other credits, not necessarily salary. Net movement includes every imported debit and credit; it is not your account balance.</p>
      <ChartWrapper type="bar" currency="RON" height={280} data={{ labels: months, datasets: [
        { label: 'BRD money received', data: series.map(row => row.income / 100), backgroundColor: '#5bd6c7' },
        { label: 'BRD expenses', data: series.map(row => row.expense / 100), backgroundColor: '#ee8b82' },
        { label: 'Own-account transfers out', data: series.map(row => row.transfersOut / 100), backgroundColor: '#79aaf2' },
      ] }} />
      <details><summary>BRD transaction details · {rows.length}</summary><div className="brd-table"><table><thead><tr><th>Date</th><th>Counterparty / description</th><th>Amount</th><th>Classification</th><th>Source / actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td>{row.date}</td><td>{row.beneficiary}<small>{row.details}</small>{row.notes && <small>Notes: {row.notes}</small>}</td><td>{sign(row)}{money(row.amountMinor)}</td>
        <td>{row.source === 'manual' ? names[row.category] : <select disabled={!ready || busy} aria-label={`Classification for ${row.date} ${row.beneficiary || row.details}`} className="input" value={row.category} onChange={e => setMoneyFlow({ ...data.moneyFlow, brd: { ...ledger, rows: ledger.rows.map(item => item.id === row.id ? { ...item, category: e.target.value } : item) } })}>{(row.reversal ? ['refund', 'transfer'] : row.direction === 'CRDT' ? ['income', 'transfer'] : ['expense', 'transfer', 'cash-withdrawal']).map(value => <option key={value} value={value}>{names[value]}</option>)}</select>}</td>
        <td>{row.source === 'manual' ? <><span>Manual</span><button className="btn" disabled={!ready || busy || !!form} onClick={() => editManual(row)}>Edit</button><button className="btn" disabled={!ready || busy || !!form} onClick={() => setRemoval(row)}>Delete</button></> : 'CSV import'}</td>
      </tr>)}</tbody></table></div></details>
      <details><summary>BRD import history</summary>{ledger.imports.map(batch => <p key={batch.id}>{batch.fileName} · {new Date(batch.importedAt).toLocaleDateString()} · {batch.added} added, {batch.duplicates} already present</p>)}</details>
    </>}
  </section>;
}
