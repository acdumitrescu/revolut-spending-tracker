import { EXPENSE_CATS } from './utils';
import { BASE_CURRENCY, convertAmountToDisplay, getEffectiveCurrency } from './fx';

export const REFUND_CATEGORY = 'Refunds';

export function getTransactionCurrencies(transactions) {
  return [...new Set(
    transactions
      .map((txn) => getEffectiveCurrency(txn))
      .filter((currency) => typeof currency === 'string' && currency.trim())
  )].sort();
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
  return [...new Set(
    transactions
      .map((txn) => String(txn.date || '').substring(0, 4))
      .filter((year) => /^\d{4}$/.test(year))
  )].sort((a, b) => b.localeCompare(a));
}

export function filterTransactionsByPeriod(transactions, timeFilter = 'ALL TIME', yearFilter = 'ALL') {
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

export function isExpenseTransaction(txn) {
  return txn.flow === 'Debit' && (EXPENSE_CATS.has(txn.cat) || txn.cat === 'Cash');
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

export function getCalendarYearMonthlySummary(transactions, year = new Date().getFullYear(), options = {}) {
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
        totals[txn.cat] = (totals[txn.cat] || 0) + Math.abs(convertTxnAmount(txn, displayCurrency, fxRates));
      }
      if (isRefundTransaction(txn)) {
        totals[REFUND_CATEGORY] = (totals[REFUND_CATEGORY] || 0) + Math.abs(convertTxnAmount(txn, displayCurrency, fxRates));
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
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const monthTotals = {};
  accounts.forEach((account) => {
    const accountCurrency = getAccountCurrency(account);
    Object.entries(account.balances).forEach(([month, balance]) => {
      monthTotals[month] = (monthTotals[month] || 0) + convertAmountToDisplay(balance, accountCurrency, displayCurrency, fxRates);
    });
  });

  return sortMonths(Object.keys(monthTotals)).map((month) => ({
    month,
    total: monthTotals[month],
  }));
}

export function getLatestAccountTotal(accounts, options = {}) {
  const totals = getAccountTotalsByMonth(accounts, options);
  return totals.at(-1)?.total || 0;
}

export function getTotalAccountContributions(accounts, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  return accounts.reduce(
    (sum, account) => sum + convertAmountToDisplay(account.monthlyContribution || 0, getAccountCurrency(account), displayCurrency, fxRates),
    0
  );
}

export function getBudgetEntries(budgetsByMonth, month, transactions, options = {}) {
  const { displayCurrency = BASE_CURRENCY, fxRates } = options;
  const monthBudgets = budgetsByMonth[month] || {};
  const categorySpend = getCategoryTotals(transactions, month, options);
  return Object.entries(monthBudgets).map(([cat, budgeted]) => {
    const convertedBudget = convertAmountToDisplay(budgeted, BASE_CURRENCY, displayCurrency, fxRates);
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
