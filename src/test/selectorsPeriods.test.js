import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterTransactionsByPeriod, getUniqueYears, shiftMonth } from '../lib/selectors';

// Synthetic rows only. "Today" is pinned so the relative filters do not depend on the real date.
const rows = [
  { id: 'today', date: '2026-11-16' },
  { id: 'three-days', date: '2026-11-13' },
  { id: 'twenty-days', date: '2026-10-27' },
  { id: 'six-months', date: '2026-05-16' },
  { id: 'two-years', date: '2024-11-16' },
];
const ids = (list) => list.map((row) => row.id);

describe('filterTransactionsByPeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps everything by default', () => {
    expect(ids(filterTransactionsByPeriod(rows))).toEqual(ids(rows));
  });

  it('keeps only rows dated today for "Today"', () => {
    expect(ids(filterTransactionsByPeriod(rows, 'Today'))).toEqual(['today']);
  });

  it('keeps the last 7, 30 and 365 days for the relative filters', () => {
    expect(ids(filterTransactionsByPeriod(rows, 'Last Week'))).toEqual(['today', 'three-days']);
    expect(ids(filterTransactionsByPeriod(rows, 'Last Month'))).toEqual([
      'today',
      'three-days',
      'twenty-days',
    ]);
    expect(ids(filterTransactionsByPeriod(rows, 'Last Year'))).toEqual([
      'today',
      'three-days',
      'twenty-days',
      'six-months',
    ]);
  });

  it('applies the year filter on its own and together with a relative filter', () => {
    expect(ids(filterTransactionsByPeriod(rows, 'ALL TIME', '2024'))).toEqual(['two-years']);
    expect(ids(filterTransactionsByPeriod(rows, 'Last Week', '2024'))).toEqual([]);
  });
});

describe('getUniqueYears', () => {
  it('ignores rows without a usable date and sorts newest first', () => {
    expect(
      getUniqueYears([{ date: '2024-03-01' }, { date: '' }, {}, { date: 'n/a' }, ...rows]),
    ).toEqual(['2026', '2024']);
  });
});

describe('shiftMonth', () => {
  it('returns the input unchanged when it is not a valid month', () => {
    expect(shiftMonth('2026-13', 1)).toBe('2026-13');
    expect(shiftMonth('2026-00', 1)).toBe('2026-00');
    expect(shiftMonth('not-a-month', -1)).toBe('not-a-month');
    expect(shiftMonth(undefined, 1)).toBe(undefined);
  });
});
