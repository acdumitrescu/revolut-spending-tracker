// Planning thresholds for total monthly car cost as a share of net income.
// These are guides, not lending or financial advice.
const HEALTHY_CAR_SHARE = 0.15;
const MANAGEABLE_CAR_SHARE = 0.2;
const OUTER_CAR_SHARE = 0.25;

export const LEASE_TYPES = {
  financial: 'Financial lease',
  operational: 'Operational lease',
  loan: 'Car loan',
  cash: 'Cash purchase',
};

function nonNegativeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

// Level payment that amortizes `principal` down to `balloon` over `months`.
export function amortizedPayment(principal, annualRatePct, months, balloon = 0) {
  if (months <= 0) return 0;
  const monthlyRate = annualRatePct / 100 / 12;
  if (monthlyRate === 0) return Math.max(0, (principal - balloon) / months);
  const growth = (1 + monthlyRate) ** months;
  return Math.max(0, ((principal - balloon / growth) * monthlyRate) / (1 - 1 / growth));
}

function financedOffer(input) {
  const price = nonNegativeNumber(input.priceEur);
  const months = Math.max(1, Math.round(nonNegativeNumber(input.termMonths)));
  const downPayment = price * (Math.min(90, nonNegativeNumber(input.downPaymentPct)) / 100);
  const fee = price * (nonNegativeNumber(input.adminFeePct) / 100);
  const balloon =
    input.type === 'financial'
      ? price * (Math.min(60, nonNegativeNumber(input.residualPct)) / 100)
      : 0;
  const principal = price - downPayment;
  const monthly = amortizedPayment(
    principal,
    nonNegativeNumber(input.annualRatePct),
    months,
    balloon,
  );
  return {
    months,
    monthlyPaymentEur: monthly,
    upfrontEur: downPayment + fee,
    // Buying the car out at the end of a financial lease is part of owning it.
    endOfTermEur: balloon,
    totalPaidEur: downPayment + fee + monthly * months + balloon,
    financingCostEur: downPayment + fee + monthly * months + balloon - price,
  };
}

function operationalOffer(input) {
  const months = Math.max(1, Math.round(nonNegativeNumber(input.termMonths)));
  const monthly = nonNegativeNumber(input.operationalMonthlyEur);
  const deposit = nonNegativeNumber(input.operationalDepositEur);
  const fee = nonNegativeNumber(input.operationalFeeEur);
  return {
    months,
    monthlyPaymentEur: monthly,
    // The deposit is returned at the end, so it is cash tied up, not a cost.
    upfrontEur: deposit + fee,
    endOfTermEur: 0,
    totalPaidEur: fee + monthly * months,
    financingCostEur: fee + monthly * months,
  };
}

function cashOffer(input) {
  const price = nonNegativeNumber(input.priceEur);
  return {
    months: 0,
    monthlyPaymentEur: 0,
    upfrontEur: price,
    endOfTermEur: 0,
    totalPaidEur: price,
    financingCostEur: 0,
  };
}

function statusFor(share) {
  if (share > OUTER_CAR_SHARE) return { status: 'fragile', statusLabel: 'Financially fragile' };
  if (share > MANAGEABLE_CAR_SHARE) return { status: 'stretched', statusLabel: 'Stretched' };
  if (share > HEALTHY_CAR_SHARE) return { status: 'manageable', statusLabel: 'Manageable' };
  return { status: 'healthy', statusLabel: 'Healthy' };
}

function monthlyRunningCostsRon(input) {
  const insurance = nonNegativeNumber(input.insuranceRonYear) / 12;
  const maintenance = nonNegativeNumber(input.maintenanceRonYear) / 12;
  const fuel = nonNegativeNumber(input.fuelRonMonth);
  const tax = nonNegativeNumber(input.roadTaxRonYear) / 12;
  // An operational lease may already bundle insurance and servicing.
  const bundled = input.type === 'operational' && Boolean(input.operationalIncludesService);
  return fuel + tax + (bundled ? 0 : insurance + maintenance);
}

export function effectiveMonthlyIncomeRon(input) {
  return (
    (nonNegativeNumber(input.netMonthlyIncomeRon) * 12 +
      nonNegativeNumber(input.annualExtraIncomeRon)) /
    12
  );
}

// Default total-monthly-cost budget: the healthy planning share of income.
export function healthyMonthlyBudgetRon(input) {
  return Math.round(effectiveMonthlyIncomeRon(input) * HEALTHY_CAR_SHARE);
}

// Works the simulation backwards: given a total monthly car budget, how large a
// loan / car price fits the terms already entered.
export function calculateAffordableCar(input, budgetRon) {
  const fxRate = nonNegativeNumber(input.eurRonRate);
  const budget = nonNegativeNumber(budgetRon);
  if (!(effectiveMonthlyIncomeRon(input) > 0 && fxRate > 0)) return { isValid: false };

  const runningCostsRon = monthlyRunningCostsRon(input);
  const paymentRoomRon = Math.max(0, budget - runningCostsRon);
  const paymentRoomEur = paymentRoomRon / fxRate;
  const base = { isValid: true, type: input.type, runningCostsRon, paymentRoomRon };

  if (input.type === 'cash') return { ...base, supported: false };
  if (input.type === 'operational') {
    return {
      ...base,
      supported: true,
      maxMonthlyFeeEur: paymentRoomEur,
      maxPriceEur: null,
      maxLoanEur: null,
      upfrontRon: 0,
    };
  }

  const months = Math.max(1, Math.round(nonNegativeNumber(input.termMonths)));
  const downShare = Math.min(90, nonNegativeNumber(input.downPaymentPct)) / 100;
  const feeShare = nonNegativeNumber(input.adminFeePct) / 100;
  const residualShare =
    input.type === 'financial' ? Math.min(60, nonNegativeNumber(input.residualPct)) / 100 : 0;
  // The payment is linear in the price, so price one unit of car and scale.
  const paymentPerEuro = amortizedPayment(
    1 - downShare,
    nonNegativeNumber(input.annualRatePct),
    months,
    residualShare,
  );
  const maxPriceEur = paymentPerEuro > 0 ? paymentRoomEur / paymentPerEuro : 0;
  return {
    ...base,
    supported: true,
    months,
    maxPriceEur,
    maxLoanEur: maxPriceEur * (1 - downShare),
    upfrontRon: maxPriceEur * (downShare + feeShare) * fxRate,
    buyoutEur: maxPriceEur * residualShare,
  };
}

export function calculateCarLease(input) {
  const monthlyIncome = nonNegativeNumber(input.netMonthlyIncomeRon);
  const annualExtras = nonNegativeNumber(input.annualExtraIncomeRon);
  const fxRate = nonNegativeNumber(input.eurRonRate);
  const annualIncome = monthlyIncome * 12 + annualExtras;
  const isValid = monthlyIncome > 0 && fxRate > 0;

  const empty = {
    isValid: false,
    status: 'incomplete',
    statusLabel: 'Add income and FX rate',
    monthlyPaymentRon: 0,
    runningCostsRon: 0,
    totalMonthlyCostRon: 0,
    upfrontRon: 0,
    endOfTermRon: 0,
    totalPaidRon: 0,
    financingCostRon: 0,
    salaryBurdenPct: 0,
    blendedBurdenPct: 0,
    annualCostRon: 0,
    annualIncomeRon: annualIncome,
    maxMonthlyPaymentRon: 0,
    flexibleMoneyRon: 0,
    savingsTargetRon: 0,
    monthsToSaveUpfront: null,
    termMonths: 0,
  };
  if (!isValid) return empty;

  const offer =
    input.type === 'operational'
      ? operationalOffer(input)
      : input.type === 'cash'
        ? cashOffer(input)
        : financedOffer(input);

  const runningCostsRon = monthlyRunningCostsRon(input);

  const monthlyPaymentRon = offer.monthlyPaymentEur * fxRate;
  const totalMonthlyCostRon = monthlyPaymentRon + runningCostsRon;
  const annualCostRon = totalMonthlyCostRon * 12;
  const salaryShare = totalMonthlyCostRon / monthlyIncome;
  const blendedShare = annualCostRon / annualIncome;
  const effectiveMonthly = annualIncome / 12;
  const savingsTargetRon =
    effectiveMonthly * (Math.min(80, nonNegativeNumber(input.savingsTargetPct)) / 100);
  const otherFixed = nonNegativeNumber(input.otherFixedCostsRon);
  const flexibleMoneyRon = effectiveMonthly - totalMonthlyCostRon - otherFixed - savingsTargetRon;
  const upfrontRon = offer.upfrontEur * fxRate;
  const monthlySaving = Math.max(
    0,
    effectiveMonthly - otherFixed - savingsTargetRon - runningCostsRon,
  );

  return {
    isValid: true,
    // Status uses income including annual extras; salaryBurdenPct is the stress view.
    ...statusFor(blendedShare),
    monthlyPaymentRon,
    runningCostsRon,
    totalMonthlyCostRon,
    upfrontRon,
    endOfTermRon: offer.endOfTermEur * fxRate,
    totalPaidRon: offer.totalPaidEur * fxRate,
    financingCostRon: offer.financingCostEur * fxRate,
    salaryBurdenPct: salaryShare * 100,
    blendedBurdenPct: blendedShare * 100,
    annualCostRon,
    annualIncomeRon: annualIncome,
    maxMonthlyPaymentRon: Math.max(0, effectiveMonthly * HEALTHY_CAR_SHARE - runningCostsRon),
    flexibleMoneyRon,
    savingsTargetRon,
    monthsToSaveUpfront:
      upfrontRon > 0 && monthlySaving > 0 ? Math.ceil(upfrontRon / monthlySaving) : null,
    termMonths: offer.months,
  };
}
