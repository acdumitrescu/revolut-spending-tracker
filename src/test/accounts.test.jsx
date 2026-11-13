import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Accounts from '../pages/Accounts';

vi.mock('../components/ChartWrapper', () => ({
  default: ({ type, data }) => (
    <div
      data-testid={`chart-${type}`}
      data-values={JSON.stringify(data?.datasets?.[0]?.data || [])}
    />
  ),
}));

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      transactions: [
        {
          date: '2026-06-01',
          desc: 'Synthetic Salary',
          cat: 'Income',
          sub: '',
          amt: 1000,
          flow: 'Credit',
          type: 'TRANSFER',
          ym: '2026-06',
          currency: 'RON',
        },
        {
          date: '2026-06-03',
          desc: 'Synthetic Market',
          cat: 'Groceries',
          sub: '',
          amt: -400,
          flow: 'Debit',
          type: 'CARD',
          ym: '2026-06',
          currency: 'RON',
        },
      ],
      accounts: [
        {
          id: 'ron',
          name: 'RON Bank',
          currency: 'RON',
          balances: { '2026-04': 400, '2026-09': 500 },
          notes: {},
        },
        {
          id: 'usd',
          name: 'USD Broker',
          currency: 'USD',
          balances: { '2026-09': 120 },
          notes: { '2026-09': 'Estimate' },
        },
      ],
      displayCurrency: 'RON',
      fxRates: { EUR: 5, USD: 4 },
    },
    addAccount: vi.fn(),
    updateAccountCurrency: vi.fn(),
    updateAccountBalance: vi.fn(),
    updateAccountNote: vi.fn(),
    removeAccount: vi.fn(),
    currencySummary: { hasMixedCurrencies: true, currencies: ['RON', 'USD'] },
  }),
}));

describe('Accounts tracking', () => {
  it('shows currency totals, an expense-only chart, notes, and months through year end', () => {
    render(<Accounts />);

    expect(screen.getByText('Accounts by Currency')).toBeInTheDocument();
    expect(screen.getByText('2 accounts')).toBeInTheDocument();
    expect(screen.queryByText(/monthly contribution/i)).not.toBeInTheDocument();
    expect(screen.getByText('Imported Expenses Trend')).toBeInTheDocument();
    expect(screen.getByTestId('chart-bar')).toHaveAttribute('data-values', JSON.stringify([400]));
    expect(screen.getAllByText('Latest balance')).toHaveLength(2);
    expect(screen.getByText(/480\s*RON equivalent/)).toBeInTheDocument();
    expect(screen.getByText('Change since 2026-04')).toBeInTheDocument();
    expect(screen.getByText('Balance change')).toBeInTheDocument();
    expect(screen.getAllByText('Last recorded')).toHaveLength(2);
    expect(screen.getByText(/\+100\s*RON/)).toBeInTheDocument();
    expect(screen.getByText('+25.0%')).toBeInTheDocument();
    expect(screen.getByLabelText('USD Broker note for 2026-09')).toHaveValue('Estimate');
    expect(screen.getByLabelText('RON Bank note for 2026-12')).toBeInTheDocument();
    expect(screen.getAllByText('2026-04')).toHaveLength(2);
    expect(screen.getAllByText('2026-12')).toHaveLength(2);
  });
});
