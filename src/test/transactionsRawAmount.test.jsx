import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Transactions from '../pages/Transactions';

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      displayCurrency: 'RON',
      fxRates: { EUR: 5, USD: 4 },
      transactions: [
        {
          date: '2026-11-07',
          ym: '2026-11',
          desc: 'Synthetic euro shop',
          cat: 'Other',
          sub: '',
          amt: -34.5,
          flow: 'Debit',
          type: 'CARD',
          currency: 'EUR',
          ref: '1',
        },
        {
          date: '2026-11-07',
          ym: '2026-11',
          desc: 'Synthetic tiny',
          cat: 'Other',
          sub: '',
          amt: 0.4,
          flow: 'Credit',
          type: 'CARD',
          currency: 'EUR',
          ref: '2',
        },
      ],
    },
    updateTransactionCategory: vi.fn(),
    clearTransactionCategoryOverride: vi.fn(),
    setTransactionCurrency: vi.fn(),
  }),
}));

describe('transaction amounts', () => {
  it('show each row in its own currency with cents, ignoring the display currency', () => {
    render(
      <MemoryRouter>
        <Transactions />
      </MemoryRouter>,
    );
    expect(screen.getByText('-EUR 34.50')).toBeInTheDocument(); // not converted to RON
    expect(screen.getByText('+EUR 0.40')).toBeInTheDocument(); // small amounts keep their cents
  });
});
