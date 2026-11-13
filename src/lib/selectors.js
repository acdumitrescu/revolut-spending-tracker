import { BASE_CURRENCY, convertAmountToDisplay, getEffectiveCurrency } from './fx';

export const REFUND_CATEGORY = 'Refunds';

export function getTransactionCurrencies(transactions) {
  return [
    ...new Set(
      transactions
        .map((txn) => getEffectiveCurrency(txn))
        .filter((currency) => typeof currency === 'string' && currency.trim()),
    ),
  ].sort();
}

export function getCurrencySummary(transactions) {
  const currencies = getTransactionCurrencies(transactions);
  return {
    currencies,
    hasCurrencies: currencies.length > 0,
    hasMixedCurrencies: currencies.length > 1,
    primaryCurrency: currencies.length === 1 ? currencies[0] : null,
  };
}

export function getUniqueYears(transactions) {
  return [
    ...new Set(
      transactions
        .map((txn) => String(txn.date || '').substring(0, 4))
        .filter((year) => /^\d{4}$/.test(year)),
    ),
  ].sort((a, b) => b.localeCompare(a));
}

export function filterTransactionsByPeriod(
  transactions,
  timeFilter = 'ALL TIME',
  yearFilter = 'ALL',
) {
  const now = new Date();
  const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return transactions.filter((txn) => {
    if (yearFilter !== 'ALL' && !txn.date.startsWith(yearFilter)) return false;

    if (timeFilter !== 'ALL TIME') {
      const txDate = new Date(txn.date);
      const diffTime = now.getTime() - txDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (timeFilter === 'Today' && txn.date !== todayLocal) return false;
      if (timeFilter === 'Last Week' && diffDays > 7) return false;
      if (timeFilter === 'Last Month' && diffDays > 30) return false;
      if (timeFilter === 'Last Year' && diffDays > 365) return false;
    }

    return true;
  });
}

function convertTxnAmount(txn, displayCurrency = BASE_CURRENCY, fxRates) {
  return convertAmountToDisplay(txn.amt, getEffectiveCurrency(txn), displayCurrency, fxRates);
}

export function sortMonths(months) {
  return [...months].sort((a, b) => a.localeCompare(b));
}

export function getUniqueMonths(transactions) {
  return sortMonths(new Set(transactions.map((txn) => txn.ym)));
}

export function getLatestMonth(transactions) {
  return getUniqueMonths(transactions).at(-1) || new Date().toISOString().slice(0, 7);
}

export function shiftMonth(month, offset) {
  const [year, monthNumber] = String(month).split('-').map(Number);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return month;
  }
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isExpenseTransaction(txn) {
  return txn.flow === 'Debit' && !isTransferLikeTransaction(txn);
}

export function isRefundTransaction(txn) {
  return txn.flow === 'Credit' && txn.cat === REFUND_CATEGORY;
}

export function isIncomeTransaction(txn) {
  return txn.flow === 'Credit' && txn.cat === 'Income';
}

export function isTransferLikeTransaction(txn) {
  return txn.cat === 'Transfers' || txn.cat === 'Savings';
}

export function getMonthlyIncome(transactions, month, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  return transactions
    .filter((txn) => txn.ym === month && isIncomeTransaction(txn))
    .reduce((sum, txn) => sum + convertTxnAmount(txn, displayCurrency, fxRates), 0);
}

export function getMonthlyExpense(transactions, month, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const monthTransactions = transactions.filter((txn) => txn.ym === month);
  const expenses = monthTransactions
    .filter(isExpenseTransaction)
    .reduce((sum, txn) => sum + Math.abs(convertTxnAmount(txn, displayCurrency, fxRates)), 0);
  const refunds = monthTransactions
    .filter(isRefundTransaction)
    .reduce((sum, txn) => sum + Math.abs(convertTxnAmount(txn, displayCurrency, fxRates)), 0);
  return Math.max(0, expenses - refunds);
}

export function getMonthlySummary(transactions, options = {}) {
  return getUniqueMonths(transactions).map((month) => {
    const inc = getMonthlyIncome(transactions, month, options);
    const exp = getMonthlyExpense(transactions, month, options);
    return { month, inc, exp, net: inc - exp };
  });
}

export function getCalendarYearMonthlySummary(
  transactions,
  year = new Date().getFullYear(),
  options = {},
) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const inc = getMonthlyIncome(transactions, month, options);
    const exp = getMonthlyExpense(transactions, month, options);
    return { month, inc, exp, net: inc - exp };
  });
}

export function getRolling12MonthSummary(transactions, endDate = new Date(), options = {}) {
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();

  return Array.from({ length: 12 }, (_, index) => {
    const cursor = new Date(endYear, endMonth - (11 - index), 1);
    const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const inc = getMonthlyIncome(transactions, month, options);
    const exp = getMonthlyExpense(transactions, month, options);
    return { month, inc, exp, net: inc - exp };
  });
}

export function getDailySpend(transactions, month, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const monthTxns = transactions.filter((txn) => txn.ym === month);
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const daily = Array.from({ length: daysInMonth }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, '0')}`,
    day: index + 1,
    spend: 0,
    income: 0,
    refunds: 0,
  }));

  const byDate = Object.fromEntries(daily.map((entry) => [entry.date, entry]));
  monthTxns.forEach((txn) => {
    const bucket = byDate[txn.date];
    if (!bucket) return;
    const convertedAmount = convertTxnAmount(txn, displayCurrency, fxRates);
    if (isExpenseTransaction(txn)) bucket.spend += Math.abs(convertedAmount);
    if (isIncomeTransaction(txn)) bucket.income += convertedAmount;
    if (isRefundTransaction(txn)) bucket.refunds += Math.abs(convertedAmount);
  });

  return daily.map((entry) => ({
    ...entry,
    spendNet: Math.max(0, entry.spend - entry.refunds),
  }));
}

export function getCategoryTotals(transactions, month = null, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  return transactions
    .filter((txn) => (month ? txn.ym === month : true))
    .reduce((totals, txn) => {
      if (isExpenseTransaction(txn)) {
        totals[txn.cat] =
          (totals[txn.cat] || 0) + Math.abs(convertTxnAmount(txn, displayCurrency, fxRates));
      }
      if (isRefundTransaction(txn)) {
        totals[REFUND_CATEGORY] =
          (totals[REFUND_CATEGORY] || 0) +
          Math.abs(convertTxnAmount(txn, displayCurrency, fxRates));
      }
      return totals;
    }, {});
}

export function getVendorTotals(transactions, month = null, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  return transactions
    .filter((txn) => (month ? txn.ym === month : true))
    .reduce((vendors, txn) => {
      if (!isExpenseTransaction(txn)) return vendors;
      if (!vendors[txn.desc]) vendors[txn.desc] = { total: 0, count: 0, cat: txn.cat };
      vendors[txn.desc].total += Math.abs(convertTxnAmount(txn, displayCurrency, fxRates));
      vendors[txn.desc].count += 1;
      return vendors;
    }, {});
}

export function getAccountCurrency(account) {
  return account?.currency || BASE_CURRENCY;
}

export function getAccountTotalsByMonth(accounts, options = {}) {
  const months = [...new Set(accounts.flatMap((account) => Object.keys(account.balances)))];
  return sortMonths(months).map((month) => ({
    month,
    total: getAccountBalanceSnapshot(accounts, { ...options, month }).total,
  }));
}

export function getAccountBalanceSnapshot(accounts, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const month =
    options.month ||
    accounts
      .flatMap((account) => Object.keys(account.balances))
      .sort()
      .at(-1);
  let total = 0;
  let updated = 0;
  let carried = 0;
  let missing = 0;
  accounts.forEach((account) => {
    const recordedMonth = Object.keys(account.balances)
      .filter((key) => key <= month)
      .sort()
      .at(-1);
    if (!recordedMonth) {
      missing += 1;
      return;
    }
    total += convertAmountToDisplay(
      account.balances[recordedMonth],
      getAccountCurrency(account),
      displayCurrency,
      fxRates,
    );
    if (recordedMonth === month) updated += 1;
    else carried += 1;
  });
  return { month, total, updated, carried, missing };
}

export function getLatestAccountTotal(accounts, options = {}) {
  return getAccountBalanceSnapshot(accounts, options).total;
}

export function getLatestAccountTotalsByCurrency(accounts = []) {
  const totals = new Map();

  accounts.forEach((account) => {
    const currency = getAccountCurrency(account);
    const latestMonth = Object.keys(account.balances || {})
      .sort()
      .at(-1);
    const current = totals.get(currency) || { currency, total: 0, accounts: 0 };
    totals.set(currency, {
      currency,
      total: current.total + (latestMonth ? Number(account.balances[latestMonth]) || 0 : 0),
      accounts: current.accounts + 1,
    });
  });

  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function getAccountEntryMonths(accounts = [], today = new Date()) {
  const recordedMonths = accounts
    .flatMap((account) => [
      ...Object.keys(account.balances || {}),
      ...Object.keys(account.notes || {}),
    ])
    .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    .sort();

  const firstMonth =
    recordedMonths[0] || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const finalYear = Number.parseInt(
    recordedMonths.at(-1)?.slice(0, 4) || String(today.getFullYear()),
    10,
  );
  const [firstYear, firstMonthNumber] = firstMonth.split('-').map(Number);
  const months = [];

  for (let year = firstYear; year <= finalYear; year += 1) {
    const startMonth = year === firstYear ? firstMonthNumber : 1;
    for (let month = startMonth; month <= 12; month += 1) {
      months.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  }

  return months;
}

export function getPortfolioSummary(holdings = [], options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const rows = holdings.map((holding) => {
    const currency = holding.currency || BASE_CURRENCY;
    const marketValue = convertAmountToDisplay(
      holding.quantity * holding.currentPrice,
      currency,
      displayCurrency,
      fxRates,
    );
    const costBasis = convertAmountToDisplay(
      holding.quantity * holding.avgCost,
      currency,
      displayCurrency,
      fxRates,
    );
    const gainLoss = marketValue - costBasis;
    return {
      ...holding,
      marketValue,
      costBasis,
      gainLoss,
      gainLossPct: costBasis > 0 ? gainLoss / costBasis : 0,
    };
  });
  const totalMarketValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
  const totalCostBasis = rows.reduce((sum, row) => sum + row.costBasis, 0);
  const byAssetClass = rows.reduce((totals, row) => {
    totals[row.assetClass] = (totals[row.assetClass] || 0) + row.marketValue;
    return totals;
  }, {});

  return {
    rows,
    totalMarketValue,
    totalCostBasis,
    unrealizedGainLoss: totalMarketValue - totalCostBasis,
    byAssetClass,
    topHoldings: [...rows].sort((a, b) => b.marketValue - a.marketValue).slice(0, 5),
  };
}

export function getBudgetEntries(budgetsByMonth, month, transactions, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const monthBudgets = budgetsByMonth[month] || {};
  const categorySpend = getCategoryTotals(transactions, month, options);
  return Object.entries(monthBudgets).map(([cat, budgeted]) => {
    const convertedBudget = convertAmountToDisplay(
      budgeted,
      BASE_CURRENCY,
      displayCurrency,
      fxRates,
    );
    const spent = categorySpend[cat] || 0;
    const remaining = convertedBudget - spent;
    const pct = convertedBudget > 0 ? Math.min((spent / convertedBudget) * 100, 100) : 0;
    return {
      cat,
      budgeted: convertedBudget,
      spent,
      remaining,
      pct,
      over: spent > convertedBudget,
    };
  });
}

export function getBudgetSummary(budgetsByMonth, month, transactions, options = {}) {
  const entries = getBudgetEntries(budgetsByMonth, month, transactions, options);
  const assigned = entries.reduce((sum, entry) => sum + entry.budgeted, 0);
  const plannedCategorySpending = entries.reduce((sum, entry) => sum + entry.spent, 0);
  const totalSpending = getMonthlyExpense(transactions, month, options);
  const importedIncome = getMonthlyIncome(transactions, month, options);

  return {
    importedIncome,
    assigned,
    totalSpending,
    plannedCategorySpending,
    remaining: assigned - plannedCategorySpending,
    unbudgetedSpending: Math.max(0, totalSpending - plannedCategorySpending),
    unassignedIncome: importedIncome > 0 ? importedIncome - assigned : null,
  };
}

export function getBudgetComparison(budgetsByMonth, month, transactions, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const previousMonth = shiftMonth(month, -1);
  const current = getBudgetSummary(budgetsByMonth, month, transactions, options);
  const previous = getBudgetSummary(budgetsByMonth, previousMonth, transactions, options);
  const currentCategorySpend = getCategoryTotals(transactions, month, options);
  const previousCategorySpend = getCategoryTotals(transactions, previousMonth, options);
  const currentBudgets = budgetsByMonth[month] || {};
  const previousBudgets = budgetsByMonth[previousMonth] || {};
  const categories = [...new Set([...Object.keys(currentBudgets), ...Object.keys(previousBudgets)])]
    .sort()
    .map((category) => {
      const currentAssigned = convertAmountToDisplay(
        currentBudgets[category] || 0,
        BASE_CURRENCY,
        displayCurrency,
        fxRates,
      );
      const previousAssigned = convertAmountToDisplay(
        previousBudgets[category] || 0,
        BASE_CURRENCY,
        displayCurrency,
        fxRates,
      );
      const currentSpent = currentCategorySpend[category] || 0;
      const previousSpent = previousCategorySpend[category] || 0;
      return {
        category,
        currentAssigned,
        previousAssigned,
        assignedDelta: currentAssigned - previousAssigned,
        currentSpent,
        previousSpent,
        spendingDelta: currentSpent - previousSpent,
      };
    });

  return {
    currentMonth: month,
    previousMonth,
    current,
    previous,
    deltas: {
      importedIncome: current.importedIncome - previous.importedIncome,
      assigned: current.assigned - previous.assigned,
      totalSpending: current.totalSpending - previous.totalSpending,
      plannedCategorySpending: current.plannedCategorySpending - previous.plannedCategorySpending,
      remaining: current.remaining - previous.remaining,
      unbudgetedSpending: current.unbudgetedSpending - previous.unbudgetedSpending,
      unassignedIncome:
        current.unassignedIncome === null || previous.unassignedIncome === null
          ? null
          : current.unassignedIncome - previous.unassignedIncome,
    },
    categories,
  };
}
