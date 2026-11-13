export const emptyMoneyFlow = () => ({ incomes: [], transfers: [] });

export function moneyToMinor(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value).trim()))
    throw new Error('Enter a positive amount with at most two decimal places.');
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1e12)
    throw new Error('Enter an amount between 0.01 and 10,000,000,000.');
  return amount;
}

export function incomeAllocation(income, transfers) {
  const rows = transfers.filter((row) => row.incomeId === income.id);
  const planned = rows
    .filter((row) => row.status === 'planned')
    .reduce((sum, row) => sum + row.amountMinor, 0);
  const completed = rows
    .filter((row) => row.status === 'completed')
    .reduce((sum, row) => sum + row.amountMinor, 0);
  return { planned, completed, remaining: income.amountMinor - planned - completed };
}

export function incomeTotals(incomes) {
  return incomes.reduce(
    (totals, row) => ({ ...totals, [row.currency]: (totals[row.currency] || 0) + row.amountMinor }),
    {},
  );
}

export function monthlyIncome(incomes, year, currency) {
  const totals = Array(12).fill(0);
  for (const income of incomes) {
    if (income.date.slice(0, 4) === String(year) && income.currency === currency) {
      totals[Number(income.date.slice(5, 7)) - 1] += income.amountMinor;
    }
  }
  return totals;
}
