import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Monthly from '../pages/Monthly';
import { AppProvider, useAppContext } from '../lib/AppContext';

function Loader() {
  const { addTransactions } = useAppContext();

  const transactions = [
    { date: '2024-01-01', ym: '2024-01', desc: 'Salary', cat: 'Income', sub: 'Income', amt: 5000, flow: 'Credit', type: 'Bank Transfer' },
    { date: '2024-03-01', ym: '2024-03', desc: 'Groceries', cat: 'Groceries', sub: 'Food', amt: -100, flow: 'Debit', type: 'Card Payment' },
  ];

  return (
    <button type="button" onClick={() => addTransactions(transactions)}>
      Load
    </button>
  );
}

describe('Monthly page', () => {
  it('defaults to the latest month after data is added later', () => {
    render(
      <AppProvider>
        <MemoryRouter>
          <Loader />
          <Monthly />
        </MemoryRouter>
      </AppProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Load'));
    });

    expect(screen.getByText('Monthly Trend')).toBeInTheDocument();
  });
});
