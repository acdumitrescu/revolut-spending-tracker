import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency } from '../lib/utils';
import { convertAmountToDisplay } from '../lib/fx';
import { getDailySpend, getUniqueMonths } from '../lib/selectors';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { EmptyState } from '../components/ui';

function getColor(intensity) {
  if (intensity === 0) return 'var(--surface2)';
  if (intensity < 0.25) return 'rgba(34, 197, 94, 0.25)';
  if (intensity < 0.5) return 'rgba(34, 197, 94, 0.45)';
  if (intensity < 0.75) return 'rgba(245, 158, 11, 0.55)';
  return 'rgba(239, 68, 68, 0.7)';
}

function buildCalendarGrid(days) {
  const firstDate = new Date(days[0].date);
  const blanks = firstDate.getDay();
  return [...Array.from({ length: blanks }, () => null), ...days];
}

export default function Heatmap() {
  const { data, currencySummary } = useAppContext();
  const txns = data.transactions;
  const displayCurrency = data.displayCurrency;
  const selectorOptions = { displayCurrency, fxRates: data.fxRates };
  const [windowIndex, setWindowIndex] = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);

  const months = useMemo(() => getUniqueMonths(txns), [txns]);
  const monthWindows = useMemo(() => {
    const chunks = [];
    for (let index = 0; index < months.length; index += 3) {
      chunks.push(months.slice(index, index + 3));
    }
    return chunks;
  }, [months]);

  const safeWindowIndex = Math.min(windowIndex, Math.max(monthWindows.length - 1, 0));
  const visibleMonths = monthWindows[safeWindowIndex] || [];

  const monthCards = visibleMonths.map((month) => {
    const days = getDailySpend(txns, month, selectorOptions);
    const maxSpend = Math.max(...days.map((day) => day.spendNet), 0);
    return {
      month,
      days,
      maxSpend,
      grid: buildCalendarGrid(days),
      totalSpend: days.reduce((sum, day) => sum + day.spendNet, 0),
      activeDays: days.filter((day) => day.spendNet > 0).length,
    };
  });

  const allVisibleDays = monthCards.flatMap((card) => card.days);
  const visibleMonthLabel = visibleMonths.length
    ? `${visibleMonths[0]} to ${visibleMonths[visibleMonths.length - 1]}`
    : 'No data';
  const selectedDayDetails = allVisibleDays.find((day) => day.date === selectedDate) || null;
  const selectedDayTxns = txns
    .filter((txn) => txn.date === selectedDate)
    .sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));

  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Spending Heatmap</h2>
        <EmptyState icon={CalendarRange} title="No spending rhythm yet" description="Import transactions to explore daily intensity and unusual spending days." />
      </div>
    );
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ marginBottom: '6px' }}>Spending Heatmap</h2>
          <div style={{ color: 'var(--muted)', fontSize: '12px' }}>GitHub-style monthly view with daily drilldown</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="btn" onClick={() => setWindowIndex((idx) => Math.max(0, idx - 1))} disabled={safeWindowIndex === 0}>
            <ChevronLeft size={14} />
          </button>
          <div style={{ minWidth: '150px', textAlign: 'center', fontSize: '12px', color: 'var(--muted)' }}>{visibleMonthLabel}</div>
          <button className="btn" onClick={() => setWindowIndex((idx) => Math.min(monthWindows.length - 1, idx + 1))} disabled={safeWindowIndex >= monthWindows.length - 1}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      {currencySummary.hasMixedCurrencies && (
        <div style={{ marginBottom: '20px' }}>
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom: '20px' }}>
        <div className="kpi red">
          <div className="lbl">Visible Spend</div>
          <div className="val">{formatCurrency(monthCards.reduce((sum, card) => sum + card.totalSpend, 0), displayCurrency)}</div>
        </div>
        <div className="kpi amber">
          <div className="lbl">Active Days</div>
          <div className="val">{monthCards.reduce((sum, card) => sum + card.activeDays, 0)}</div>
        </div>
        <div className="kpi blue">
          <div className="lbl">Months Shown</div>
          <div className="val">{visibleMonths.length}</div>
        </div>
      </div>

      <div className="grid3">
        {monthCards.map((card) => {
          const label = new Date(`${card.month}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          return (
            <div key={card.month} className="card">
              <div className="card-title">{label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                {weekDays.map((day) => (
                  <div key={day} style={{ fontSize: '10px', color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{day}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {card.grid.map((cell, index) => {
                  if (!cell) return <div key={`${card.month}-blank-${index}`} style={{ aspectRatio: '1', borderRadius: '4px' }} />;
                  const intensity = card.maxSpend > 0 ? cell.spendNet / card.maxSpend : 0;
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      title={`${cell.date}: ${formatCurrency(cell.spendNet, displayCurrency)}`}
                      onClick={() => setSelectedDate(cell.date)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: '4px',
                        background: getColor(intensity),
                        color: intensity > 0.5 ? '#fff' : 'var(--muted)',
                        fontSize: '10px',
                        fontWeight: cell.spendNet > 0 ? 700 : 400,
                        border: cell.date === selectedDate ? '2px solid var(--blue)' : '1px solid var(--border)',
                        cursor: 'pointer',
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: '14px' }}>
        <div className="card-title">{selectedDate ? `Transactions on ${selectedDate}` : 'Pick a day to inspect activity'}</div>
        {selectedDayDetails ? (
          <>
            <div style={{ display: 'flex', gap: '24px', marginBottom: '14px', color: 'var(--muted)', fontSize: '12px' }}>
              <span>Net spend: <strong style={{ color: 'var(--red)' }}>{formatCurrency(selectedDayDetails.spendNet, displayCurrency)}</strong></span>
              <span>Income: <strong style={{ color: 'var(--green)' }}>{formatCurrency(selectedDayDetails.income, displayCurrency)}</strong></span>
              <span>Refunds: <strong>{formatCurrency(selectedDayDetails.refunds, displayCurrency)}</strong></span>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                </thead>
                <tbody>
                  {selectedDayTxns.map((txn) => (
                    <tr key={`${txn.date}-${txn.desc}-${txn.amt}-${txn.ref || txn.type}`}>
                      <td>{txn.desc}</td>
                      <td>{txn.cat}</td>
                      <td style={{ textAlign: 'right', color: txn.flow === 'Credit' ? 'var(--green)' : 'var(--red)' }}>
                        {txn.flow === 'Credit' ? '+' : '-'}{formatCurrency(Math.abs(convertAmountToDisplay(txn.amt, txn.currency || 'RON', displayCurrency, data.fxRates)), displayCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Click any day square to inspect the underlying transactions.</div>
        )}
      </div>
    </div>
  );
}
