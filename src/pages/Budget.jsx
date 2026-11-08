import { useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency, EXPENSE_CATS } from '../lib/utils';
import { getBudgetComparison, getBudgetEntries, getBudgetSummary, shiftMonth } from '../lib/selectors';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, X, Plus, WalletCards } from 'lucide-react';
import { useToast } from '../components/Toast';

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function formatOptionalCurrency(value, currency) {
  return value === null ? '—' : formatCurrency(value, currency);
}

function formatCurrencyDelta(value, currency) {
  if (value === null) return '—';
  if (value === 0) return formatCurrency(0, currency);
  const formatted = formatCurrency(Math.abs(value), currency);
  return `${value > 0 ? '+' : '−'}${formatted}`;
}

export default function Budget() {
  const { data, setBudget, removeBudget, copyBudgets } = useAppContext();
  const toast = useToast();
  const txns = data.transactions;
  const budgets = data.budgets || {};
  const displayCurrency = data.displayCurrency;
  const selectorOptions = { displayCurrency, fxRates: data.fxRates };

  const [newCat, setNewCat] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [customCat, setCustomCat] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);

  const effectiveMonth = selectedMonth;
  const previousMonth = shiftMonth(effectiveMonth, -1);
  const previousBudgets = budgets[previousMonth] || {};
  const targetBudgets = budgets[effectiveMonth] || {};
  const copyableCategoryCount = Object.keys(previousBudgets)
    .filter((category) => !(category in targetBudgets)).length;

  const budgetEntries = getBudgetEntries(budgets, effectiveMonth, txns, selectorOptions);
  const budgetSummary = getBudgetSummary(budgets, effectiveMonth, txns, selectorOptions);
  const budgetComparison = getBudgetComparison(budgets, effectiveMonth, txns, selectorOptions);

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

  const handleCopyPrevious = () => {
    copyBudgets(previousMonth, effectiveMonth);
    toast.success(
      `Copied ${copyableCategoryCount} missing ${copyableCategoryCount === 1 ? 'category' : 'categories'} from ${formatMonthLabel(previousMonth)}. Existing categories were kept.`
    );
  };

  const availableCategories = [...EXPENSE_CATS].filter(c => !(budgets[effectiveMonth] || {})[c]);

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>Monthly Budget</h2>
      <div className="card" style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label htmlFor="budget-month" style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Budget Month</label>
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button className="btn" type="button" aria-label="Previous budget month" onClick={() => setSelectedMonth(previousMonth)}>
              <ChevronLeft size={16} />
            </button>
            <input
              id="budget-month"
              className="input"
              type="month"
              value={effectiveMonth}
              onChange={(event) => event.target.value && setSelectedMonth(event.target.value)}
              style={{ minWidth: '150px' }}
            />
            <button className="btn" type="button" aria-label="Next budget month" onClick={() => setSelectedMonth(shiftMonth(effectiveMonth, 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <button className="btn" type="button" onClick={() => setSelectedMonth(getCurrentMonth())}>
          <CalendarDays size={15} /> Current month
        </button>
        <button
          className="btn"
          type="button"
          disabled={copyableCategoryCount === 0}
          onClick={handleCopyPrevious}
          title={copyableCategoryCount === 0 ? `No missing categories to copy from ${previousMonth}` : `Copy ${copyableCategoryCount} missing categories from ${previousMonth}`}
        >
          <Copy size={15} /> Copy previous
        </button>
        <div style={{ flex: '2 1 280px', color: 'var(--muted)', fontSize: '12px' }}>
          Plans are stored per month in RON. Copying a prior month fills only missing categories.
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: '20px' }}>
        <div className="kpi blue">
          <div className="lbl">Imported Income</div>
          <div className="val">{formatCurrency(budgetSummary.importedIncome, displayCurrency)}</div>
        </div>
        <div className="kpi blue">
          <div className="lbl">Assigned</div>
          <div className="val">{formatCurrency(budgetSummary.assigned, displayCurrency)}</div>
        </div>
        <div className="kpi red">
          <div className="lbl">Total Spending</div>
          <div className="val">{formatCurrency(budgetSummary.totalSpending, displayCurrency)}</div>
        </div>
        <div className="kpi red">
          <div className="lbl">Planned Categories</div>
          <div className="val">{formatCurrency(budgetSummary.plannedCategorySpending, displayCurrency)}</div>
        </div>
        <div className={`kpi ${budgetSummary.remaining >= 0 ? 'green' : 'red'}`}>
          <div className="lbl">Plan Remaining</div>
          <div className="val">{formatCurrency(budgetSummary.remaining, displayCurrency)}</div>
        </div>
        <div className={`kpi ${budgetSummary.unbudgetedSpending > 0 ? 'amber' : 'green'}`}>
          <div className="lbl">Unbudgeted Spending</div>
          <div className="val">{formatCurrency(budgetSummary.unbudgetedSpending, displayCurrency)}</div>
        </div>
        <div className={`kpi ${budgetSummary.unassignedIncome === null || budgetSummary.unassignedIncome >= 0 ? 'green' : 'red'}`}>
          <div className="lbl">Unassigned Income</div>
          <div className="val">
            {budgetSummary.unassignedIncome === null
              ? '—'
              : formatCurrency(budgetSummary.unassignedIncome, displayCurrency)}
          </div>
        </div>
        {overBudgetCount > 0 && (
          <div className="kpi amber">
            <div className="lbl">Over Budget</div>
            <div className="val">{overBudgetCount} {overBudgetCount === 1 ? 'category' : 'categories'}</div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">Month Comparison</div>
        <div style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '14px' }}>
          {formatMonthLabel(effectiveMonth)} compared with {formatMonthLabel(previousMonth)}. Positive changes use a plus sign; income-based values stay unavailable until both months contain imported income.
        </div>
        <div className="tbl-wrap" style={{ marginBottom: budgetComparison.categories.length > 0 ? '18px' : 0 }}>
          <table aria-label="Budget month summary comparison">
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col" style={{ textAlign: 'right' }}>{formatMonthLabel(previousMonth)}</th>
                <th scope="col" style={{ textAlign: 'right' }}>{formatMonthLabel(effectiveMonth)}</th>
                <th scope="col" style={{ textAlign: 'right' }}>Change</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Imported income', 'importedIncome'],
                ['Assigned', 'assigned'],
                ['Total spending', 'totalSpending'],
                ['Planned-category spending', 'plannedCategorySpending'],
                ['Plan remaining', 'remaining'],
                ['Unbudgeted spending', 'unbudgetedSpending'],
                ['Unassigned income', 'unassignedIncome'],
              ].map(([label, key]) => (
                <tr key={key}>
                  <td>{label}</td>
                  <td style={{ textAlign: 'right' }}>{formatOptionalCurrency(budgetComparison.previous[key], displayCurrency)}</td>
                  <td style={{ textAlign: 'right' }}>{formatOptionalCurrency(budgetComparison.current[key], displayCurrency)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrencyDelta(budgetComparison.deltas[key], displayCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {budgetComparison.categories.length > 0 && (
          <div className="tbl-wrap">
            <table aria-label="Budget category comparison">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Previous plan</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Current plan</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Plan change</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Spending change</th>
                </tr>
              </thead>
              <tbody>
                {budgetComparison.categories.map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.previousAssigned, displayCurrency)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentAssigned, displayCurrency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrencyDelta(row.assignedDelta, displayCurrency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrencyDelta(row.spendingDelta, displayCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title">Add Budget Category</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="budget-category" style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Category</label>
            {customCat ? (
              <input
                id="budget-category"
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
                id="budget-category"
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
            <label htmlFor="budget-amount" style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Monthly Limit (stored in RON)</label>
            <input
              id="budget-amount"
              type="number"
              className="input"
              placeholder="0"
              value={newAmount}
              onChange={e => setNewAmount(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <button className="btn btn-primary" type="button" onClick={handleAdd}>
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
                        type="button"
                        aria-label={`Remove ${b.cat} budget`}
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
