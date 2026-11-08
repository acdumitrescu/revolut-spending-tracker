import { describe, expect, it } from 'vitest';
import { calculateRentAffordability } from '../lib/rentAffordability';

const baseScenario = {
  netIncomeRon: 9000,
  rentEur: 550,
  utilitiesRon: 600,
  eurRonRate: 5.25,
  otherFixedCostsRon: 1000,
  savingsTargetPct: 20,
};

describe('rent affordability calculator', () => {
  it('calculates the complete monthly housing burden and remaining cash flow', () => {
    const result = calculateRentAffordability(baseScenario);

    expect(result.housingCostRon).toBeCloseTo(3487.5);
    expect(result.housingBurdenPct).toBeCloseTo(38.75);
    expect(result.afterHousingRon).toBeCloseTo(5512.5);
    expect(result.savingsTargetRon).toBe(1800);
    expect(result.flexibleMoneyRon).toBeCloseTo(2712.5);
    expect(result.status).toBe('stretched');
  });

  it('calculates healthy and outer-limit rents after utilities', () => {
    const result = calculateRentAffordability(baseScenario);

    expect(result.recommendedMaxRentEur).toBe(400);
    expect(result.outerMaxRentEur).toBeCloseTo(485.714);
  });

  it.each([
    [500, 'healthy'],
    [550, 'manageable'],
    [650, 'stretched'],
    [700, 'fragile'],
  ])('classifies a %s EUR rent as %s', (rentEur, expectedStatus) => {
    const result = calculateRentAffordability({
      ...baseScenario,
      rentEur,
      utilitiesRon: 0,
    });

    expect(result.status).toBe(expectedStatus);
  });

  it('returns an incomplete result instead of dividing by zero', () => {
    expect(calculateRentAffordability({ ...baseScenario, netIncomeRon: 0 })).toMatchObject({
      isValid: false,
      status: 'incomplete',
      housingBurdenPct: 0,
    });
  });
});
