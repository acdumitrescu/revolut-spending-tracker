import { useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { BASE_CURRENCY, convertAmountToDisplay } from '../lib/fx';
import { getLatestAccountTotal } from '../lib/selectors';

export default function Goals() {
  const { data, addGoal, removeGoal } = useAppContext();
  const displayCurrency = data.displayCurrency;
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetMonth, setTargetMonth] = useState('');

  const trackedSavings = getLatestAccountTotal(data.accounts, { displayCurrency, fxRates: data.fxRates });
  const trackedSavingsBase = getLatestAccountTotal(data.accounts, { displayCurrency: BASE_CURRENCY, fxRates: data.fxRates });

  const handleAddGoal = () => {
    const amount = Number(targetAmount);
    if (!name.trim() || amount <= 0) return;
    addGoal({
      id: Date.now().toString(),
      name: name.trim(),
      targetAmount: amount,
      targetMonth,
    });
    setName('');
    setTargetAmount('');
    setTargetMonth('');
  };

  return (
    <div className="page-stack goals-page">
      <h2>Savings Goals</h2>

      <div className="kpi-grid">
        <div className="kpi blue">
          <div className="lbl">Tracked Savings Base</div>
          <div className="val">{formatCurrency(trackedSavings, displayCurrency)}</div>
        </div>
      </div>

      <div className="card goal-create-card">
        <div className="card-title">Create Goal</div>
        <div className="goal-form-row">
          <input className="input" placeholder="Emergency fund, travel, taxes..." value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" type="number" placeholder="Target amount in RON" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
          <input className="input" type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
          <button className="btn btn-primary" onClick={handleAddGoal}><Plus size={16} /> Add</button>
        </div>
        <div className="goal-form-note">
          Goal targets are stored in RON. Progress is based on your explicitly entered account balances, then converted for display.
        </div>
      </div>

      <div className="grid2">
        {data.goals.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><Target size={22} /></div>
              <div className="empty-state-title">No goals yet</div>
              <div className="empty-state-desc">Add a target above to track progress against your saved balances.</div>
            </div>
          </div>
        ) : (
          data.goals.map((goal) => {
            const convertedTargetAmount = convertAmountToDisplay(goal.targetAmount, BASE_CURRENCY, displayCurrency, data.fxRates);
            const progress = Math.min((trackedSavingsBase / goal.targetAmount) * 100, 100);
            const circumference = 2 * Math.PI * 42;
            const offset = circumference * (1 - progress / 100);
            return (
              <div key={goal.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '18px' }}>{goal.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Target: {formatCurrency(convertedTargetAmount, displayCurrency)}{goal.targetMonth ? ` by ${goal.targetMonth}` : ''}
                    </div>
                  </div>
                  <button className="btn" onClick={() => removeGoal(goal.id)} style={{ padding: '4px 8px', color: 'var(--red)', borderColor: 'transparent' }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="42" fill="none" stroke="var(--surface3)" strokeWidth="12" />
                    <circle
                      cx="60"
                      cy="60"
                      r="42"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      transform="rotate(-90 60 60)"
                    />
                    <text x="60" y="54" textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--text)">{Math.round(progress)}%</text>
                    <text x="60" y="74" textAnchor="middle" fontSize="11" fill="var(--muted)">funded</text>
                  </svg>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span>Current tracked savings</span>
                  <strong>{formatCurrency(trackedSavings, displayCurrency)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '8px' }}>
                  <span>Remaining</span>
                  <strong>{formatCurrency(Math.max(convertedTargetAmount - trackedSavings, 0), displayCurrency)}</strong>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
