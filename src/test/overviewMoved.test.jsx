import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccountGroupTotals from '../components/AccountGroupTotals';
import DetectedRecurring from '../components/DetectedRecurring';
import NetWorthBreakdown from '../components/NetWorthBreakdown';

// What the dashboard no longer shows must stay reachable: balance groups and the net worth
// calculation now live on Accounts, detected recurring charges on Subscriptions.
const data = vi.hoisted(() => {
  const txn = (date) => ({
    date,
    desc: 'Synthetic Gym',
    cat: 'Sports & Fitness',
    sub: '',
    amt: -100,
    flow: 'Debit',
    type: 'CARD',
    ym: date.slice(0, 7),
    currency: 'RON',
  });
  return {
    transactions: [txn('2026-07-05'), txn('2026-08-05'), txn('2026-09-05'), txn('2026-10-05')],
    accounts: [
      {
        id: 'a1',
        name: 'Synthetic Bank',
        currency: 'RON',
        group: 'bank',
        balances: { '2026-10': 700 },
        notes: {},
      },
    ],
    creditRecords: [],
    displayCurrency: 'RON',
    fxRates: { EUR: 5, USD: 4.6 },
  };
});

vi.mock('../lib/AppContext', () => ({ useAppContext: () => ({ data }) }));

describe('information moved off the dashboard', () => {
  it('keeps the balance groups and the net worth calculation available', () => {
    render(
      <>
        <AccountGroupTotals data={data} />
        <NetWorthBreakdown data={data} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Total bank' })).toBeInTheDocument();
    expect(screen.getByText('How net worth is calculated')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Synthetic Bank' })).toBeInTheDocument();
  });

  it('keeps detected recurring charges available on Subscriptions', () => {
    render(<DetectedRecurring />);
    expect(screen.getByRole('heading', { name: 'Detected from your history' })).toBeInTheDocument();
    expect(screen.getByText('Synthetic Gym')).toBeInTheDocument();
  });
});
