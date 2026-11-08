export function calculateCashFlowScenario({ startingBalance, monthlyIncome, monthlyExpenses, months = 12 }) {
  for (const value of [startingBalance, monthlyIncome, monthlyExpenses]) {
    if (!Number.isFinite(value) || Math.abs(value) > 1e10) throw new Error('Enter valid amounts within 10 billion RON.');
  }
  if (monthlyIncome < 0 || monthlyExpenses < 0) throw new Error('Income and expenses must be zero or greater.');
  if (![3, 6, 12, 24].includes(months)) throw new Error('Choose a supported forecast period.');
  const startMinor = Math.round(startingBalance * 100);
  const netMinor = Math.round(monthlyIncome * 100) - Math.round(monthlyExpenses * 100);
  const balances = Array.from({length: months + 1}, (_, month) => (startMinor + month * netMinor) / 100);
  return { monthlyNet: netMinor / 100, balances, endingBalance: balances.at(-1), totalChange: months * netMinor / 100 };
}

export function calculateForecastScenario({ avgMonthlyExp, avgMonthlyNet, currentTotalBalance, customMonthlySavings = null, expenseReduction = 0, monthlyExpenseBudget = null, emergencyMonths = 6 }) {
  if (monthlyExpenseBudget !== null && (!Number.isFinite(monthlyExpenseBudget) || monthlyExpenseBudget < 0)) throw new Error('Monthly expense budget must be a non-negative number.');
  const projectedMonthlyExp = monthlyExpenseBudget ?? (avgMonthlyExp - Math.min(avgMonthlyExp, Math.max(0, Number(expenseReduction) || 0)));
  const appliedReduction = avgMonthlyExp - projectedMonthlyExp;
  const projectedMonthlyNet = avgMonthlyNet + appliedReduction;
  // A custom amount is the savings baseline before this scenario's reduction.
  const effectiveMonthlySavings = (customMonthlySavings ?? avgMonthlyNet) + appliedReduction;
  const emergencyFundTarget = projectedMonthlyExp * emergencyMonths;
  const monthsToEmergencyFund = currentTotalBalance >= emergencyFundTarget
    ? 0
    : effectiveMonthlySavings > 0
      ? Math.ceil((emergencyFundTarget - currentTotalBalance) / effectiveMonthlySavings)
      : null;
  return { appliedReduction, projectedMonthlyExp, projectedMonthlyNet, effectiveMonthlySavings, emergencyFundTarget, monthsToEmergencyFund };
}
