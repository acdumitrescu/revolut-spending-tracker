// Pure data layer for the dashboard (Plan 1, section 1.2). No React, no I/O, no clock: every
// selector takes `now` and/or a period from `resolveDashboardPeriod`, returns plain serialisable
// data in the display currency, and never throws on a missing FX rate. Amounts are numbers;
// formatting belongs to the UI.
//
// Shared rules
// - Dates are 'YYYY-MM-DD' keys compared as strings; day arithmetic is done in UTC so results do
//   not depend on the machine's time zone. `now` may be a 'YYYY-MM-DD' string or a Date (read as
//   the local calendar day, like `localDateKey` in subscriptions.js).
// - Spending follows the Monthly page rule (selectors.js): `isExpenseTransaction` (Debit, not the
//   Transfers/Savings categories) minus `isRefundTransaction` (Credit in Refunds), floored at 0.
// - FX: amounts whose currency has no rate (or when the display currency has none) are EXCLUDED
//   from totals and reported in `unconverted: [{ currency, amount, count }]` (amounts in the
//   original currency). They are never treated as RON.
// - Options (`opts`) on every selector: { displayCurrency, fxRates } override `data.displayCurrency`
//   and `data.fxRates`.

import {
  BASE_CURRENCY,
  convertAmountToDisplay,
  getEffectiveCurrency,
  getRateForCurrency,
} from './fx';
import {
  getAccountBalanceSnapshot,
  getBudgetEntries,
  isExpenseTransaction,
  isRefundTransaction,
  shiftMonth,
} from './selectors';
import { getOverviewPosition } from './overviewPosition';
import { getCurrencyAudit } from './currencyAudit';
import { localDateKey } from './subscriptions';
import { accountGroup } from '../../backend/accountGroups.js';
import { APP_HUBS } from '../app/navigation';

export const DASHBOARD_PERIOD_KINDS = [
  'this-month',
  'last-month',
  'last-3-months',
  'year-to-date',
  'custom',
];
export const COMING_UP_DAYS = 14;
export const STALE_BALANCE_DAYS = 35;
export const BACKUP_STALE_DAYS = 35;
export const TOP_CATEGORY_LIMIT = 5;

const DAY_MS = 86400000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function hubChildRoute(hubId, childId) {
  const hub = APP_HUBS.find((item) => item.id === hubId);
  return hub?.children?.find((child) => child.id === childId)?.to;
}

// Routes come from src/app/navigation.js. Import & backup is a utility route that navigation.js
// does not list; '/app/import' is the route SideNavigation and UtilityMenu link to.
export const DASHBOARD_ROUTES = {
  transactions: hubChildRoute('activity', 'transactions'),
  balances: hubChildRoute('accounts', 'balances'),
  mappings: hubChildRoute('insights', 'mappings'),
  subscriptions: hubChildRoute('activity', 'subscriptions'),
  importAndBackup: '/app/import',
};

// ---------------------------------------------------------------------------------------------
// Date helpers (UTC arithmetic on 'YYYY-MM-DD' keys)

const parseKey = (key) => {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};
const formatKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const isDateKey = (value) =>
  typeof value === 'string' && DATE_KEY.test(value) && formatKey(parseKey(value)) === value;
const addDays = (key, days) => formatKey(parseKey(key) + days * DAY_MS);
const daysBetween = (from, to) => Math.round((parseKey(to) - parseKey(from)) / DAY_MS);
const inclusiveDays = (start, end) => daysBetween(start, end) + 1;
const monthOf = (key) => key.slice(0, 7);
const lastDayOfMonth = (month) => addDays(`${shiftMonth(month, 1)}-01`, -1);
const minKey = (a, b) => (a <= b ? a : b);

/** Normalises a Date or 'YYYY-MM-DD' string to a date key, or null when it is not valid. */
export function toDateKey(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : localDateKey(value);
  if (typeof value === 'string') {
    const key = value.slice(0, 10);
    return isDateKey(key) ? key : null;
  }
  return null;
}

function sameDayPreviousYear(key) {
  const [year, month, day] = key.split('-');
  const candidate = `${Number(year) - 1}-${month}-${day}`;
  return isDateKey(candidate) ? candidate : `${Number(year) - 1}-${month}-28`;
}

function monthRange(month) {
  return { start: `${month}-01`, end: lastDayOfMonth(month) };
}

// ---------------------------------------------------------------------------------------------
// Period model

/**
 * One period model drives every card.
 *
 * @param {{ kind?: 'this-month'|'last-month'|'last-3-months'|'year-to-date'|'custom',
 *           now: Date|string, from?: string, to?: string }} args  `from`/`to` for 'custom'.
 * @returns {{ kind, label, start, end, previousStart, previousEnd, days, previousDays,
 *             inProgress, previousToDateEnd, fallback }}
 *  All dates are inclusive 'YYYY-MM-DD'. Month-to-date kinds end today (`inProgress: true`).
 *  - this-month: 1st of the month to today; previous = the whole previous month.
 *  - last-month: the previous whole month; previous = the month before it.
 *  - last-3-months: 1st of the month two months back to today; previous = the 3 whole months before.
 *  - year-to-date: 1 Jan to today; previous = 1 Jan to the same day last year (29 Feb -> 28 Feb).
 *  - custom: from..to (swapped if reversed); previous = the same number of days right before.
 *  `previousToDateEnd` is the last day of the previous period that lines up with `days` (use it
 *  for a like-for-like comparison against a period still in progress).
 *  `fallback: true` means a custom range was invalid and "this month" was used instead.
 * Throws TypeError only when `now` itself is not a valid date.
 */
export function resolveDashboardPeriod({ kind = 'this-month', now, from, to } = {}) {
  const today = toDateKey(now);
  if (!today) throw new TypeError('resolveDashboardPeriod needs a valid `now`.');
  const thisMonth = monthOf(today);
  let resolvedKind = DASHBOARD_PERIOD_KINDS.includes(kind) ? kind : 'this-month';
  let fallback = !DASHBOARD_PERIOD_KINDS.includes(kind);
  let start;
  let end;
  let previousStart;
  let previousEnd;
  let label;
  let inProgress = false;

  if (resolvedKind === 'custom') {
    if (isDateKey(from) && isDateKey(to)) {
      start = minKey(from, to);
      end = from <= to ? to : from;
      previousEnd = addDays(start, -1);
      previousStart = addDays(start, -inclusiveDays(start, end));
      label = `${start} to ${end}`;
      inProgress = end >= today;
    } else {
      resolvedKind = 'this-month';
      fallback = true;
    }
  }
  if (resolvedKind === 'this-month') {
    const previous = monthRange(shiftMonth(thisMonth, -1));
    start = `${thisMonth}-01`;
    end = today;
    previousStart = previous.start;
    previousEnd = previous.end;
    label = 'This month';
    inProgress = true;
  } else if (resolvedKind === 'last-month') {
    const current = monthRange(shiftMonth(thisMonth, -1));
    const previous = monthRange(shiftMonth(thisMonth, -2));
    start = current.start;
    end = current.end;
    previousStart = previous.start;
    previousEnd = previous.end;
    label = 'Last month';
  } else if (resolvedKind === 'last-3-months') {
    start = `${shiftMonth(thisMonth, -2)}-01`;
    end = today;
    previousStart = `${shiftMonth(thisMonth, -5)}-01`;
    previousEnd = addDays(start, -1);
    label = 'Last 3 months';
    inProgress = true;
  } else if (resolvedKind === 'year-to-date') {
    start = `${today.slice(0, 4)}-01-01`;
    end = today;
    previousStart = `${Number(today.slice(0, 4)) - 1}-01-01`;
    previousEnd = sameDayPreviousYear(today);
    label = 'Year to date';
    inProgress = true;
  }

  const days = inclusiveDays(start, end);
  const previousDays = inclusiveDays(previousStart, previousEnd);
  return {
    kind: resolvedKind,
    label,
    start,
    end,
    previousStart,
    previousEnd,
    days,
    previousDays,
    inProgress,
    previousToDateEnd: minKey(previousEnd, addDays(previousStart, days - 1)),
    fallback,
  };
}

// ---------------------------------------------------------------------------------------------
// Shared helpers

const rounded = (value) => Math.round(value * 100) / 100;

function resolveOptions(data, opts = {}) {
  return {
    displayCurrency: getEffectiveCurrency(opts.displayCurrency || data?.displayCurrency),
    fxRates: opts.fxRates || data?.fxRates,
    includePortfolio: Boolean(opts.includePortfolio),
  };
}

/** Returns (amount, currency) => number | null; null means "no rate, do not aggregate". */
function makeConverter({ displayCurrency, fxRates }) {
  const targetHasRate = Boolean(getRateForCurrency(displayCurrency, fxRates));
  return (amount, currency) => {
    const from = getEffectiveCurrency(currency);
    if (from === displayCurrency) return Number(amount) || 0;
    if (!targetHasRate || !getRateForCurrency(from, fxRates)) return null;
    try {
      return convertAmountToDisplay(amount, from, displayCurrency, fxRates);
    } catch {
      return null;
    }
  };
}

function createUnconverted() {
  const byCurrency = new Map();
  return {
    add(currency, amount) {
      const code = getEffectiveCurrency(currency);
      const entry = byCurrency.get(code) || { currency: code, amount: 0, count: 0 };
      entry.amount += Number(amount) || 0;
      entry.count += 1;
      byCurrency.set(code, entry);
    },
    list() {
      return [...byCurrency.values()]
        .map((entry) => ({ ...entry, amount: Math.round(entry.amount * 100) / 100 }))
        .sort((a, b) => a.currency.localeCompare(b.currency));
    },
  };
}

const transactionsOf = (data) => (Array.isArray(data?.transactions) ? data.transactions : []);
const accountsOf = (data) => (Array.isArray(data?.accounts) ? data.accounts : []);

/**
 * One pass over the transactions of a date range. `usable` holds the convertible rows so existing
 * selectors (getBudgetEntries) can run on them without ever meeting a missing rate.
 */
function analyseRange(data, start, end, convert) {
  const unconverted = createUnconverted();
  const categories = new Map();
  const dailyNet = new Map();
  const usable = [];
  let expenses = 0;
  let refunds = 0;
  for (const txn of transactionsOf(data)) {
    const date = typeof txn.date === 'string' ? txn.date.slice(0, 10) : '';
    if (!DATE_KEY.test(date) || date < start || date > end) continue;
    const expense = isExpenseTransaction(txn);
    const refund = !expense && isRefundTransaction(txn);
    if (!expense && !refund) continue;
    const converted = convert(txn.amt, txn.currency);
    if (converted === null) {
      unconverted.add(txn.currency, expense ? Math.abs(Number(txn.amt) || 0) : -Math.abs(txn.amt));
      continue;
    }
    usable.push(txn);
    const amount = Math.abs(converted);
    if (expense) {
      expenses += amount;
      categories.set(txn.cat, (categories.get(txn.cat) || 0) + amount);
    } else {
      refunds += amount;
    }
    dailyNet.set(date, (dailyNet.get(date) || 0) + (expense ? amount : -amount));
  }
  return {
    expenses,
    refunds,
    net: Math.max(0, expenses - refunds),
    categories,
    dailyNet,
    usable,
    unconverted: unconverted.list(),
  };
}

// Budgets are stored per 'YYYY-MM' in the base currency. Every month the period touches counts.
function budgetForRange(data, start, end, usable, options) {
  const budgets = data?.budgets && typeof data.budgets === 'object' ? data.budgets : {};
  const months = [];
  for (let month = monthOf(start); month <= monthOf(end); month = shiftMonth(month, 1)) {
    if (budgets[month] && Object.keys(budgets[month]).length > 0) months.push(month);
  }
  const unconverted = [];
  if (months.length === 0) return { months, rows: [], unconverted };
  if (!getRateForCurrency(options.displayCurrency, options.fxRates)) {
    const amount = months.reduce(
      (sum, month) =>
        sum +
        Object.values(budgets[month]).reduce((total, value) => total + (Number(value) || 0), 0),
      0,
    );
    unconverted.push({ currency: BASE_CURRENCY, amount, count: months.length });
    return { months: [], rows: [], unconverted };
  }
  const rows = months.flatMap((month) =>
    getBudgetEntries(budgets, month, usable, options).map((entry) => ({ ...entry, month })),
  );
  return { months, rows, unconverted };
}

// ---------------------------------------------------------------------------------------------
// Net worth

/**
 * @returns {{ hasData: boolean, asOfMonth: string, previousMonth: string,
 *   current: number, previous: number|null, delta: number|null, deltaPct: number|null,
 *   composition: { accounts: number, vendorDebt: number, portfolio: number,
 *                  groups: Array<{ group, total, accounts }> },
 *   accountCounts: { updated, carried, missing }, missingCreditBalances: number,
 *   unconverted: Array<{ currency, amount, count, source: 'account'|'vendorDebt'|'portfolio' }> }}
 * `current` = account balances carried forward to the period's end month, minus vendor debt
 * (getOverviewPosition rules; portfolio only with opts.includePortfolio). `previous` is the same
 * at the end of the previous period (balances are monthly, so the month of `previousEnd`); null
 * when no account has a balance by then. Vendor debt has no history, so it is subtracted in both.
 * Accounts or debts in a currency without a rate are left out and listed in `unconverted`.
 */
export function selectNetWorth(data, period, opts = {}) {
  const options = resolveOptions(data, opts);
  const convert = makeConverter(options);
  const unconverted = [];
  const accounts = accountsOf(data).filter((account) => {
    if (Object.keys(account.balances || {}).length === 0) return true;
    const currency = account.currency || BASE_CURRENCY;
    if (convert(1, currency) !== null) return true;
    const month = Object.keys(account.balances).sort().at(-1);
    unconverted.push({
      currency: getEffectiveCurrency(currency),
      amount: Number(account.balances[month]) || 0,
      count: 1,
      source: 'account',
    });
    return false;
  });
  const creditRecords = (data?.creditRecords || []).filter((row) => {
    if (row.kind !== 'vendor' || convert(1, row.currency) !== null) return true;
    unconverted.push({
      currency: getEffectiveCurrency(row.currency),
      amount: -(Number(row.remainingBalance) || 0),
      count: 1,
      source: 'vendorDebt',
    });
    return false;
  });
  const holdings = (data?.portfolioHoldings || []).filter((holding) => {
    if (convert(1, holding.currency) !== null) return true;
    unconverted.push({
      currency: getEffectiveCurrency(holding.currency),
      amount: (holding.quantity || 0) * (holding.currentPrice || 0),
      count: 1,
      source: 'portfolio',
    });
    return false;
  });
  const safe = {
    ...data,
    accounts,
    creditRecords,
    portfolioHoldings: holdings,
    displayCurrency: options.displayCurrency,
    fxRates: options.fxRates,
  };

  let position = { vendorDebt: 0, portfolio: 0, missingCreditBalances: 0 };
  try {
    position = getOverviewPosition(safe, options.includePortfolio);
  } catch {
    // Unreachable in practice (inputs were pre-filtered); keep the dashboard rendering anyway.
  }
  const asOfMonth = monthOf(period.end);
  const previousMonth = monthOf(period.previousEnd);
  const snapshotOptions = { displayCurrency: options.displayCurrency, fxRates: options.fxRates };
  const now = getAccountBalanceSnapshot(accounts, { ...snapshotOptions, month: asOfMonth });
  const before = getAccountBalanceSnapshot(accounts, { ...snapshotOptions, month: previousMonth });
  const vendorDebt = position.vendorDebt || 0;
  const portfolio = options.includePortfolio ? position.portfolio || 0 : 0;
  const current = now.total + portfolio - vendorDebt;
  const hasPrevious = accounts.length > 0 && before.missing < accounts.length;
  const previous = hasPrevious ? before.total + portfolio - vendorDebt : null;
  const delta = previous === null ? null : current - previous;

  const groups = new Map();
  for (const account of accounts) {
    const value = getAccountBalanceSnapshot([account], {
      ...snapshotOptions,
      month: asOfMonth,
    });
    const key = accountGroup(account);
    const entry = groups.get(key) || { group: key, total: 0, accounts: 0 };
    entry.total += value.total;
    entry.accounts += 1;
    groups.set(key, entry);
  }

  return {
    hasData: accounts.length > 0 || vendorDebt !== 0 || portfolio !== 0,
    asOfMonth,
    previousMonth,
    current,
    previous,
    delta,
    deltaPct: previous === null || previous === 0 ? null : delta / Math.abs(previous),
    composition: {
      accounts: now.total,
      vendorDebt: -vendorDebt,
      portfolio,
      groups: [...groups.values()].sort((a, b) => a.group.localeCompare(b.group)),
    },
    accountCounts: { updated: now.updated, carried: now.carried, missing: now.missing },
    missingCreditBalances: position.missingCreditBalances || 0,
    unconverted: unconverted.map((entry) => ({ ...entry, amount: rounded(entry.amount) })),
  };
}

// ---------------------------------------------------------------------------------------------
// Spend, budget, cumulative series, categories

function analysePeriod(data, period, opts) {
  const options = resolveOptions(data, opts);
  const convert = makeConverter(options);
  return {
    options,
    current: analyseRange(data, period.start, period.end, convert),
    previous: analyseRange(data, period.previousStart, period.previousEnd, convert),
    previousToDate: analyseRange(data, period.previousStart, period.previousToDateEnd, convert),
    convert,
  };
}

/**
 * @returns {{ current: number, previous: number, previousToDate: number, change: number,
 *   changePct: number|null, budget: null | { total: number, months: string[], ratio: number|null,
 *   remaining: number, over: boolean }, unconverted: Array<{ currency, amount, count }> }}
 * `previous` is the whole previous period; `previousToDate` stops at `period.previousToDateEnd`
 * (the same number of days) and is the fair comparison while the period is in progress.
 * `unconverted` covers the current period's spending, `previousUnconverted` the previous period's,
 * `budgetUnconverted` budgets that could not be converted (only when the display currency has no rate).
 * `change`/`changePct` compare `current` with `previousToDate`. `budget` is null when no month the
 * period touches has a budget; `total` sums those months' budgets, `ratio` is current/total (can be
 * above 1) for the bar, `remaining` may be negative.
 */
export function selectSpent(data, period, opts = {}) {
  const { options, current, previous, previousToDate } = analysePeriod(data, period, opts);
  const budget = budgetForRange(data, period.start, period.end, current.usable, options);
  const total = budget.rows.reduce((sum, row) => sum + row.budgeted, 0);
  return {
    current: current.net,
    previous: previous.net,
    previousToDate: previousToDate.net,
    change: current.net - previousToDate.net,
    changePct:
      previousToDate.net > 0 ? (current.net - previousToDate.net) / previousToDate.net : null,
    budget:
      budget.rows.length > 0
        ? {
            total,
            months: budget.months,
            ratio: total > 0 ? current.net / total : null,
            remaining: total - current.net,
            over: current.net > total,
          }
        : null,
    unconverted: current.unconverted,
    budgetUnconverted: budget.unconverted,
    previousUnconverted: previous.unconverted,
  };
}

/**
 * Remaining across budgets, using the Budget page definition (getBudgetSummary): assigned minus
 * spend in the budgeted categories only.
 * @returns {{ hasBudget: boolean, budgeted: number, spent: number, remaining: number|null,
 *   over: boolean, unbudgetedSpend: number, months: string[],
 *   categories: Array<{ cat, budgeted, spent, remaining, over }>, unconverted: Array,
 *   budgetUnconverted: Array }}
 * Empty state: `hasBudget: false`, `remaining: null`, `categories: []`.
 */
export function selectLeftInBudget(data, period, opts = {}) {
  const { options, current } = analysePeriod(data, period, opts);
  const budget = budgetForRange(data, period.start, period.end, current.usable, options);
  if (budget.rows.length === 0) {
    return {
      hasBudget: false,
      budgeted: 0,
      spent: 0,
      remaining: null,
      over: false,
      unbudgetedSpend: 0,
      months: [],
      categories: [],
      unconverted: current.unconverted,
      budgetUnconverted: budget.unconverted,
    };
  }
  const byCategory = new Map();
  for (const row of budget.rows) {
    const entry = byCategory.get(row.cat) || { cat: row.cat, budgeted: 0, spent: 0 };
    entry.budgeted += row.budgeted;
    entry.spent += row.spent;
    byCategory.set(row.cat, entry);
  }
  const categories = [...byCategory.values()]
    .map((entry) => ({
      ...entry,
      remaining: entry.budgeted - entry.spent,
      over: entry.spent > entry.budgeted,
    }))
    .sort((a, b) => a.remaining - b.remaining || a.cat.localeCompare(b.cat));
  const budgeted = categories.reduce((sum, entry) => sum + entry.budgeted, 0);
  const spent = categories.reduce((sum, entry) => sum + entry.spent, 0);
  return {
    hasBudget: true,
    budgeted,
    spent,
    remaining: budgeted - spent,
    over: spent > budgeted,
    unbudgetedSpend: Math.max(0, current.net - spent),
    months: budget.months,
    categories,
    unconverted: current.unconverted,
    budgetUnconverted: budget.unconverted,
  };
}

/**
 * Two day-indexed series for a line chart, aligned by day number (day 1 = first day of each
 * period). Values are running spend (expenses minus refunds, never below 0).
 * @returns {{ points: Array<{ day: number, date: string|null, previousDate: string|null,
 *   current: number|null, previous: number|null }>, currentTotal: number, previousTotal: number,
 *   unconverted: Array, previousUnconverted: Array }}
 * `points` has max(days, previousDays) entries. `current` is null after the period's last day
 * (e.g. after today for a month in progress) and `previous` is null after the previous period's
 * last day (e.g. day 31 when the previous month had 30 days), so a chart can stop the line.
 */
export function selectCumulativeSpend(data, period, opts = {}) {
  const { current, previous } = analysePeriod(data, period, opts);
  const running = (analysis, start, days) => {
    const values = [];
    let sum = 0;
    for (let day = 0; day < days; day += 1) {
      sum += analysis.dailyNet.get(addDays(start, day)) || 0;
      values.push(Math.max(0, sum));
    }
    return values;
  };
  const currentSeries = running(current, period.start, period.days);
  const previousSeries = running(previous, period.previousStart, period.previousDays);
  const length = Math.max(period.days, period.previousDays);
  const points = Array.from({ length }, (_, index) => ({
    day: index + 1,
    date: index < period.days ? addDays(period.start, index) : null,
    previousDate: index < period.previousDays ? addDays(period.previousStart, index) : null,
    current: index < period.days ? currentSeries[index] : null,
    previous: index < period.previousDays ? previousSeries[index] : null,
  }));
  return {
    points,
    currentTotal: current.net,
    previousTotal: previous.net,
    unconverted: current.unconverted,
    previousUnconverted: previous.unconverted,
  };
}

/**
 * Top spending categories (expenses by category, gross of refunds, transfers excluded).
 * @returns {{ total: number, categories: Array<{ category, amount, share }>,
 *   other: { amount, share, count }|null, unconverted: Array }}
 * `share` is a fraction of `total` (0..1); `other` groups everything beyond the top 5 (null when
 * there are 5 or fewer). `total` can differ slightly from `selectSpent().current` because refunds
 * are not netted per category.
 */
export function selectTopCategories(data, period, opts = {}) {
  const { current } = analysePeriod(data, period, opts);
  const ranked = [...current.categories.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
  const total = ranked.reduce((sum, entry) => sum + entry.amount, 0);
  const share = (amount) => (total > 0 ? amount / total : 0);
  const top = ranked.slice(0, TOP_CATEGORY_LIMIT);
  const rest = ranked.slice(TOP_CATEGORY_LIMIT);
  const otherAmount = rest.reduce((sum, entry) => sum + entry.amount, 0);
  return {
    total,
    categories: top.map((entry) => ({ ...entry, share: share(entry.amount) })),
    other:
      rest.length > 0
        ? { amount: otherAmount, share: share(otherAmount), count: rest.length }
        : null,
    unconverted: current.unconverted,
  };
}

// ---------------------------------------------------------------------------------------------
// Coming up

/**
 * Active subscription plans whose next renewal falls within `days` (default 14) of today,
 * inclusive of both ends. The Subscriptions page is a manual tracker, so this uses each plan's
 * `nextRenewal` (one next charge per plan, as `subscriptionSummary` does); it does not project
 * later cycles. Plans with a past date are not "coming up"; they are counted in `needsReview`
 * (the page's "Review renewal date" status).
 * @returns {{ days: number, from: string, to: string, total: number, needsReview: number,
 *   items: Array<{ id, name, date, daysUntil, amount, currency, amountDisplay, cycle }>,
 *   unconverted: Array<{ currency, amount, count }>, href: string }}
 * `amount` is in the plan's currency; `amountDisplay` is converted (null when there is no rate,
 * in which case it is also left out of `total`). Sorted by date, then name. Empty `items` when none.
 */
export function selectComingUp(data, now, opts = {}) {
  const options = resolveOptions(data, opts);
  const convert = makeConverter(options);
  const today = toDateKey(now);
  const days = opts.days || COMING_UP_DAYS;
  const empty = {
    days,
    from: today,
    to: today ? addDays(today, days) : null,
    total: 0,
    needsReview: 0,
    items: [],
    unconverted: [],
    href: DASHBOARD_ROUTES.subscriptions,
  };
  if (!today) return empty;
  const to = addDays(today, days);
  const unconverted = createUnconverted();
  let needsReview = 0;
  let total = 0;
  const items = [];
  for (const record of Array.isArray(data?.subscriptions) ? data.subscriptions : []) {
    if (record.status !== 'active' || !isDateKey(record.nextRenewal)) continue;
    if (record.nextRenewal < today) {
      needsReview += 1;
      continue;
    }
    if (record.nextRenewal > to) continue;
    const amountDisplay = convert(record.amount, record.currency);
    if (amountDisplay === null) unconverted.add(record.currency, record.amount);
    else total += amountDisplay;
    items.push({
      id: record.id,
      name: record.name,
      date: record.nextRenewal,
      daysUntil: daysBetween(today, record.nextRenewal),
      amount: record.amount,
      currency: getEffectiveCurrency(record.currency),
      amountDisplay,
      cycle: record.cycle,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return { ...empty, total, needsReview, items, unconverted: unconverted.list() };
}

// ---------------------------------------------------------------------------------------------
// Needs attention

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

// Same rule as getOtherVendorGroups (vendorReview.js): an automatic "Other" debit nobody sorted.
function isUncategorised(txn) {
  return (
    txn.flow === 'Debit' && txn.cat === 'Other' && txn.categorySource !== 'manual' && !txn.manualCat
  );
}

/**
 * @returns {Array<{ id, count, severity: 'high'|'medium'|'low', href, ... }>} sorted by severity,
 * empty when nothing needs attention. Items:
 *  - 'suspect-currency' (high): count of import batches the currency audit marks 'suspect'
 *    (getCurrencyAudit), href = import page.
 *  - 'stale-balances' (medium): count of accounts whose freshest date is more than 35 days old
 *    (exactly 35 is fine); also `accounts: [{ id, name, lastDate, ageDays }]`. Freshest date =
 *    the later of `reconciledOn` ("matches the bank as of") and the last day of the latest
 *    balance month. Accounts with no balance at all are not listed. href = balances page.
 *  - 'uncategorised' (low): count of automatic "Other" debits, all time; href = mappings.
 *  - 'backup-age' (medium): only when `opts.lastBackupAt` (epoch ms) is passed and older than
 *    35 days; `value` = age in days. The workspace state stores no backup time, so the caller must
 *    supply it; without it this item is omitted.
 */
export function selectNeedsAttention(data, now, opts = {}) {
  const today = toDateKey(now);
  if (!today) return [];
  const items = [];

  const batches = getCurrencyAudit(data || {}).suspectBatchCount;
  if (batches > 0)
    items.push({
      id: 'suspect-currency',
      count: batches,
      severity: 'high',
      href: DASHBOARD_ROUTES.importAndBackup,
    });

  const stale = [];
  for (const account of accountsOf(data)) {
    const months = Object.keys(account.balances || {})
      .filter((month) => /^\d{4}-\d{2}$/.test(month))
      .sort();
    const dates = [];
    if (months.length > 0) dates.push(lastDayOfMonth(months.at(-1)));
    if (isDateKey(account.reconciledOn)) dates.push(account.reconciledOn);
    if (dates.length === 0) continue;
    const lastDate = dates.sort().at(-1);
    const ageDays = daysBetween(lastDate, today);
    if (ageDays > STALE_BALANCE_DAYS)
      stale.push({ id: account.id, name: account.name, lastDate, ageDays });
  }
  if (stale.length > 0)
    items.push({
      id: 'stale-balances',
      count: stale.length,
      severity: 'medium',
      href: DASHBOARD_ROUTES.balances,
      accounts: stale.sort((a, b) => b.ageDays - a.ageDays || a.name.localeCompare(b.name)),
    });

  if (Number.isFinite(opts.lastBackupAt)) {
    const ageDays = daysBetween(formatKey(opts.lastBackupAt), today);
    if (ageDays > BACKUP_STALE_DAYS)
      items.push({
        id: 'backup-age',
        value: ageDays,
        count: 1,
        severity: 'medium',
        href: DASHBOARD_ROUTES.importAndBackup,
      });
  }

  const uncategorised = transactionsOf(data).filter(isUncategorised).length;
  if (uncategorised > 0)
    items.push({
      id: 'uncategorised',
      count: uncategorised,
      severity: 'low',
      href: DASHBOARD_ROUTES.mappings,
    });

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
