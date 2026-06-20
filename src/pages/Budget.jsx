import { useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency, EXPENSE_CATS } from '../lib/utils';
import { getBudgetEntries, getUniqueMonths } from '../lib/selectors';
import { X, Plus, WalletCards } from 'lucide-react';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { EmptyState } from '../components/ui';

export default function Budget() {
  const { data, setBudget, removeBudget, currencySummary } = useAppContext();
  const txns = data.transactions;
  const budgets = data.budgets || {};
  const displayCurrency = data.displayCurrency;
  const selectorOptions = { displayCurrency, fxRates: data.fxRates };

  const [newCat, setNewCat] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [customCat, setCustomCat] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);

  const uniqueMonths = getUniqueMonths(txns);
  const allBudgetMonths = [...new Set([...uniqueMonths, ...Object.keys(budgets)])].sort();
  const latestMonth = allBudgetMonths.at(-1) || new Date().toISOString().slice(0, 7);
  const effectiveMonth = selectedMonth && allBudgetMonths.includes(selectedMonth) ? selectedMonth : latestMonth;

  const budgetEntries = getBudgetEntries(budgets, effectiveMonth, txns, selectorOptions);

  const totalBudgeted = budgetEntries.reduce((s, b) => s + b.budgeted, 0);
  const totalSpent = budgetEntries.reduce((s, b) => s + b.spent, 0);
  const overBudgetCount = budgetEntries.filter(b => b.over).length;

  const handleCategoryChange = (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setCustomCat(true);
      setNewCat('');
    } else {
      setCustomCat(false);
      setNewCat(val);
    }
  };

  const handleAdd = () => {
    const catTrim = customCat ? newCat.trim() : newCat;
    const amt = parseFloat(newAmount);
    if (!catTrim || !amt || amt <= 0) return;
    setBudget(effectiveMonth, catTrim, amt);
    setNewCat('');
    setNewAmount('');
    setCustomCat(false);
  };

  const availableCategories = [...EXPENSE_CATS].filter(c => !(budgets[effectiveMonth] || {})[c]);

  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Monthly Budget</h2>
        <EmptyState icon={WalletCards} title="Start with real spending context" description="Import transactions before setting category limits for a month." />
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Monthly Budget</h2>
      {currencySummary.hasMixedCurrencies && (
        <div style={{ marginBottom: '20px' }}>
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        </div>
      )}
      <div className="card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Budget Month</div>
          <select className="input" value={effectiveMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ marginTop: '6px' }}>
            {allBudgetMonths.map((month) => (
              <option key={month} value={month}>{month}</option>
            ))}
            {!allBudgetMonths.includes(effectiveMonth) && <option value={effectiveMonth}>{effectiveMonth}</option>}
          </select>
        </div>
          <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
          Budgets are saved per month in RON so rollovers do not overwrite earlier plans.
          </div>
        </div>

      {budgetEntries.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: '20px' }}>
          <div className="kpi blue">
            <div className="lbl">Total Budgeted</div>
            <div className="val">{formatCurrency(totalBudgeted, displayCurrency)}</div>
          </div>
          <div className="kpi red">
            <div className="lbl">Total Spent</div>
            <div className="val">{formatCurrency(totalSpent, displayCurrency)}</div>
          </div>
          <div className={`kpi ${totalBudgeted - totalSpent >= 0 ? 'green' : 'red'}`}>
            <div className="lbl">Remaining</div>
            <div className="val">{formatCurrency(totalBudgeted - totalSpent, displayCurrency)}</div>
          </div>
          {overBudgetCount > 0 && (
            <div className="kpi amber">
              <div className="lbl">Over Budget</div>
              <div className="val">{overBudgetCount} {overBudgetCount === 1 ? 'category' : 'categories'}</div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">Add Budget Category</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Category</label>
            {customCat ? (
              <input
                type="text"
                className="input"
                placeholder="Category name..."
                value={newCat}
                onChange={e => setNewCat(e.target.value)}
                style={{ width: '100%' }}
                autoFocus
              />
            ) : (
              <select
                className="input"
                value={newCat}
                onChange={handleCategoryChange}
                style={{ width: '100%' }}
              >
                <option value="">Select category...</option>
                {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">Custom...</option>
              </select>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Monthly Limit (stored in RON)</label>
            <input
              type="number"
              className="input"
              placeholder="0"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <button className="btn btn-primary" onClick={handleAdd}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {budgetEntries.length > 0 ? (
        <div className="card">
          <div className="card-title">Budget Progress</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {budgetEntries
              .sort((a, b) => b.pct - a.pct)
              .map(b => (
                <div key={b.cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{b.cat}</span>
                      {b.over && (
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)', fontWeight: 600 }}>OVER</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {formatCurrency(b.spent, displayCurrency)} / {formatCurrency(b.budgeted, displayCurrency)}
                      </span>
                      <button
                        className="btn"
                        onClick={() => removeBudget(effectiveMonth, b.cat)}
                        style={{ padding: '2px 6px', fontSize: '10px', color: 'var(--muted)', borderColor: 'transparent' }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ height: '6px', background: 'var(--surface3)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${b.pct}%`,
                        borderRadius: '3px',
                        background: b.over
                          ? 'var(--red)'
                          : b.pct > 80
                            ? 'var(--amber)'
                            : 'var(--green)',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: b.over ? 'var(--red)' : 'var(--muted)' }}>
                      {b.over
                        ? `Over by ${formatCurrency(Math.abs(b.remaining), displayCurrency)}`
                        : `${formatCurrency(b.remaining, displayCurrency)} remaining`}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {b.pct.toFixed(0)}% used
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><WalletCards size={22} /></div>
            <div className="empty-state-title">No budgets set</div>
            <div className="empty-state-desc">Add categories above to start tracking your monthly budget.</div>
          </div>
        </div>
      )}
    </div>
  );
}
