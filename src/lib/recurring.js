import { isExpenseTransaction } from './selectors';

function normalizeVendor(description) {
  return String(description || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dayDiff(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function detectRecurringTransactions(transactions) {
  const groups = {};
  transactions
    .filter(isExpenseTransaction)
    .forEach((txn) => {
      const vendor = normalizeVendor(txn.desc);
      const roundedAmount = Math.round(Math.abs(txn.amt));
      const currency = txn.currency || 'N/A';
      const key = `${vendor}|${roundedAmount}|${currency}`;
      if (!groups[key]) {
        groups[key] = {
          vendor,
          label: txn.desc,
          amount: roundedAmount,
          cat: txn.cat,
          currency,
          dates: [],
        };
      }
      groups[key].dates.push(txn.date);
    });

  return Object.values(groups)
    .map((group) => {
      const dates = group.dates.sort();
      if (dates.length < 3) return null;
      const intervals = dates.slice(1).map((date, index) => dayDiff(dates[index], date));
      const avgInterval = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      const regularity = intervals.every((value) => Math.abs(value - avgInterval) <= 4);
      if (!regularity || avgInterval < 6 || avgInterval > 40) return null;

      return {
        ...group,
        occurrences: dates.length,
        avgInterval: Math.round(avgInterval),
        lastDate: dates.at(-1),
        nextExpectedDate: addDays(dates.at(-1), Math.round(avgInterval)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate));
}
