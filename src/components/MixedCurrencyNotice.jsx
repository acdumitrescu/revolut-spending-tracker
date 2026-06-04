export default function MixedCurrencyNotice({ currencies, compact = false }) {
  return (
    <div
      style={{
        background: 'rgba(255, 149, 0, 0.12)',
        border: '1px solid rgba(255, 149, 0, 0.28)',
        color: '#8a5200',
        borderRadius: '12px',
        padding: compact ? '10px 12px' : '14px 16px',
        fontSize: compact ? '12px' : '13px',
      }}
    >
      <strong>Mixed currencies detected.</strong>{' '}
      This dataset contains {currencies.join(', ')}. v1 does not convert exchange rates, so aggregate totals and some charts are hidden to avoid misleading results.
    </div>
  );
}
