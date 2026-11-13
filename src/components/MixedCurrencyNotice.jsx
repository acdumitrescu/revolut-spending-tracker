export default function MixedCurrencyNotice({ currencies }) {
  return (
    <div className="mixed-currency-notice">
      <strong>Mixed currencies detected.</strong> This dataset contains {currencies.join(', ')}.
      Totals are converted using your latest saved FX rates, while transaction rows keep their
      original source currency for traceability.
    </div>
  );
}
