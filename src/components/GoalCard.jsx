import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import ChartWrapper from './ChartWrapper';
import GoalForm from './GoalForm';
import { formatCurrency } from '../lib/utils';
import { getGoalChart, STATUS_LABELS } from '../lib/goals';

const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
const STATUS_TONE = { complete: 'good', 'on-track': 'good', progressing: 'good', behind: 'warn', overdue: 'bad', stalled: 'warn', 'no-history': 'muted' };

export default function GoalCard({ item, index, count, accounts, takenBy, fxRates, today, onUpdate, onMove, onRemove, onAddContribution, onRemoveContribution }) {
  const { goal, linkedAccounts, currency } = item;
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [entry, setEntry] = useState({ amount: '', date: today, note: '', direction: 1 });
  const money = (value) => formatCurrency(value, currency);

  const chart = useMemo(() => getGoalChart(goal, linkedAccounts, item, { fxRates }), [goal, linkedAccounts, item, fxRates]);
  const chartData = {
    labels: chart.months.map(monthLabel),
    datasets: [
      { label: 'Saved', data: chart.actual, borderColor: '#4aa3ff', backgroundColor: 'rgba(74,163,255,0.12)', fill: true, tension: 0.25, pointRadius: 2, spanGaps: false },
      { label: 'At your pace', data: chart.projected, borderColor: '#67e2c8', borderDash: [6, 4], tension: 0, pointRadius: 0, spanGaps: false },
      { label: 'Needed for the date', data: chart.needed, borderColor: '#f5b14c', borderDash: [2, 4], tension: 0, pointRadius: 0, spanGaps: false },
      { label: 'Target', data: chart.targetLine, borderColor: 'rgba(255,255,255,0.35)', borderWidth: 1, pointRadius: 0 },
    ],
  };

  const addEntry = (event) => {
    event.preventDefault();
    const amount = Number(entry.amount);
    if (!amount || !entry.date) return;
    onAddContribution(goal.id, { id: crypto.randomUUID(), date: entry.date, amount: amount * entry.direction, note: entry.note.trim() });
    setEntry({ ...entry, amount: '', note: '' });
  };

  const circumference = 2 * Math.PI * 42;
  const contributions = [...(goal.contributions || [])].sort((a, b) => b.date.localeCompare(a.date));

  if (editing) {
    return (
      <article className="card goal-card">
        <h3 className="goal-card-title">Edit goal</h3>
        <GoalForm initial={goal} accounts={accounts} takenBy={takenBy} today={today} submitLabel="Save changes"
          onCancel={() => setEditing(false)} onSubmit={(changes) => { onUpdate(goal.id, changes); setEditing(false); }} />
      </article>
    );
  }

  return (
    <article className="card goal-card" aria-label={goal.name}>
      <header className="goal-card-head">
        <div>
          <h3 className="goal-card-title">{goal.name}</h3>
          <p className="goal-card-sub">
            {money(item.target)}{goal.targetMonth ? ` by ${monthLabel(goal.targetMonth)}` : ' · no target date'}
            {linkedAccounts.length > 0 && ` · ${linkedAccounts.map((account) => account.name).join(', ')}`}
          </p>
          {goal.note && <p className="goal-card-note">{goal.note}</p>}
        </div>
        <div className="goal-card-tools">
          <span className={`goal-status tone-${STATUS_TONE[item.status]}`}>{STATUS_LABELS[item.status]}</span>
          <button type="button" className="btn" onClick={() => onMove(goal.id, -1)} disabled={index === 0} aria-label={`Move ${goal.name} up`}><ArrowUp size={14} /></button>
          <button type="button" className="btn" onClick={() => onMove(goal.id, 1)} disabled={index === count - 1} aria-label={`Move ${goal.name} down`}><ArrowDown size={14} /></button>
          <button type="button" className="btn" onClick={() => setEditing(true)} aria-label={`Edit ${goal.name}`}><Pencil size={14} /></button>
          {confirmDelete ? (
            <>
              <button type="button" className="btn goal-danger" onClick={() => onRemove(goal.id)}>Delete goal</button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="btn goal-danger" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${goal.name}`}><Trash2 size={14} /></button>
          )}
        </div>
      </header>

      <div className="goal-card-body">
        <svg className="goal-ring" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label={`${Math.round(item.progress * 100)}% funded`}>
          <circle cx="60" cy="60" r="42" fill="none" stroke="var(--surface3)" strokeWidth="12" />
          <circle cx="60" cy="60" r="42" fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - item.progress)} transform="rotate(-90 60 60)" />
          <text x="60" y="56" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--text)">{Math.round(item.progress * 100)}%</text>
          <text x="60" y="75" textAnchor="middle" fontSize="11" fill="var(--muted)">funded</text>
        </svg>

        <dl className="goal-stats">
          <div><dt>Saved</dt><dd>{money(item.saved)}</dd></div>
          <div><dt>Remaining</dt><dd>{money(item.remaining)}</dd></div>
          <div><dt>Needed per month</dt><dd>{item.requiredMonthly === null ? '—' : money(item.requiredMonthly)}</dd></div>
          <div><dt>Your pace</dt><dd>{item.complete ? '—' : item.pace === null ? 'Needs two dated entries' : `${item.pace >= 0 ? '' : '−'}${money(Math.abs(item.pace))} / month`}</dd></div>
          <div><dt>At that pace</dt><dd>{item.complete ? 'Done' : item.projectedMonth ? `Reached ${monthLabel(item.projectedMonth)}` : '—'}</dd></div>
          <div><dt>From</dt><dd>{money(item.linkedSaved)} accounts · {money(item.contributed)} added</dd></div>
        </dl>
      </div>

      {item.missingBalances > 0 && <p className="section-note">{item.missingBalances} linked account{item.missingBalances > 1 ? 's have' : ' has'} no balance recorded yet.</p>}

      {!item.complete && (
        <div className="goal-chart" aria-label={`Projection for ${goal.name}`}>
          <ChartWrapper type="line" data={chartData} height={220} currency={currency} showLegend />
        </div>
      )}

      <details className="goal-contributions">
        <summary>Money added by hand ({contributions.length})</summary>
        <p className="section-note">Use this for savings held outside the linked accounts, such as cash. Do not repeat money already in a linked account.</p>
        <form className="goal-contribution-form" onSubmit={addEntry}>
          <select className="input" aria-label="Add or take out" value={entry.direction} onChange={(event) => setEntry({ ...entry, direction: Number(event.target.value) })}>
            <option value={1}>Add</option>
            <option value={-1}>Take out</option>
          </select>
          <input className="input" type="number" min="0" step="any" inputMode="decimal" placeholder={`Amount (${currency})`} aria-label="Amount" value={entry.amount} onChange={(event) => setEntry({ ...entry, amount: event.target.value })} />
          <input className="input" type="date" aria-label="Date" value={entry.date} onChange={(event) => setEntry({ ...entry, date: event.target.value })} />
          <input className="input" placeholder="Note (optional)" aria-label="Contribution note" maxLength={200} value={entry.note} onChange={(event) => setEntry({ ...entry, note: event.target.value })} />
          <button type="submit" className="btn btn-primary"><Plus size={14} /> Save</button>
        </form>
        {contributions.length > 0 && (
          <ul className="goal-contribution-list">
            {contributions.map((row) => (
              <li key={row.id}>
                <span>{row.date}</span>
                <strong className={row.amount < 0 ? 'neg' : 'pos'}>{row.amount < 0 ? '−' : '+'}{money(Math.abs(row.amount))}</strong>
                <span className="goal-contribution-note">{row.note}</span>
                <button type="button" className="btn" onClick={() => onRemoveContribution(goal.id, row.id)} aria-label={`Remove ${row.date} entry`}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}
