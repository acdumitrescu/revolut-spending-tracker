import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccountBalanceCard from '../components/AccountBalanceCard';

const account = {
  id: 'a',
  name: 'Synthetic Savings',
  currency: 'EUR',
  balances: { '2026-08': 100, '2026-09': 120 },
  notes: { '2026-09': 'Interest paid' },
};
function props(overrides = {}) {
  return {
    account,
    months: ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12'],
    displayCurrency: 'RON',
    fxRates: { EUR: 5, USD: 4 },
    currentMonth: '2026-10',
    asOfMonth: '2026-10',
    onBalance: vi.fn(),
    onNote: vi.fn(),
    onCurrency: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe('compact account editors', () => {
  it('starts collapsed and lets multiple account editors stay open independently', () => {
    const { container } = render(
      <>
        <AccountBalanceCard {...props()} />
        <AccountBalanceCard
          {...props({ account: { ...account, id: 'b', name: 'Synthetic Cash' } })}
        />
      </>,
    );
    const cards = container.querySelectorAll('.account-disclosure');
    expect([...cards].every((card) => !card.open)).toBe(true);
    fireEvent.click(screen.getByLabelText('Edit balances for Synthetic Savings'));
    fireEvent.click(screen.getByLabelText('Edit balances for Synthetic Cash'));
    expect([...cards].every((card) => card.open)).toBe(true);
    fireEvent.click(screen.getByLabelText('Edit balances for Synthetic Savings'));
    expect(cards[0].open).toBe(false);
    expect(cards[1].open).toBe(true);
  });

  it('shows native balance, conversion, comparison period and carried-forward freshness', () => {
    render(<AccountBalanceCard {...props()} />);
    expect(screen.getByText(/600\s*RON equivalent/)).toBeInTheDocument();
    expect(screen.getByText('Change since 2026-08')).toBeInTheDocument();
    expect(screen.getByText('Carried forward')).toBeInTheDocument();
    expect(screen.getByText('Interest paid', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Display value')).not.toBeInTheDocument();
  });

  it('keeps balance and note editing functional inside the disclosure', () => {
    const handlers = props();
    render(<AccountBalanceCard {...handlers} />);
    fireEvent.click(screen.getByLabelText('Edit balances for Synthetic Savings'));
    const balance = screen.getByLabelText('Synthetic Savings balance for 2026-10');
    fireEvent.change(balance, { target: { value: '0' } });
    expect(handlers.onBalance).not.toHaveBeenCalled();
    fireEvent.blur(balance);
    expect(handlers.onBalance).toHaveBeenCalledWith('a', '2026-10', '0');
    fireEvent.click(screen.getByLabelText('Synthetic Savings note for 2026-09: edit note'));
    fireEvent.change(screen.getByLabelText('Synthetic Savings note for 2026-09'), {
      target: { value: 'Revised note' },
    });
    expect(handlers.onNote).toHaveBeenCalledWith('a', '2026-09', 'Revised note');
  });

  it('keeps denomination guarded and deletion explicit', () => {
    const handlers = props();
    render(<AccountBalanceCard {...handlers} />);
    fireEvent.click(screen.getByLabelText('Edit balances for Synthetic Savings'));
    fireEvent.click(screen.getByText('Account settings'));
    expect(screen.getByLabelText('Synthetic Savings account currency')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Synthetic Savings' }));
    expect(handlers.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep account' }));
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Synthetic Savings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(handlers.onDelete).toHaveBeenCalledWith('a');
  });

  it('distinguishes empty accounts and current-month zero balances', () => {
    const { rerender } = render(
      <AccountBalanceCard {...props({ account: { ...account, balances: {} } })} />,
    );
    expect(screen.getByText('No balance yet')).toBeInTheDocument();
    rerender(
      <AccountBalanceCard {...props({ account: { ...account, balances: { '2026-10': 0 } } })} />,
    );
    expect(screen.getByText('Updated this month')).toBeInTheDocument();
    expect(screen.getByText(/0\s*RON equivalent/)).toBeInTheDocument();
  });
});
