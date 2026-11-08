import { useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import GoalCard from '../components/GoalCard';
import GoalForm from '../components/GoalForm';
import { assignGoalAccounts, computeGoals, totalSavedInCurrency } from '../lib/goals';
import './Goals.css';

const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function Goals() {
  const { data, addGoal, updateGoal, removeGoal, moveGoal, addGoalContribution, removeGoalContribution } = useAppContext();
  const [now] = useState(() => new Date());
  const [creating, setCreating] = useState(false);
  const displayCurrency = data.displayCurrency;
  const today = isoDate(now);

  const results = useMemo(() => computeGoals(data.goals, data.accounts, { fxRates: data.fxRates, now }), [data.goals, data.accounts, data.fxRates, now]);
  const takenBy = useMemo(() => {
    const assigned = assignGoalAccounts(data.goals, data.accounts);
    const names = Object.fromEntries(data.goals.map((goal) => [goal.id, goal.name]));
    const owners = {};
    for (const [goalId, accounts] of assigned) accounts.forEach((account) => { owners[account.id] = names[goalId]; });
    return owners;
  }, [data.goals, data.accounts]);

  const totalTarget = results.reduce((sum, item) => sum + totalSavedInCurrency([{ saved: item.target, currency: item.currency }], displayCurrency, data.fxRates), 0);
  const totalSaved = totalSavedInCurrency(results, displayCurrency, data.fxRates);
  const attention = results.filter((item) => ['behind', 'overdue'].includes(item.status)).length;
  const reached = results.filter((item) => item.complete).length;

  const create = (fields) => {
    addGoal({ id: crypto.randomUUID(), createdAt: today, contributions: [], ...fields });
    setCreating(false);
  };

  // A goal's own takenBy excludes its own accounts so they stay selectable while editing.
  const takenByOthers = (goalId) => Object.fromEntries(Object.entries(takenBy).filter(([accountId]) => !results.find((item) => item.goal.id === goalId)?.linkedAccounts.some((account) => account.id === accountId)));

  return (
    <div className="page-stack goals-page">
      <header className="goals-head">
        <div>
          <h2>Savings Goals</h2>
          <p className="section-note">Each goal is funded by its own accounts and hand-added money, so progress is never shared between goals.</p>
        </div>
        {!creating && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New goal</button>}
      </header>

      {results.length > 0 && (
        <div className="kpi-grid goals-kpis">
          <div className="kpi blue"><div className="lbl">Saved toward goals</div><div className="val">{formatCurrency(totalSaved, displayCurrency)}</div></div>
          <div className="kpi"><div className="lbl">Total targets</div><div className="val">{formatCurrency(totalTarget, displayCurrency)}</div></div>
          <div className="kpi"><div className="lbl">Goals reached</div><div className="val">{reached} / {results.length}</div></div>
          <div className={`kpi${attention ? ' red' : ''}`}><div className="lbl">Need attention</div><div className="val">{attention}</div></div>
        </div>
      )}

      {creating && (
        <section className="card goal-create-card" aria-label="Create goal">
          <h3 className="card-title">New goal</h3>
          <GoalForm accounts={data.accounts} takenBy={takenBy} today={today} submitLabel="Create goal" onCancel={() => setCreating(false)} onSubmit={create} />
        </section>
      )}

      {results.length === 0 && !creating ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Target size={22} /></div>
            <div className="empty-state-title">No goals yet</div>
            <div className="empty-state-desc">Create a goal, link the accounts that fund it, and see what you need to save each month.</div>
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New goal</button>
          </div>
        </div>
      ) : (
        <div className="goals-list">
          {results.map((item, index) => (
            <GoalCard key={item.goal.id} item={item} index={index} count={results.length} accounts={data.accounts}
              takenBy={takenByOthers(item.goal.id)} fxRates={data.fxRates} today={today}
              onUpdate={updateGoal} onMove={moveGoal} onRemove={removeGoal}
              onAddContribution={addGoalContribution} onRemoveContribution={removeGoalContribution} />
          ))}
        </div>
      )}
    </div>
  );
}
