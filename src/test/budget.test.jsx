import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Budget from '../pages/Budget';
import { ToastProvider } from '../components/Toast';

const context = vi.hoisted(() => ({
  copyBudgets: vi.fn(),
  data: {
    transactions: [],
    budgets: {
      '2026-08': { Groceries: 500 },
    },
    displayCurrency: 'RON',
    fxRates: { EUR: 5, USD: 4.6 },
  },
  setBudget: vi.fn(),
  removeBudget: vi.fn(),
  currencySummary: {
    hasMixedCurrencies: false,
    currencies: [],
  },
}));

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => context,
}));

describe('Budget page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    context.copyBudgets.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('plans empty and future months independently of imported transactions', () => {
    render(
      <ToastProvider>
        <Budget />
      </ToastProvider>,
    );

    const monthInput = screen.getByLabelText('Budget Month');
    expect(monthInput).toHaveValue('2026-09');
    expect(screen.getByText('Add Budget Category')).toBeInTheDocument();
    expect(screen.getByText('Month Comparison')).toBeInTheDocument();
    expect(screen.getByText('Unassigned Income').nextElementSibling).toHaveTextContent('—');
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly Limit (stored in RON)')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next budget month'));
    expect(monthInput).toHaveValue('2026-10');

    fireEvent.click(screen.getByLabelText('Previous budget month'));
    expect(monthInput).toHaveValue('2026-09');

    fireEvent.click(screen.getByRole('button', { name: /copy previous/i }));
    expect(context.copyBudgets).toHaveBeenCalledWith('2026-08', '2026-09');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Copied 1 missing category from August 2026. Existing categories were kept.',
    );
  });
});
