import { EXPENSE_CATS } from './utils';

export const REFUND_CATEGORY = 'Refunds';

export function getTransactionCurrencies(transactions) {
  return [...new Set(
    transactions
      .map((txn) => txn.currency)
      .filter((currency) => typeof currency === 'string' && currency.trim())
      .map((currency) => currency.toUpperCase())
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

export function getMonthlyIncome(transactions, month) {
  return transactions
    .filter((txn) => txn.ym === month && isIncomeTransaction(txn))
    .reduce((sum, txn) => sum + txn.amt, 0);
}

export function getMonthlyExpense(transactions, month) {
  const monthTransactions = transactions.filter((txn) => txn.ym === month);
  const expenses = monthTransactions
    .filter(isExpenseTransaction)
    .reduce((sum, txn) => sum + Math.abs(txn.amt), 0);
  const refunds = monthTransactions
    .filter(isRefundTransaction)
    .reduce((sum, txn) => sum + Math.abs(txn.amt), 0);
  return Math.max(0, expenses - refunds);
}

export function getMonthlySummary(transactions) {
  return getUniqueMonths(transactions).map((month) => {
    const inc = getMonthlyIncome(transactions, month);
    const exp = getMonthlyExpense(transactions, month);
    return { month, inc, exp, net: inc - exp };
  });
}

export function getDailySpend(transactions, month) {
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
    if (isExpenseTransaction(txn)) bucket.spend += Math.abs(txn.amt);
    if (isIncomeTransaction(txn)) bucket.income += txn.amt;
    if (isRefundTransaction(txn)) bucket.refunds += Math.abs(txn.amt);
  });

  return daily.map((entry) => ({
    ...entry,
    spendNet: Math.max(0, entry.spend - entry.refunds),
  }));
}

export function getCategoryTotals(transactions, month = null) {
  return transactions
    .filter((txn) => (month ? txn.ym === month : true))
    .reduce((totals, txn) => {
      if (isExpenseTransaction(txn)) {
        totals[txn.cat] = (totals[txn.cat] || 0) + Math.abs(txn.amt);
      }
      if (isRefundTransaction(txn)) {
        totals[REFUND_CATEGORY] = (totals[REFUND_CATEGORY] || 0) + Math.abs(txn.amt);
      }
      return totals;
    }, {});
}

export function getVendorTotals(transactions, month = null) {
  return transactions
    .filter((txn) => (month ? txn.ym === month : true))
    .reduce((vendors, txn) => {
      if (!isExpenseTransaction(txn)) return vendors;
      if (!vendors[txn.desc]) vendors[txn.desc] = { total: 0, count: 0, cat: txn.cat };
      vendors[txn.desc].total += Math.abs(txn.amt);
      vendors[txn.desc].count += 1;
      return vendors;
    }, {});
}

export function getAccountTotalsByMonth(accounts) {
  const monthTotals = {};
  accounts.forEach((account) => {
    Object.entries(account.balances).forEach(([month, balance]) => {
      monthTotals[month] = (monthTotals[month] || 0) + balance;
    });
  });

  return sortMonths(Object.keys(monthTotals)).map((month) => ({
    month,
    total: monthTotals[month],
  }));
}

export function getLatestAccountTotal(accounts) {
  const totals = getAccountTotalsByMonth(accounts);
  return totals.at(-1)?.total || 0;
}

export function getBudgetEntries(budgetsByMonth, month, transactions) {
  const monthBudgets = budgetsByMonth[month] || {};
  const categorySpend = getCategoryTotals(transactions, month);
  return Object.entries(monthBudgets).map(([cat, budgeted]) => {
    const spent = categorySpend[cat] || 0;
    const remaining = budgeted - spent;
    const pct = budgeted > 0 ? Math.min((spent / budgeted) * 100, 100) : 0;
    return {
      cat,
      budgeted,
      spent,
      remaining,
      pct,
      over: spent > budgeted,
    };
  });
}
