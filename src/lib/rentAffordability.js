const HEALTHY_HOUSING_SHARE = 0.3;
const OUTER_HOUSING_SHARE = 0.35;
const FRAGILE_HOUSING_SHARE = 0.4;

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

export function calculateRentAffordability({
  netIncomeRon,
  rentEur,
  utilitiesRon,
  eurRonRate,
  otherFixedCostsRon,
  savingsTargetPct,
}) {
  const income = nonNegativeNumber(netIncomeRon);
  const rent = nonNegativeNumber(rentEur);
  const utilities = nonNegativeNumber(utilitiesRon);
  const fxRate = nonNegativeNumber(eurRonRate);
  const fixedCosts = nonNegativeNumber(otherFixedCostsRon);
  const savingsPct = Math.min(80, nonNegativeNumber(savingsTargetPct));
  const isValid = income > 0 && fxRate > 0;

  if (!isValid) {
    return {
      isValid: false,
      status: 'incomplete',
      statusLabel: 'Add income and FX rate',
      housingCostRon: 0,
      housingBurdenPct: 0,
      recommendedMaxRentEur: 0,
      outerMaxRentEur: 0,
      afterHousingRon: 0,
      savingsTargetRon: 0,
      flexibleMoneyRon: 0,
    };
  }

  const housingCostRon = rent * fxRate + utilities;
  const housingBurden = housingCostRon / income;
  const savingsTargetRon = income * (savingsPct / 100);

  let status = 'healthy';
  let statusLabel = 'Healthy';
  if (housingBurden > FRAGILE_HOUSING_SHARE) {
    status = 'fragile';
    statusLabel = 'Financially fragile';
  } else if (housingBurden > OUTER_HOUSING_SHARE) {
    status = 'stretched';
    statusLabel = 'Stretched';
  } else if (housingBurden > HEALTHY_HOUSING_SHARE) {
    status = 'manageable';
    statusLabel = 'Manageable';
  }

  return {
    isValid: true,
    status,
    statusLabel,
    housingCostRon,
    housingBurdenPct: housingBurden * 100,
    recommendedMaxRentEur: Math.max(0, (income * HEALTHY_HOUSING_SHARE - utilities) / fxRate),
    outerMaxRentEur: Math.max(0, (income * OUTER_HOUSING_SHARE - utilities) / fxRate),
    afterHousingRon: income - housingCostRon,
    savingsTargetRon,
    flexibleMoneyRon: income - housingCostRon - fixedCosts - savingsTargetRon,
  };
}
