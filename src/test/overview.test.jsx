import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Overview from '../pages/Overview';

vi.mock('../components/ChartWrapper', () => ({
  default: ({ type, data }) => (
    <div data-testid={`chart-${type}`} data-labels={JSON.stringify(data?.labels || [])} />
  ),
}));

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      transactions: [
        {
          date: '2026-06-01', desc: 'Synthetic Salary', cat: 'Income', sub: '', amt: 1000,
          flow: 'Credit', type: 'TRANSFER', ym: '2026-06', currency: 'RON', source: 'revolut',
        },
        {
          date: '2026-06-03', desc: 'Synthetic Market', cat: 'Groceries', sub: 'Supermarket', amt: -400,
          flow: 'Debit', type: 'CARD', ym: '2026-06', currency: 'RON', source: 'revolut', matchedVendor: 'Synthetic Market',
        },
        {
          date: '2025-05-03', desc: 'Synthetic Legacy Market', cat: 'Groceries', sub: 'Supermarket', amt: -200,
          flow: 'Debit', type: 'CARD', ym: '2025-05', currency: 'RON', source: 'revolut', matchedVendor: 'Synthetic Legacy Market',
        },
      ],
      accounts: [{ id: 'account-1', name: 'Savings', currency: 'RON', source: 'revolut', balances: { '2026-06': 300 }, notes: {} }],
      goals: [{ id: 'goal-1', name: 'Emergency fund', targetAmount: 2000, targetMonth: '2026-12' }],
      displayCurrency: 'RON',
      fxRates: { EUR: 5, USD: 4.6 },
      importMeta: { latestSummary: { importedAt: Date.now() } },
      lastUpdated: Date.now(),
    },
  }),
}));

describe('Overview command center', () => {
  it('renders the new dashboard hierarchy using truthful tracked-data language', () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Revolut spending' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spending by category' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Upcoming goals' })).toBeInTheDocument();
    expect(screen.getByText('Accounts tracked')).toBeInTheDocument();
    expect(screen.getByText('Total account balance')).toBeInTheDocument();
    expect(screen.getAllByText('Tracked net worth').length).toBeGreaterThan(0);
    expect(screen.queryByText('Savings rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Income')).not.toBeInTheDocument();
    expect(screen.queryByText(/accounts connected/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('chart-line')).toBeInTheDocument();
    expect(screen.getByTestId('chart-doughnut')).toBeInTheDocument();
  });

  it('filters spending while retaining the latest balance and net worth', () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);

    const period = screen.getByRole('combobox', { name: 'Period' });
    const year = screen.getByRole('combobox', { name: 'Year' });

    fireEvent.change(year, { target: { value: '2025' } });
    expect(period).toHaveValue('ALL TIME');
    expect(year).toHaveValue('2025');
    expect(screen.getByText('Selected period: 2025')).toBeInTheDocument();
    expect(screen.getByTestId('chart-line')).toHaveAttribute('data-labels', JSON.stringify(["May '25"]));
    expect(screen.getByText('Synthetic Legacy Market')).toBeInTheDocument();
    expect(screen.queryByText('Synthetic Market')).not.toBeInTheDocument();
    expect(screen.getByText('Balances as of 2026-06')).toBeInTheDocument();

    fireEvent.change(period, { target: { value: 'Last Month' } });
    expect(period).toHaveValue('Last Month');
    expect(year).toHaveValue('ALL');
  });
});
