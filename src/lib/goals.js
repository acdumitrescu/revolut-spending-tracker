import { accountGroup } from '../../backend/accountGroups.js';
import { BASE_CURRENCY, convertAmountToDisplay } from './fx';
import { getAccountBalanceSnapshot } from './selectors';

// Pure goal maths. Callers pass `now` so nothing here reads the clock.

const HISTORY_MONTHS = 6;
const MAX_HORIZON = 36;

export const goalCurrency = (goal) => goal.currency || BASE_CURRENCY;

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthIndex(key) {
  const [year, month] = key.split('-').map(Number);
  return year * 12 + (month - 1);
}

export function addMonths(key, count) {
  const index = monthIndex(key) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export const monthsBetween = (from, to) => monthIndex(to) - monthIndex(from);

// Credit accounts hold debt, so they can never fund a goal. An account funds only the first goal that links it,
// which keeps the same money from being counted twice even if a restored backup links it twice.
export function assignGoalAccounts(goals, accounts) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const taken = new Set();
  const assigned = new Map();
  for (const goal of goals) {
    const linked = [];
    for (const id of goal.linkedAccountIds || []) {
      const account = byId.get(id);
      if (!account || taken.has(id) || accountGroup(account) === 'credit') continue;
      taken.add(id);
      linked.push(account);
    }
    assigned.set(goal.id, linked);
  }
  return assigned;
}

function savedAtMonth(goal, linkedAccounts, month, fxRates) {
  const currency = goalCurrency(goal);
  const snapshot = getAccountBalanceSnapshot(linkedAccounts, { month, displayCurrency: currency, fxRates });
  const contributed = (goal.contributions || [])
    .filter((entry) => entry.date.slice(0, 7) <= month)
    .reduce((sum, entry) => sum + entry.amount, 0);
  return { linked: snapshot.total, contributed, total: snapshot.total + contributed, missing: snapshot.missing };
}

// Months where we really know something: an explicit balance entry on a linked account or a contribution.
function dataMonths(goal, linkedAccounts) {
  const months = new Set((goal.contributions || []).map((entry) => entry.date.slice(0, 7)));
  for (const account of linkedAccounts) Object.keys(account.balances || {}).forEach((month) => months.add(month));
  return [...months].sort();
}

export function computeGoal(goal, linkedAccounts, { fxRates, now }) {
  const currency = goalCurrency(goal);
  const current = monthKey(now);
  const target = goal.targetAmount;
  const nowSaved = savedAtMonth(goal, linkedAccounts, current, fxRates);
  const saved = nowSaved.total;
  const remaining = Math.max(target - saved, 0);
  const complete = saved >= target;
  const progress = Math.min(Math.max(saved / target, 0), 1);

  const monthsLeft = goal.targetMonth ? monthsBetween(current, goal.targetMonth) : null;
  const overdue = !complete && monthsLeft !== null && monthsLeft < 0;
  const requiredMonthly = complete || monthsLeft === null || overdue ? null : remaining / Math.max(monthsLeft, 1);

  // Pace: net change per month across the real data points of the last six months. Needs two distinct months.
  const windowStart = addMonths(current, -(HISTORY_MONTHS - 1));
  const known = dataMonths(goal, linkedAccounts).filter((month) => month <= current);
  const inWindow = known.filter((month) => month >= windowStart);
  const points = inWindow.length >= 2 ? inWindow : known.slice(-2);
  let pace = null;
  if (points.length >= 2) {
    const first = points[0];
    const last = points.at(-1);
    const span = monthsBetween(first, last);
    if (span > 0) pace = (savedAtMonth(goal, linkedAccounts, last, fxRates).total - savedAtMonth(goal, linkedAccounts, first, fxRates).total) / span;
  }

  const monthsToFinish = !complete && pace && pace > 0 ? Math.ceil(remaining / pace) : null;
  const projectedMonth = monthsToFinish === null ? null : addMonths(current, monthsToFinish);

  let status;
  if (complete) status = 'complete';
  else if (overdue) status = 'overdue';
  else if (pace === null) status = 'no-history';
  else if (requiredMonthly === null) status = pace > 0 ? 'progressing' : 'stalled';
  else status = pace >= requiredMonthly ? 'on-track' : 'behind';

  return {
    id: goal.id,
    currency,
    target,
    saved,
    linkedSaved: nowSaved.linked,
    contributed: nowSaved.contributed,
    missingBalances: nowSaved.missing,
    remaining,
    progress,
    complete,
    monthsLeft,
    overdue,
    requiredMonthly,
    pace,
    projectedMonth,
    monthsToFinish,
    status,
    current,
  };
}

export function computeGoals(goals, accounts, { fxRates, now }) {
  const assigned = assignGoalAccounts(goals, accounts);
  return goals.map((goal) => ({ goal, linkedAccounts: assigned.get(goal.id) || [], ...computeGoal(goal, assigned.get(goal.id) || [], { fxRates, now }) }));
}

// Series for the projection chart: what you saved, where today's pace lands, and the path the target date needs.
export function getGoalChart(goal, linkedAccounts, result, { fxRates }) {
  const { current, monthsLeft, pace, requiredMonthly, saved, target } = result;
  const past = Array.from({ length: HISTORY_MONTHS }, (_, index) => addMonths(current, index - (HISTORY_MONTHS - 1)));
  const ahead = Math.min(MAX_HORIZON, Math.max(monthsLeft || 0, result.monthsToFinish || 0, 6));
  const future = Array.from({ length: ahead }, (_, index) => addMonths(current, index + 1));
  const months = [...past, ...future];
  const firstKnown = dataMonths(goal, linkedAccounts)[0];
  const actual = months.map((month) => (month <= current && firstKnown && month >= firstKnown
    ? Math.max(savedAtMonth(goal, linkedAccounts, month, fxRates).total, 0)
    : null));
  const projected = months.map((month, index) => {
    if (month < current || pace === null || pace <= 0) return null;
    return Math.min(saved + pace * (index - (HISTORY_MONTHS - 1)), target);
  });
  const needed = months.map((month, index) => {
    if (requiredMonthly === null || month < current || monthsLeft === null) return null;
    const step = index - (HISTORY_MONTHS - 1);
    return step > monthsLeft ? null : Math.min(saved + requiredMonthly * step, target);
  });
  return { months, actual, projected, needed, targetLine: months.map(() => target) };
}

export const STATUS_LABELS = {
  complete: 'Goal reached',
  overdue: 'Past target date',
  'on-track': 'On track',
  behind: 'Behind pace',
  progressing: 'Making progress',
  stalled: 'No progress yet',
  'no-history': 'Not enough history',
};

export function totalSavedInCurrency(results, displayCurrency, fxRates) {
  return results.reduce((sum, item) => sum + convertAmountToDisplay(item.saved, item.currency, displayCurrency, fxRates), 0);
}
