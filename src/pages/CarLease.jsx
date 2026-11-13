import { useMemo, useState } from 'react';
import { CarFront, ExternalLink, Pencil, Plus, Scale, Trash2, Wallet } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { DEFAULT_FX_RATES } from '../lib/fx';
import {
  calculateAffordableCar,
  calculateCarLease,
  effectiveMonthlyIncomeRon,
  healthyMonthlyBudgetRon,
  LEASE_TYPES,
} from '../lib/carLease';
import { formatCurrency } from '../lib/utils';

const DEFAULT_SCENARIO = {
  type: 'financial',
  netMonthlyIncomeRon: 0,
  annualExtraIncomeRon: 0,
  priceEur: 0,
  downPaymentPct: 0,
  termMonths: 48,
  annualRatePct: 0,
  residualPct: 0,
  adminFeePct: 0,
  operationalMonthlyEur: 0,
  operationalDepositEur: 0,
  operationalFeeEur: 0,
  operationalIncludesService: true,
  insuranceRonYear: 0,
  maintenanceRonYear: 0,
  fuelRonMonth: 0,
  roadTaxRonYear: 0,
  otherFixedCostsRon: 0,
  savingsTargetPct: 0,
};

const TYPE_FIELDS = {
  financial: [
    'priceEur',
    'downPaymentPct',
    'termMonths',
    'annualRatePct',
    'residualPct',
    'adminFeePct',
  ],
  loan: ['priceEur', 'downPaymentPct', 'termMonths', 'annualRatePct', 'adminFeePct'],
  operational: [
    'termMonths',
    'operationalMonthlyEur',
    'operationalDepositEur',
    'operationalFeeEur',
  ],
  cash: ['priceEur'],
};

const FIELD_META = {
  priceEur: ['Car price (incl. VAT)', 'EUR', 100],
  downPaymentPct: ['Down payment', '%', 1],
  termMonths: ['Term', 'months', 6],
  annualRatePct: ['Annual interest rate', '%', 0.1],
  residualPct: ['Residual value (buy-out)', '%', 1],
  adminFeePct: ['Admin / file fee', '%', 0.1],
  operationalMonthlyEur: ['Monthly fee', 'EUR', 10],
  operationalDepositEur: ['Refundable deposit', 'EUR', 100],
  operationalFeeEur: ['One-off fees', 'EUR', 10],
};

const STATUS_LABELS = {
  considering: 'Considering',
  shortlisted: 'Shortlisted',
  rejected: 'Rejected',
};

function Field({ label, name, value, suffix, min = 0, max, step = 1, onChange }) {
  return (
    <label className="field-stack" htmlFor={`car-${name}`}>
      <span>{label}</span>
      <div className="rent-input-wrap">
        <input
          id={`car-${name}`}
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

function ListingForm({ draft, onChange, onSave, onCancel }) {
  const update = (name) => (event) => onChange({ ...draft, [name]: event.target.value });
  return (
    <form className="car-listing-form" onSubmit={onSave}>
      <div className="rent-form-grid">
        <label className="field-stack">
          <span>Car name</span>
          <input
            autoFocus
            className="input"
            required
            maxLength={160}
            value={draft.name}
            onChange={update('name')}
            placeholder="e.g. Dacia Duster 2023"
          />
        </label>
        <label className="field-stack">
          <span>Listing link</span>
          <input
            className="input"
            type="url"
            maxLength={2000}
            value={draft.url}
            onChange={update('url')}
            placeholder="https://"
          />
        </label>
        <label className="field-stack">
          <span>Asking price (EUR)</span>
          <input
            className="input"
            type="number"
            min="0"
            step="50"
            value={draft.priceEur}
            onChange={update('priceEur')}
          />
        </label>
        <label className="field-stack">
          <span>Year</span>
          <input
            className="input"
            type="number"
            min="1950"
            max="2100"
            value={draft.year}
            onChange={update('year')}
          />
        </label>
        <label className="field-stack">
          <span>Mileage (km)</span>
          <input
            className="input"
            type="number"
            min="0"
            step="1000"
            value={draft.mileageKm}
            onChange={update('mileageKm')}
          />
        </label>
        <label className="field-stack">
          <span>Status</span>
          <select className="input" value={draft.status} onChange={update('status')}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field-stack">
        <span>Notes</span>
        <textarea
          className="input"
          maxLength={2000}
          rows={2}
          value={draft.notes}
          onChange={update('notes')}
        />
      </label>
      <div className="car-listing-form-actions">
        <button className="btn btn-primary" type="submit">
          Save car
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const blankListing = () => ({
  id: globalThis.crypto.randomUUID(),
  name: '',
  url: '',
  priceEur: '',
  year: '',
  mileageKm: '',
  status: 'considering',
  notes: '',
});

export default function CarLease() {
  const { data, upsertCarListing, removeCarListing } = useAppContext();
  const savedEurRate = data.fxRates?.EUR || DEFAULT_FX_RATES.EUR;
  const [scenario, setScenario] = useState(() => ({
    ...DEFAULT_SCENARIO,
    eurRonRate: savedEurRate,
  }));
  const [budgetRon, setBudgetRon] = useState(null);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const listings = data.carListings || [];

  const result = useMemo(() => calculateCarLease(scenario), [scenario]);
  const sliderMax = Math.max(
    1000,
    Math.ceil((effectiveMonthlyIncomeRon(scenario) * 0.4) / 100) * 100,
  );
  const budget = Math.min(sliderMax, budgetRon ?? healthyMonthlyBudgetRon(scenario));
  const affordable = useMemo(() => calculateAffordableCar(scenario, budget), [scenario, budget]);
  const budgetSharePct = result.isValid ? (budget / effectiveMonthlyIncomeRon(scenario)) * 100 : 0;
  const updateScenario = (name, value) => setScenario((current) => ({ ...current, [name]: value }));

  const saveListing = (event) => {
    event.preventDefault();
    try {
      upsertCarListing({
        ...editing,
        priceEur: Number(editing.priceEur) || 0,
        year: editing.year === '' ? null : Number(editing.year),
        mileageKm: editing.mileageKm === '' ? null : Number(editing.mileageKm),
      });
      setEditing(null);
      setMessage('Car saved.');
    } catch {
      setMessage(
        'Could not save. Check the name and that the link starts with http:// or https://.',
      );
    }
  };

  const guidance = !result.isValid
    ? 'Enter a positive monthly income and EUR exchange rate to run the simulation.'
    : result.status === 'healthy'
      ? 'Total car cost stays within the 15% planning target.'
      : `To stay near the 15% planning target, the monthly payment would need to be about ${formatCurrency(result.maxMonthlyPaymentRon, 'RON')}.`;

  const showFinancing = scenario.type !== 'cash';

  return (
    <div className="page-stack">
      <header className="standard-page-header">
        <div>
          <div className="eyebrow">Mobility planning</div>
          <h1>Car lease simulator</h1>
          <p>
            Compare lease and purchase options against your monthly and yearly income, and keep the
            cars you are considering.
          </p>
        </div>
        <span className="status-pill success">Local calculation</span>
      </header>

      <div className="rent-calculator-grid">
        <section className="card" aria-labelledby="car-scenario-title">
          <div className="card-title" id="car-scenario-title">
            Your scenario
          </div>
          <div className="rent-form-grid">
            <Field
              label="Net monthly income"
              name="netMonthlyIncomeRon"
              value={scenario.netMonthlyIncomeRon}
              suffix="RON"
              step="100"
              onChange={updateScenario}
            />
            <Field
              label="Extra yearly income (bonuses)"
              name="annualExtraIncomeRon"
              value={scenario.annualExtraIncomeRon}
              suffix="RON/yr"
              step="500"
              onChange={updateScenario}
            />
            <Field
              label="EUR exchange rate"
              name="eurRonRate"
              value={scenario.eurRonRate}
              suffix="RON/EUR"
              min="0.01"
              step="0.01"
              onChange={updateScenario}
            />
            <label className="field-stack" htmlFor="car-type">
              <span>Financing type</span>
              <select
                id="car-type"
                className="input"
                value={scenario.type}
                onChange={(event) => updateScenario('type', event.target.value)}
              >
                {Object.entries(LEASE_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="card-title car-subtitle">{LEASE_TYPES[scenario.type]} terms</div>
          <div className="rent-form-grid">
            {TYPE_FIELDS[scenario.type].map((name) => {
              const [label, suffix, step] = FIELD_META[name];
              return (
                <Field
                  key={name}
                  label={label}
                  name={name}
                  value={scenario[name]}
                  suffix={suffix}
                  step={step}
                  onChange={updateScenario}
                />
              );
            })}
          </div>
          {scenario.type === 'operational' && (
            <label className="car-check">
              <input
                type="checkbox"
                checked={scenario.operationalIncludesService}
                onChange={(event) =>
                  updateScenario('operationalIncludesService', event.target.checked)
                }
              />
              Fee already includes insurance and servicing
            </label>
          )}

          <div className="card-title car-subtitle">Running costs and plan</div>
          <div className="rent-form-grid">
            <Field
              label="Insurance (RCA + CASCO)"
              name="insuranceRonYear"
              value={scenario.insuranceRonYear}
              suffix="RON/yr"
              step="100"
              onChange={updateScenario}
            />
            <Field
              label="Maintenance + tyres"
              name="maintenanceRonYear"
              value={scenario.maintenanceRonYear}
              suffix="RON/yr"
              step="100"
              onChange={updateScenario}
            />
            <Field
              label="Fuel / charging"
              name="fuelRonMonth"
              value={scenario.fuelRonMonth}
              suffix="RON/mo"
              step="50"
              onChange={updateScenario}
            />
            <Field
              label="Road tax + rovinieta"
              name="roadTaxRonYear"
              value={scenario.roadTaxRonYear}
              suffix="RON/yr"
              step="50"
              onChange={updateScenario}
            />
            <Field
              label="Other fixed commitments"
              name="otherFixedCostsRon"
              value={scenario.otherFixedCostsRon}
              suffix="RON/mo"
              step="50"
              onChange={updateScenario}
            />
            <Field
              label="Target monthly savings"
              name="savingsTargetPct"
              value={scenario.savingsTargetPct}
              suffix="%"
              max="80"
              step="1"
              onChange={updateScenario}
            />
          </div>
          <p className="section-note rent-calculator-note">
            The exchange rate starts from your saved SSB EUR rate. Changing it here does not change
            app settings. Rates, fees and residual value vary by lender, so use the figures from a
            real offer.
          </p>
        </section>

        <section className="card" aria-labelledby="car-result-title" aria-live="polite">
          <div className="rent-result-heading">
            <div>
              <div className="card-title" id="car-result-title">
                Total monthly car cost
              </div>
              <strong>
                {result.isValid
                  ? formatCurrency(result.totalMonthlyCostRon, 'RON')
                  : 'Waiting for inputs'}
              </strong>
              <p>
                {result.isValid
                  ? `${result.blendedBurdenPct.toFixed(1)}% of income incl. yearly extras · ${result.salaryBurdenPct.toFixed(1)}% of monthly salary alone`
                  : 'Add income and an exchange rate'}
              </p>
            </div>
            <span className={`rent-assessment ${result.status}`}>{result.statusLabel}</span>
          </div>

          <div className="rent-result-grid">
            <div>
              <span>{showFinancing ? 'Monthly payment' : 'Purchase paid'}</span>
              <strong>
                {formatCurrency(
                  showFinancing ? result.monthlyPaymentRon : result.upfrontRon,
                  'RON',
                )}
              </strong>
            </div>
            <div>
              <span>Running costs / month</span>
              <strong>{formatCurrency(result.runningCostsRon, 'RON')}</strong>
            </div>
            <div>
              <span>Cash needed upfront</span>
              <strong>{formatCurrency(result.upfrontRon, 'RON')}</strong>
            </div>
            <div>
              <span>Car cost per year</span>
              <strong>{formatCurrency(result.annualCostRon, 'RON')}</strong>
            </div>
            {scenario.type === 'financial' && (
              <div>
                <span>Buy-out at end of term</span>
                <strong>{formatCurrency(result.endOfTermRon, 'RON')}</strong>
              </div>
            )}
            {showFinancing && (
              <div>
                <span>
                  {scenario.type === 'operational'
                    ? 'Total paid (fees + rentals, no ownership)'
                    : 'Total paid on the contract'}
                </span>
                <strong>{formatCurrency(result.totalPaidRon, 'RON')}</strong>
              </div>
            )}
            {scenario.type !== 'operational' && showFinancing && (
              <div>
                <span>Cost of financing</span>
                <strong>{formatCurrency(result.financingCostRon, 'RON')}</strong>
              </div>
            )}
            <div>
              <span>Max payment at 15% target</span>
              <strong>{formatCurrency(result.maxMonthlyPaymentRon, 'RON')}</strong>
            </div>
            <div>
              <span>Planned monthly savings</span>
              <strong>{formatCurrency(result.savingsTargetRon, 'RON')}</strong>
            </div>
            <div className={result.flexibleMoneyRon < 0 ? 'negative' : ''}>
              <span>Flexible money after plan</span>
              <strong>{formatCurrency(result.flexibleMoneyRon, 'RON')}</strong>
            </div>
            {scenario.type === 'cash' && (
              <div>
                <span>Months to save the price</span>
                <strong>{result.monthsToSaveUpfront ?? 'Not reachable'}</strong>
              </div>
            )}
          </div>

          <p className="rent-guidance">{guidance}</p>

          <div className="car-budget" aria-labelledby="car-budget-title">
            <div className="card-title" id="car-budget-title">
              How much can I take?
            </div>
            <label className="car-budget-slider" htmlFor="car-budget">
              <span>Total monthly car budget</span>
              <strong>
                {formatCurrency(budget, 'RON')} <em>({budgetSharePct.toFixed(1)}% of income)</em>
              </strong>
            </label>
            <input
              id="car-budget"
              type="range"
              min="0"
              max={sliderMax}
              step="50"
              value={budget}
              onChange={(event) => setBudgetRon(Number(event.target.value))}
            />
            <div className="car-budget-scale">
              <span>0</span>
              <span>{formatCurrency(sliderMax, 'RON')} (40% of income)</span>
            </div>
            {!affordable.isValid && (
              <p className="section-note">Add income and an exchange rate first.</p>
            )}
            {affordable.isValid && affordable.supported === false && (
              <p className="section-note">
                For a cash purchase the budget sets what you can save, not a loan. Pick a lease or
                loan to see the maximum.
              </p>
            )}
            {affordable.isValid && affordable.supported && (
              <>
                <div className="rent-result-grid">
                  <div>
                    <span>Left for the payment (after running costs)</span>
                    <strong>{formatCurrency(affordable.paymentRoomRon, 'RON')}</strong>
                  </div>
                  {affordable.maxPriceEur != null ? (
                    <>
                      <div>
                        <span>Maximum loan</span>
                        <strong>€{Math.round(affordable.maxLoanEur).toLocaleString()}</strong>
                      </div>
                      <div>
                        <span>Maximum car price</span>
                        <strong>€{Math.round(affordable.maxPriceEur).toLocaleString()}</strong>
                      </div>
                      <div>
                        <span>Cash needed upfront</span>
                        <strong>{formatCurrency(affordable.upfrontRon, 'RON')}</strong>
                      </div>
                      {scenario.type === 'financial' && (
                        <div>
                          <span>Buy-out at end of term</span>
                          <strong>€{Math.round(affordable.buyoutEur).toLocaleString()}</strong>
                        </div>
                      )}
                    </>
                  ) : (
                    <div>
                      <span>Maximum monthly fee</span>
                      <strong>€{Math.round(affordable.maxMonthlyFeeEur).toLocaleString()}</strong>
                    </div>
                  )}
                </div>
                <div className="car-budget-actions">
                  <button
                    className="btn"
                    onClick={() => setBudgetRon(Math.round(result.totalMonthlyCostRon / 50) * 50)}
                  >
                    Match current scenario
                  </button>
                  {affordable.maxPriceEur != null && affordable.maxPriceEur > 0 && (
                    <button
                      className="btn"
                      onClick={() =>
                        updateScenario('priceEur', Math.floor(affordable.maxPriceEur / 100) * 100)
                      }
                    >
                      Use max price in simulator
                    </button>
                  )}
                </div>
                <p className="section-note">
                  Uses the rate, term, down payment and residual entered on the left. A higher rate
                  or shorter term lowers the maximum.
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="car-saved-title">
        <div className="car-saved-heading">
          <div>
            <div className="card-title" id="car-saved-title">
              Saved cars
            </div>
            <p className="section-note">
              Keep listing links and use a car&rsquo;s price in the simulator.
            </p>
          </div>
          <button
            className="btn btn-primary"
            disabled={!!editing}
            onClick={() => {
              setMessage('');
              setEditing(blankListing());
            }}
          >
            <Plus size={17} aria-hidden="true" />
            Add car
          </button>
        </div>
        {message && (
          <p className="section-note" role="status">
            {message}
          </p>
        )}
        {editing && (
          <ListingForm
            draft={editing}
            onChange={setEditing}
            onSave={saveListing}
            onCancel={() => setEditing(null)}
          />
        )}
        {listings.length === 0 && !editing && <p className="section-note">No saved cars yet.</p>}
        <ul className="car-listing-list">
          {listings.map((car) => (
            <li key={car.id} className="car-listing">
              <div>
                <strong>{car.name}</strong>
                <span className={`status-pill ${car.status === 'shortlisted' ? 'success' : ''}`}>
                  {STATUS_LABELS[car.status]}
                </span>
                <p>
                  {[
                    car.priceEur ? `€${car.priceEur.toLocaleString()}` : null,
                    car.year,
                    car.mileageKm != null ? `${car.mileageKm.toLocaleString()} km` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No details yet'}
                </p>
                {car.notes && <p>{car.notes}</p>}
              </div>
              <div className="car-listing-actions">
                {car.url && (
                  <a
                    className="btn"
                    href={car.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open listing for ${car.name}`}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    Open
                  </a>
                )}
                {car.priceEur > 0 && (
                  <button
                    className="btn"
                    aria-label={`Use ${car.name} price in simulator`}
                    onClick={() => updateScenario('priceEur', car.priceEur)}
                  >
                    <Wallet size={14} aria-hidden="true" />
                    Simulate
                  </button>
                )}
                <button
                  className="btn"
                  disabled={!!editing}
                  aria-label={`Edit ${car.name}`}
                  onClick={() => {
                    setMessage('');
                    setEditing({ ...car, year: car.year ?? '', mileageKm: car.mileageKm ?? '' });
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </button>
                <button
                  className="btn"
                  aria-label={`Delete ${car.name}`}
                  onClick={() => {
                    removeCarListing(car.id);
                    setMessage('Car removed.');
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="car-method-title">
        <div className="card-title" id="car-method-title">
          How to read it
        </div>
        <div className="rent-method-grid">
          <div>
            <CarFront size={18} />
            <strong>Total car cost</strong>
            <span>Payment plus insurance, servicing, fuel and road tax, compared with income.</span>
          </div>
          <div>
            <Scale size={18} />
            <strong>Two income views</strong>
            <span>
              Status uses salary plus yearly extras. The salary-only figure is the stress view.
            </span>
          </div>
          <div>
            <Wallet size={18} />
            <strong>Lease types differ</strong>
            <span>
              Financial leases end in a buy-out, operational leases do not, loans end in ownership.
            </span>
          </div>
          <div>
            <Scale size={18} />
            <strong>Planning signal only</strong>
            <span>The 15/20/25% thresholds are guides, not lending or financial advice.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
