import { useState } from 'react';
import { CalendarClock, Plus, Pencil, Repeat2, TrendingUp, Wallet } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { SubscriptionSchema } from '../lib/validation';
import { BASE_CURRENCY, SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
import { BILLING_CYCLES, localDateKey, renewalStatus, subscriptionSummary } from '../lib/subscriptions';
import { BUNDLED_ICONS, NO_ICON, imageFileToIcon, resolveSubscriptionIcon } from '../lib/subscriptionIcons';
import './Subscriptions.css';

const formatPrice = (amount, currency) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

function SubscriptionAvatar({ record }) {
  const icon = resolveSubscriptionIcon(record);
  const fallback = { background: `hsl(${[...record.name].reduce((hue, char) => hue + char.charCodeAt(0), 0) % 360} 55% 40%)` };
  if (icon?.kind === 'image') return <span className="subscription-avatar has-icon" aria-hidden="true"><img src={icon.src} alt="" /></span>;
  if (icon?.kind === 'brand') return <span className="subscription-avatar has-icon" aria-hidden="true" style={{ background: `#${icon.hex}` }}><svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d={icon.path} /></svg></span>;
  return <span className="subscription-avatar" aria-hidden="true" style={fallback}>{record.name.trim().charAt(0).toUpperCase() || '?'}</span>;
}

function SubscriptionEditor({ record, onSave, onCancel }) {
  const [draft, setDraft] = useState(record);
  const [error, setError] = useState('');
  const update = field => event => setDraft(current => ({ ...current, [field]: event.target.value }));
  const uploadIcon = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { const icon = await imageFileToIcon(file); setDraft(current => ({ ...current, icon })); setError(''); } catch (uploadError) { setError(uploadError.message); }
  };
  const iconChoice = draft.icon.startsWith('data:image/') ? 'upload' : draft.icon;
  function save(event) {
    event.preventDefault();
    const result = SubscriptionSchema.safeParse({ ...draft, amount: draft.amount === '' ? NaN : Number(draft.amount) });
    if (!result.success) { setError('Enter a name, a valid renewal date, and a non-negative price with at most two decimal places.'); return; }
    try { onSave(result.data); } catch (saveError) { setError(saveError.message); }
  }
  return <form className="subscription-editor" onSubmit={save} aria-label="Subscription editor">
    <h3>Subscription details</h3>
    <div className="subscription-form-grid">
      <label>Subscription name<input autoFocus className="input" required maxLength={160} value={draft.name} onChange={update('name')} placeholder="e.g. Music, cloud storage, gym" /></label>
      <label>Price per billing cycle<input className="input" type="number" min="0" max="1000000000" step="0.01" required value={draft.amount} onChange={update('amount')} placeholder="0.00" /></label>
      <label>Currency<select className="input" value={draft.currency} onChange={update('currency')}>{SUPPORTED_DISPLAY_CURRENCIES.map(currency => <option key={currency}>{currency}</option>)}</select></label>
      <label>Billing cycle<select className="input" value={draft.cycle} onChange={update('cycle')}>{Object.entries(BILLING_CYCLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Next renewal<input className="input" type="date" required value={draft.nextRenewal} onChange={update('nextRenewal')} /></label>
      <label>Status<select className="input" value={draft.status} onChange={update('status')}><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></label>
      <div className="subscription-icon-field">
        <span>Icon</span>
        <div className="subscription-icon-row">
          <SubscriptionAvatar record={draft} />
          <select className="input" aria-label="Icon" value={iconChoice} onChange={event => event.target.value !== 'upload' && setDraft(current => ({ ...current, icon: event.target.value }))}>
            <option value="">Automatic (match by name)</option>
            <option value={NO_ICON}>Letter only</option>
            {draft.icon.startsWith('data:image/') && <option value="upload">Uploaded image</option>}
            {Object.keys(BUNDLED_ICONS).sort().map(key => <option key={key} value={key}>{key}</option>)}
          </select>
          <label className="btn subscription-icon-upload">Upload<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadIcon} hidden /></label>
        </div>
      </div>
      <label className="subscription-notes-field">Notes<textarea className="input" rows={2} maxLength={2000} value={draft.notes} onChange={update('notes')} placeholder="Plan, payment method, or cancellation instructions" /></label>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="subscription-actions"><button className="btn btn-primary" type="submit">Save subscription</button><button className="btn" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

export default function Subscriptions() {
  const { data, upsertSubscription } = useAppContext();
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [message, setMessage] = useState('');
  const records = data.subscriptions || [];
  const today = localDateKey();
  const summary = subscriptionSummary(records, data.displayCurrency, data.fxRates, today);
  const visible = records.filter(record => (status === 'all' || record.status === status)
    && `${record.name} ${record.notes}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.nextRenewal.localeCompare(b.nextRenewal) || a.name.localeCompare(b.name));
  const money = amount => formatPrice(amount, data.displayCurrency);
  const save = record => { upsertSubscription(record); setEditing(null); setMessage('Subscription updated. Check the workspace save indicator for persistence.'); };
  const add = () => { setMessage(''); setEditing({ id: globalThis.crypto.randomUUID(), name: '', amount: '', currency: BASE_CURRENCY, cycle: 'monthly', nextRenewal: today, status: 'active', icon: '', notes: '' }); };

  return <div className="page-stack subscriptions-page">
    <header className="subscription-heading"><div><div className="eyebrow">YOUR REPEATING COSTS</div><h2>Subscriptions</h2><p>Keep your plans, prices, and renewal dates in one place.</p></div><button className="btn btn-primary" onClick={add} disabled={!!editing}><Plus size={17} aria-hidden="true" />Add subscription</button></header>
    <div className="subscription-kpis">
      <div className="kpi blue"><div className="lbl"><Wallet size={14} aria-hidden="true" /> Monthly equivalent</div><div className="val">{money(summary.monthly)}</div><p>{summary.active} active subscription{summary.active === 1 ? '' : 's'}</p></div>
      <div className="kpi"><div className="lbl"><TrendingUp size={14} aria-hidden="true" /> Yearly equivalent</div><div className="val">{money(summary.yearly)}</div><p>At your current prices and billing cycles</p></div>
      <div className="kpi"><div className="lbl"><CalendarClock size={14} aria-hidden="true" /> Next renewals · 30 days</div><div className="val">{money(summary.nextRenewals)}</div><p>{summary.upcoming} subscription{summary.upcoming === 1 ? '' : 's'} · one next charge per plan</p></div>
    </div>
    <p className="section-note">Totals include active plans only and use your configured FX rates. Weekly plans use 52 payments per year. This tracker does not create transactions or cancel services; update the next date after renewal.</p>
    {summary.needsReview > 0 && <p className="subscription-review" role="status">{summary.needsReview} active subscription{summary.needsReview === 1 ? ' has' : 's have'} a past renewal date. Review the date; these charges are excluded from upcoming renewals.</p>}
    {message && <p role="status" className="section-note">{message}</p>}
    {editing && <SubscriptionEditor key={editing.id} record={editing} onSave={save} onCancel={() => setEditing(null)} />}
    <section className="card" aria-label="Subscription list">
      <div className="subscription-toolbar"><h3>Your subscriptions <span>({records.length})</span></h3><label>Search<input className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or notes" /></label><label>Show status<select className="input" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></label></div>
      {records.length === 0 ? <div className="subscription-empty"><Repeat2 size={30} aria-hidden="true" /><h3>No subscriptions yet</h3><p>Add your first plan to see its monthly cost and next renewal.</p></div> : visible.length === 0 ? <p className="subscription-empty">No subscriptions match these filters.</p> : <div className="subscription-records">{visible.map(record => <article className="subscription-record" key={record.id} aria-label={record.name}>
        <div className="subscription-record-heading"><div className="subscription-identity"><SubscriptionAvatar record={record} /><div><h4>{record.name}</h4><span className="subscription-cycle"><Repeat2 size={12} aria-hidden="true" /> {BILLING_CYCLES[record.cycle]}</span></div></div><span className={`subscription-badge${record.status === 'active' && record.nextRenewal < today ? ' review' : ''}`}>{renewalStatus(record, today)}</span></div>
        <dl><div><dt>Price per cycle</dt><dd>{formatPrice(record.amount, record.currency)}</dd></div><div><dt><CalendarClock size={12} aria-hidden="true" /> {record.status === 'active' ? 'Next renewal' : 'Last entered renewal'}</dt><dd><time dateTime={record.nextRenewal}>{record.nextRenewal}</time></dd></div></dl>
        {record.notes && <p className="subscription-notes">{record.notes}</p>}
        <button className="btn" disabled={!!editing} aria-label={`Edit ${record.name}`} onClick={() => { setMessage(''); setEditing(record); }}><Pencil size={14} aria-hidden="true" />Edit</button>
      </article>)}</div>}
    </section>
  </div>;
}
