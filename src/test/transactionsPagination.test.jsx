import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Transactions from '../pages/Transactions';

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      displayCurrency: 'RON',
      fxRates: { EUR: 5, USD: 4 },
      transactions: Array.from({ length: 105 }, (_, index) => ({
        date: '2026-09-01',
        ym: '2026-09',
        desc: `Synthetic transaction ${index}`,
        cat: index === 104 ? 'Groceries' : 'Other',
        sub: '',
        amt: -10,
        flow: 'Debit',
        type: 'CARD',
        currency: 'RON',
        ref: String(index),
      })),
    },
    updateTransactionCategory: vi.fn(),
    clearTransactionCategoryOverride: vi.fn(),
  }),
}));

describe('transaction pagination', () => {
  it('makes records beyond 100 reachable and resets the page after filtering', () => {
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    expect(screen.getByText('1–100 of 105 matching · 105 total')).toBeInTheDocument();
    expect(screen.queryByText('Synthetic transaction 104')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Synthetic transaction 104')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by category'), {
      target: { value: 'Groceries' },
    });
    expect(screen.getByText('1–1 of 1 matching · 105 total')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('honours URL filters and safely clamps an out-of-range page', () => {
    render(
      <MemoryRouter initialEntries={['/app/transactions?category=Groceries&page=999']}>
        <Transactions />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Filter by category')).toHaveValue('Groceries');
    expect(screen.getByText('Synthetic transaction 104')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });
});
