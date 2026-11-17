import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { columnLabel, getCurrencyAudit } from '../lib/currencyAudit';
import { formatCurrency } from '../lib/utils';
import { StatusPill } from './ui';

const STATUS = {
  suspect: { tone: 'warning', label: 'Mixed columns' },
  'not-recorded': { tone: 'neutral', label: 'Columns not recorded' },
  consistent: { tone: 'success', label: 'Consistent' },
};
const MAX_ROWS = 25;

const formatCounts = (counts) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} ${count}`)
    .join(' · ');

function rowAmount(transaction) {
  try {
    return formatCurrency(transaction.amt, transaction.currency || 'RON', { decimals: 2 });
  } catch {
    return `${transaction.amt} ${transaction.currency || ''}`.trim();
  }
}

/** Read-only report: which CSV columns each import used for amounts and currencies. */
export default function CurrencyAuditPanel({ data, onCheckFile }) {
  const audit = useMemo(() => getCurrencyAudit(data), [data]);
  const fileInputRef = useRef(null);
  const [checking, setChecking] = useState(false);
  if (audit.batches.length === 0) return null;
  const hasUnrecorded = audit.batches.some((batch) => batch.notRecorded > 0);

  const checkFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onCheckFile) return;
    setChecking(true);
    try {
      await onCheckFile(file);
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="import-history-section" aria-labelledby="currency-audit-title">
      <div className="import-history-heading">
        <div>
          <div className="eyebrow">Currency audit</div>
          <h2 id="currency-audit-title">Which columns gave each amount its currency</h2>
          <p>
            Some exports have several amount and currency columns. A row is flagged when its amount
            and its currency came from different columns. Nothing here changes your data: correct a
            row with its currency selector on Transactions.
          </p>
        </div>
        <Coins size={20} />
      </div>
      <div className="import-history-list">
        {audit.batches.map((batch) => {
          const status = STATUS[batch.status];
          return (
            <article className="import-history-item currency-audit-item" key={batch.batchId}>
              <div>
                <strong>{batch.fileName}</strong>
                <span>
                  {batch.profileLabel} ·{' '}
                  {batch.importedAt ? new Date(batch.importedAt).toLocaleString() : 'unknown date'}{' '}
                  · {batch.rowCount} rows
                </span>
                <small>
                  Imported currencies: {formatCounts(batch.currencies)}
                  {batch.corrected ? ` · ${batch.corrected} corrected by hand` : ''}
                </small>
                {Object.keys(batch.sourcePairs).length > 0 && (
                  <small>Columns used: {formatCounts(batch.sourcePairs)}</small>
                )}
                {batch.notRecorded > 0 && (
                  <small>
                    {batch.notRecorded} row{batch.notRecorded === 1 ? '' : 's'} imported before
                    columns were recorded. Use “Check with the original CSV” below.
                  </small>
                )}
                {batch.mismatched.length > 0 && (
                  <details className="currency-audit-rows">
                    <summary>
                      {batch.mismatched.length} row{batch.mismatched.length === 1 ? '' : 's'} with
                      amount and currency from different columns
                    </summary>
                    <ul>
                      {batch.mismatched.slice(0, MAX_ROWS).map((transaction, index) => (
                        <li key={`${transaction.date}-${transaction.ref || index}`}>
                          <span>
                            {transaction.date} · {transaction.desc} · {rowAmount(transaction)}
                          </span>
                          <span>
                            amount from {columnLabel(transaction.amountSource)}, currency from{' '}
                            {columnLabel(transaction.currencySource)}
                          </span>
                          <Link
                            to={`/app/activity/transactions?q=${encodeURIComponent(transaction.desc)}`}
                          >
                            Review on Transactions
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {batch.mismatched.length > MAX_ROWS && (
                      <small>…and {batch.mismatched.length - MAX_ROWS} more.</small>
                    )}
                  </details>
                )}
              </div>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </article>
          );
        })}
      </div>
      {hasUnrecorded && onCheckFile && (
        <div className="currency-audit-check">
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".csv"
            aria-label="Choose the original CSV to check"
            onChange={checkFile}
          />
          <button
            className="btn"
            type="button"
            disabled={checking}
            onClick={() => fileInputRef.current?.click()}
          >
            {checking ? 'Checking…' : 'Check with the original CSV'}
          </button>
          <small>
            Reads the file again and records which columns each existing row came from. Adds no rows
            and changes no amounts, currencies or categories.
          </small>
        </div>
      )}
    </section>
  );
}
