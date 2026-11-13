import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AccountBalanceCard from '../components/AccountBalanceCard';
import { appReducer, createInitialAppData, createPersistedAppState } from '../lib/appState';
import { AccountSchema } from '../lib/validation';

const account = {
  id: 'a',
  name: 'Synthetic Savings',
  currency: 'EUR',
  balances: { '2026-10': 120 },
  notes: {},
};
const props = (overrides = {}) => ({
  account,
  months: ['2026-10', '2026-11'],
  displayCurrency: 'EUR',
  fxRates: { EUR: 5, USD: 4 },
  currentMonth: '2026-11',
  asOfMonth: '2026-11',
  today: '2026-11-13',
  onBalance: vi.fn(),
  onNote: vi.fn(),
  onCurrency: vi.fn(),
  onDelete: vi.fn(),
  onReconciled: vi.fn(),
  ...overrides,
});

describe('bank reconciliation marker', () => {
  it('survives schema validation (unknown keys would be stripped)', () => {
    expect(AccountSchema.parse({ ...account, reconciledOn: '2026-11-01' }).reconciledOn).toBe(
      '2026-11-01',
    );
    expect(() => AccountSchema.parse({ ...account, reconciledOn: '1 Nov' })).toThrow();
  });

  it('is set, replaced and cleared by the reducer, and rejects bad dates', () => {
    const base = createPersistedAppState({ ...createInitialAppData(), accounts: [account] });
    const set = appReducer(base, {
      type: 'set_account_reconciled',
      accountId: 'a',
      date: '2026-11-01',
    });
    expect(set.data.accounts[0].reconciledOn).toBe('2026-11-01');
    expect(appReducer(set, { type: 'set_account_reconciled', accountId: 'a', date: 'soon' })).toBe(
      set,
    );
    const cleared = appReducer(set, { type: 'set_account_reconciled', accountId: 'a', date: null });
    expect(cleared.data.accounts[0]).not.toHaveProperty('reconciledOn');
    expect(createPersistedAppState(set.data).data.accounts[0].reconciledOn).toBe('2026-11-01');
  });

  it('shows the date and its age, and records today from the editor', () => {
    const onReconciled = vi.fn();
    render(
      <AccountBalanceCard
        {...props({ account: { ...account, reconciledOn: '2026-11-01' }, onReconciled })}
      />,
    );
    expect(screen.getByText('Matches bank as of 2026-11-01 (12 days ago)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Matches the bank today' }));
    expect(onReconciled).toHaveBeenCalledWith('a', '2026-11-13');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onReconciled).toHaveBeenCalledWith('a', null);
  });

  it('says when an account was never checked', () => {
    render(<AccountBalanceCard {...props()} />);
    expect(screen.getByText('Not checked against the bank')).toBeInTheDocument();
  });
});
