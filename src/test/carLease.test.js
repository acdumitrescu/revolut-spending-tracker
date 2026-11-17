import { describe, expect, it } from 'vitest';
import {
  amortizedPayment,
  calculateAffordableCar,
  calculateCarLease,
  healthyMonthlyBudgetRon,
} from '../lib/carLease';
import { appReducer, createPersistedAppState } from '../lib/appState';
import { parseImportedAppState, serializeBackupState } from '../lib/persistence';
import { CarListingSchema, sanitizeAppData } from '../lib/validation';
import { shouldLoadRemoteAtBootstrap } from '../lib/serverSync';
import { applyWorkspaceChanges } from '../../backend/workspaceChanges';

const base = {
  type: 'financial',
  netMonthlyIncomeRon: 10000,
  annualExtraIncomeRon: 0,
  eurRonRate: 5,
  priceEur: 20000,
  downPaymentPct: 20,
  termMonths: 48,
  annualRatePct: 0,
  residualPct: 0,
  adminFeePct: 0,
  insuranceRonYear: 0,
  maintenanceRonYear: 0,
  fuelRonMonth: 0,
  roadTaxRonYear: 0,
  otherFixedCostsRon: 0,
  savingsTargetPct: 0,
};
const listing = (overrides = {}) => ({
  id: 'c1',
  name: 'Synthetic car',
  url: 'https://example.com/listing/1',
  priceEur: 15000,
  year: 2022,
  mileageKm: 40000,
  status: 'considering',
  notes: '',
  ...overrides,
});

describe('car lease calculation', () => {
  it('amortizes with and without interest or a balloon', () => {
    expect(amortizedPayment(16000, 0, 48)).toBeCloseTo(333.33, 2);
    expect(amortizedPayment(16000, 0, 48, 4000)).toBeCloseTo(250, 2);
    expect(amortizedPayment(10000, 12, 12)).toBeCloseTo(888.49, 2);
  });

  it('prices a zero-rate financial lease in RON and reports upfront cash', () => {
    const r = calculateCarLease(base);
    expect(r.monthlyPaymentRon).toBeCloseTo(333.33 * 5, 0);
    expect(r.upfrontRon).toBeCloseTo(4000 * 5, 5);
    expect(r.financingCostRon).toBeCloseTo(0, 5);
    expect(r.status).toBe('manageable');
  });

  it('includes the residual buy-out in the financial lease total', () => {
    const r = calculateCarLease({ ...base, residualPct: 25 });
    expect(r.endOfTermRon).toBeCloseTo(5000 * 5, 5);
    expect(r.totalPaidRon).toBeCloseTo(20000 * 5, 5);
  });

  it('uses yearly extras for the status but keeps a salary-only stress figure', () => {
    const stretched = calculateCarLease({ ...base, fuelRonMonth: 500 });
    expect(stretched.status).toBe('stretched');
    const withBonus = calculateCarLease({
      ...base,
      fuelRonMonth: 500,
      annualExtraIncomeRon: 60000,
    });
    expect(withBonus.blendedBurdenPct).toBeLessThan(stretched.blendedBurdenPct);
    expect(withBonus.salaryBurdenPct).toBeCloseTo(stretched.salaryBurdenPct, 5);
    expect(withBonus.status).not.toBe('stretched');
  });

  it('treats operational deposits as tied-up cash and drops bundled services', () => {
    const op = {
      ...base,
      type: 'operational',
      operationalMonthlyEur: 400,
      operationalDepositEur: 1000,
      operationalFeeEur: 100,
      insuranceRonYear: 2400,
      maintenanceRonYear: 1200,
    };
    const separate = calculateCarLease(op);
    const bundled = calculateCarLease({ ...op, operationalIncludesService: true });
    expect(separate.upfrontRon).toBeCloseTo(1100 * 5, 5);
    expect(separate.financingCostRon).toBeCloseTo((100 + 400 * 48) * 5, 5);
    expect(separate.runningCostsRon - bundled.runningCostsRon).toBeCloseTo(300, 5);
  });

  it('handles cash purchases and invalid inputs', () => {
    const cash = calculateCarLease({ ...base, type: 'cash' });
    expect(cash.monthlyPaymentRon).toBe(0);
    expect(cash.upfrontRon).toBe(100000);
    expect(cash.monthsToSaveUpfront).toBe(10);
    expect(calculateCarLease({ ...base, netMonthlyIncomeRon: 0 }).isValid).toBe(false);
    expect(calculateCarLease({ ...base, eurRonRate: 'abc' }).status).toBe('incomplete');
  });
});

describe('affordable car for a monthly budget', () => {
  it('round-trips: the max price reproduces the budget in the forward calculation', () => {
    const terms = {
      ...base,
      annualRatePct: 7.5,
      residualPct: 20,
      adminFeePct: 1,
      fuelRonMonth: 600,
      insuranceRonYear: 3000,
    };
    const budget = 2500;
    const max = calculateAffordableCar(terms, budget);
    expect(max.maxLoanEur).toBeCloseTo(max.maxPriceEur * 0.8, 6);
    const forward = calculateCarLease({ ...terms, priceEur: max.maxPriceEur });
    expect(forward.totalMonthlyCostRon).toBeCloseTo(budget, 4);
  });

  it('has no price room when the budget does not cover running costs', () => {
    const max = calculateAffordableCar({ ...base, fuelRonMonth: 900 }, 500);
    expect(max.paymentRoomRon).toBe(0);
    expect(max.maxPriceEur).toBe(0);
  });

  it('returns a maximum monthly fee for operational leases and no price for cash', () => {
    const op = calculateAffordableCar(
      { ...base, type: 'operational', operationalIncludesService: true },
      2500,
    );
    expect(op.maxMonthlyFeeEur).toBeCloseTo(500, 6);
    expect(op.maxPriceEur).toBeNull();
    expect(calculateAffordableCar({ ...base, type: 'cash' }, 2500).supported).toBe(false);
    expect(calculateAffordableCar({ ...base, netMonthlyIncomeRon: 0 }, 2500).isValid).toBe(false);
  });

  it('defaults the budget to the healthy share of income including yearly extras', () => {
    expect(
      healthyMonthlyBudgetRon({ netMonthlyIncomeRon: 10000, annualExtraIncomeRon: 12000 }),
    ).toBe(1650);
  });
});

describe('saved car listings', () => {
  it('accepts only http and https links', () => {
    expect(CarListingSchema.safeParse(listing()).success).toBe(true);
    expect(CarListingSchema.safeParse(listing({ url: '' })).success).toBe(true);
    expect(CarListingSchema.safeParse(listing({ url: 'javascript:alert(1)' })).success).toBe(false);
    expect(CarListingSchema.safeParse(listing({ url: 'not a url' })).success).toBe(false);
  });

  it('edits and removes by ID and survives backup, sync changes and legacy state', () => {
    let state = createPersistedAppState();
    state = appReducer(state, { type: 'upsert_car_listing', listing: listing() });
    state = appReducer(state, {
      type: 'upsert_car_listing',
      listing: listing({ status: 'shortlisted' }),
    });
    expect(state.data.carListings).toHaveLength(1);
    expect(state.data.carListings[0].status).toBe('shortlisted');
    expect(parseImportedAppState(serializeBackupState(state)).data.carListings).toEqual(
      state.data.carListings,
    );
    const updated = applyWorkspaceChanges(
      { version: 1, data: createPersistedAppState() },
      { version: 1, changes: [{ field: 'carListings', value: state.data.carListings }] },
    );
    expect(updated.data.carListings).toEqual(state.data.carListings);
    expect(shouldLoadRemoteAtBootstrap(updated, createPersistedAppState())).toBe(true);
    const legacy = createPersistedAppState();
    delete legacy.data.carListings;
    expect(parseImportedAppState(JSON.stringify(legacy)).data.carListings).toEqual([]);
    expect(
      sanitizeAppData({ ...state.data, carListings: [listing(), { id: 'bad' }] }).carListings,
    ).toHaveLength(1);
    state = appReducer(state, { type: 'remove_car_listing', id: 'c1' });
    expect(state.data.carListings).toEqual([]);
  });

  it('rejects an invalid listing without changing state', () => {
    const state = createPersistedAppState();
    expect(
      appReducer(state, { type: 'upsert_car_listing', listing: listing({ url: 'ftp://x' }) }),
    ).toBe(state);
  });
});
