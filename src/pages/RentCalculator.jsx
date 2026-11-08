import { useMemo, useState } from 'react';
import { House, PiggyBank, Plane, Scale } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { DEFAULT_FX_RATES } from '../lib/fx';
import { calculateRentAffordability } from '../lib/rentAffordability';
import { formatCurrency } from '../lib/utils';

const DEFAULT_SCENARIO = {
  netIncomeRon: 0,
  rentEur: 0,
  utilitiesRon: 0,
  otherFixedCostsRon: 0,
  savingsTargetPct: 0,
};

function Field({ label, name, value, suffix, min = 0, max, step = 1, onChange }) {
  return (
    <label className="field-stack" htmlFor={`rent-${name}`}>
      <span>{label}</span>
      <div className="rent-input-wrap">
        <input
          id={`rent-${name}`}
          className="input"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(name, event.target.value)}
        />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

export default function RentCalculator() {
  const { data } = useAppContext();
  const savedEurRate = data.fxRates?.EUR || DEFAULT_FX_RATES.EUR;
  const [scenario, setScenario] = useState(() => ({
    ...DEFAULT_SCENARIO,
    eurRonRate: savedEurRate,
  }));

  const result = useMemo(
    () => calculateRentAffordability(scenario),
    [scenario]
  );

  const updateScenario = (name, value) => {
    setScenario((current) => ({ ...current, [name]: value }));
  };

  const guidance = !result.isValid
    ? 'Enter a positive monthly income and EUR exchange rate to calculate affordability.'
    : result.housingBurdenPct <= 30
      ? 'The full housing cost stays within the 30% planning target.'
      : `A rent near €${Math.round(result.recommendedMaxRentEur).toLocaleString()} would bring the full housing cost close to the 30% planning target.`;

  return (
    <div className="page-stack">
      <header className="standard-page-header">
        <div>
          <div className="eyebrow">Housing affordability</div>
          <h1>Rent calculator</h1>
          <p>Test the full monthly housing cost against income, fixed commitments, and your savings target.</p>
        </div>
        <span className="status-pill success">Local calculation</span>
      </header>

      <div className="rent-calculator-grid">
        <section className="card" aria-labelledby="rent-scenario-title">
          <div className="card-title" id="rent-scenario-title">Your scenario</div>
          <div className="rent-form-grid">
            <Field label="Net monthly income" name="netIncomeRon" value={scenario.netIncomeRon} suffix="RON" step="100" onChange={updateScenario} />
            <Field label="Monthly rent" name="rentEur" value={scenario.rentEur} suffix="EUR" step="10" onChange={updateScenario} />
            <Field label="Utilities + association" name="utilitiesRon" value={scenario.utilitiesRon} suffix="RON" step="50" onChange={updateScenario} />
            <Field label="EUR exchange rate" name="eurRonRate" value={scenario.eurRonRate} suffix="RON/EUR" min="0.01" step="0.01" onChange={updateScenario} />
            <Field label="Other fixed commitments" name="otherFixedCostsRon" value={scenario.otherFixedCostsRon} suffix="RON" step="50" onChange={updateScenario} />
            <Field label="Target monthly savings" name="savingsTargetPct" value={scenario.savingsTargetPct} suffix="%" max="80" step="1" onChange={updateScenario} />
          </div>
          <p className="section-note rent-calculator-note">
            The exchange rate starts from your saved SSB EUR rate. Change it here to stress-test a scenario without changing app settings.
          </p>
        </section>

        <section className="card" aria-labelledby="rent-result-title" aria-live="polite">
          <div className="rent-result-heading">
            <div>
              <div className="card-title" id="rent-result-title">Total housing burden</div>
              <strong>{result.isValid ? `${result.housingBurdenPct.toFixed(1)}% of income` : 'Waiting for inputs'}</strong>
              <p>{formatCurrency(result.housingCostRon, 'RON')} including utilities</p>
            </div>
            <span className={`rent-assessment ${result.status}`}>{result.statusLabel}</span>
          </div>

          <div className="rent-result-grid">
            <div><span>Recommended max rent</span><strong>€{Math.round(result.recommendedMaxRentEur).toLocaleString()}</strong></div>
            <div><span>35% outer-limit rent</span><strong>€{Math.round(result.outerMaxRentEur).toLocaleString()}</strong></div>
            <div><span>Left after housing</span><strong>{formatCurrency(result.afterHousingRon, 'RON')}</strong></div>
            <div><span>Planned monthly savings</span><strong>{formatCurrency(result.savingsTargetRon, 'RON')}</strong></div>
            <div className={result.flexibleMoneyRon < 0 ? 'negative' : ''}><span>Flexible money after plan</span><strong>{formatCurrency(result.flexibleMoneyRon, 'RON')}</strong></div>
          </div>

          <p className="rent-guidance">{guidance}</p>
        </section>
      </div>

      <section className="card" aria-labelledby="rent-method-title">
        <div className="card-title" id="rent-method-title">How to read it</div>
        <div className="rent-method-grid">
          <div><Scale size={18} /><strong>Full housing cost</strong><span>Rent plus utilities is compared with net monthly income.</span></div>
          <div><PiggyBank size={18} /><strong>Savings protected</strong><span>Flexible money deducts your savings target and other fixed commitments.</span></div>
          <div><Plane size={18} /><strong>Mobility remains visible</strong><span>Use the remaining cash-flow figure before committing to a higher fixed rent.</span></div>
          <div><House size={18} /><strong>Planning signal only</strong><span>The 30% and 35% thresholds are guides, not lending or financial advice.</span></div>
        </div>
      </section>
    </div>
  );
}
