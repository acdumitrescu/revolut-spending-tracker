import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Transactions from '../pages/Transactions';
import { txKey } from '../lib/csvParser';

const rows = [
  {
    date: '2026-11-01',
    ym: '2026-11',
    desc: 'Synthetic Cafe',
    cat: 'Other',
    sub: '',
    amt: -3,
    flow: 'Debit',
    type: 'CARD',
    currency: 'RON',
    ref: '1',
  },
  {
    date: '2026-11-02',
    ym: '2026-11',
    desc: 'Synthetic Cafe',
    cat: 'Other',
    sub: '',
    amt: -4,
    flow: 'Debit',
    type: 'CARD',
    currency: 'EUR',
    baseCurrency: 'RON',
    ref: '2',
  },
  {
    date: '2026-11-03',
    ym: '2026-11',
    desc: 'Synthetic Shop',
    cat: 'Other',
    sub: '',
    amt: -9,
    flow: 'Debit',
    type: 'CARD',
    currency: 'RON',
    ref: '3',
  },
];
const setTransactionsCurrency = vi.fn();

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: { displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4 }, transactions: rows },
    updateTransactionCategory: vi.fn(),
    clearTransactionCategoryOverride: vi.fn(),
    setTransactionCurrency: vi.fn(),
    setTransactionsCurrency,
  }),
}));

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Transactions />
    </MemoryRouter>,
  );

describe('bulk currency correction', () => {
  it('is hidden until a filter narrows the list', () => {
    renderAt('/app/activity/transactions');
    expect(screen.queryByRole('group', { name: 'Currency for all filtered rows' })).toBeNull();
  });

  it('relabels every filtered row after confirmation', () => {
    renderAt('/app/activity/transactions?q=cafe');
    fireEvent.change(screen.getByRole('combobox', { name: 'Currency for all filtered rows' }), {
      target: { value: 'USD' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 2' }));
    expect(
      screen.getByText(/Relabel 2 filtered rows as USD\? Amounts are not converted\./),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(setTransactionsCurrency).toHaveBeenCalledWith([txKey(rows[1]), txKey(rows[0])], 'USD');
  });

  it('restores the imported currency on the corrected rows', () => {
    setTransactionsCurrency.mockClear();
    renderAt('/app/activity/transactions?q=cafe');
    fireEvent.click(screen.getByRole('button', { name: 'Restore imported currency (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(setTransactionsCurrency).toHaveBeenCalledWith(expect.any(Array), undefined);
  });
});
