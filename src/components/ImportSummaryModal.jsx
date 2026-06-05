export default function ImportSummaryModal({ summary, fileName, onClose }) {
  if (!summary) return null;

  const topSkipReasons = Object.entries(summary.skippedReasonCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import summary"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 'min(760px, 100%)',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '24px',
          background: 'var(--surface)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
          <div>
            <div className="card-title" style={{ marginBottom: '6px' }}>Import Summary</div>
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.5 }}>
              {fileName ? `File: ${fileName}` : 'Imported file'} was parsed locally in your browser.
              Nothing from this CSV is uploaded to a backend service.
            </div>
          </div>
          <button className="btn" type="button" onClick={onClose} style={{ whiteSpace: 'nowrap' }}>
            Close
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          <div className="kpi blue">
            <div className="lbl">Detected Profile</div>
            <div className="val" style={{ fontSize: '18px' }}>{summary.detectedProfileLabel}</div>
          </div>
          <div className="kpi green">
            <div className="lbl">Processed</div>
            <div className="val">{summary.processedRows}</div>
          </div>
          <div className="kpi amber">
            <div className="lbl">Skipped</div>
            <div className="val">{summary.skippedRows}</div>
          </div>
          <div className="kpi">
            <div className="lbl">Rows Read</div>
            <div className="val">{summary.totalRows}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <section className="card" style={{ margin: 0 }}>
            <div className="card-title">Warnings</div>
            {summary.warnings?.length ? (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                {summary.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                No parser warnings for this import.
              </div>
            )}
          </section>

          <section className="card" style={{ margin: 0 }}>
            <div className="card-title">Top Skip Reasons</div>
            {topSkipReasons.length ? (
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
                {topSkipReasons.map(([reason, count]) => (
                  <li key={reason}>
                    {reason} ({count})
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                No rows were skipped.
              </div>
            )}
          </section>
        </div>

        {summary.skippedDetails?.length > 0 && (
          <section className="card" style={{ margin: '16px 0 0' }}>
            <div className="card-title">Skipped Row Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text)' }}>
              {summary.skippedDetails.slice(0, 8).map((detail) => (
                <div key={detail} style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--surface2)' }}>
                  {detail}
                </div>
              ))}
              {summary.skippedDetails.length > 8 && (
                <div style={{ color: 'var(--muted)' }}>
                  Showing 8 of {summary.skippedDetails.length} skipped row details.
                </div>
              )}
            </div>
          </section>
        )}

        <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.6 }}>
          Keep real CSVs and generated backups in ignored local folders such as <code>imports/</code>, <code>exports/</code>, or <code>backups/</code>.
        </div>
      </div>
    </div>
  );
}
