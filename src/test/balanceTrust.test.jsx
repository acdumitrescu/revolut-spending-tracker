import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BalanceInput from '../components/BalanceInput';
import { createPersistedAppState, appReducer } from '../lib/appState';
import { AccountSchema } from '../lib/validation';
import {
  getAccountGroups,
  getNetWorthBreakdown,
  getOverviewPosition,
} from '../lib/overviewPosition';

describe('balance trust controls', () => {
  it('holds a tenfold change until confirmed and lets it be cancelled', () => {
    const onCommit = vi.fn();
    render(<BalanceInput accountName="Test" month="2026-10" value={4000} onCommit={onCommit} />);
    const field = screen.getByRole('spinbutton');
    fireEvent.change(field, { target: { value: '40000' } });
    fireEvent.blur(field);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel change' }));
    expect(field).toHaveValue(4000);
    fireEvent.change(field, { target: { value: '40000' } });
    fireEvent.blur(field);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm balance' }));
    expect(onCommit).toHaveBeenCalledWith('40000');
  });
  it('undo restores the prior value and refuses to overwrite a later edit', () => {
    let state = createPersistedAppState();
    state.data.accounts = [
      AccountSchema.parse({
        id: 'a',
        name: 'Test',
        currency: 'RON',
        balances: { '2026-10': 4000 },
      }),
    ];
    const updated = appReducer(state, {
      type: 'update_account_balance',
      accountId: 'a',
      month: '2026-10',
      balance: '40000',
    });
    const undo = {
      type: 'undo_account_balance',
      accountId: 'a',
      month: '2026-10',
      previous: 4000,
      expected: 40000,
    };
    expect(appReducer(updated, undo).data.accounts[0].balances['2026-10']).toBe(4000);
    const later = appReducer(updated, {
      type: 'update_account_balance',
      accountId: 'a',
      month: '2026-10',
      balance: 41000,
    });
    expect(appReducer(later, undo)).toBe(later);
  });
  it('persists explicit groups despite account names and validates the choices', () => {
    const a = AccountSchema.parse({
      id: 'a',
      name: 'XTB',
      balances: { '2026-10': 400 },
      currency: 'RON',
    });
    expect(a.group).toBe('investments');
    const renamed = AccountSchema.parse({ ...a, name: 'Cash', group: 'bank' });
    expect(renamed.group).toBe('bank');
    expect(AccountSchema.safeParse({ ...a, group: 'invalid' }).success).toBe(false);
    const data = { accounts: [renamed], displayCurrency: 'RON', fxRates: { EUR: 5, USD: 4 } };
    expect(getAccountGroups(data).bank.total).toBe(400);
    expect(getAccountGroups(data).shares.total).toBe(0);
  });
  it('breakdown reconciles with net worth and flags stale and missing balances', () => {
    const data = {
      accounts: [
        { id: 'a', name: 'Bank', currency: 'EUR', balances: { '2026-09': 100 } },
        { id: 'c', name: 'ING CREDIT', currency: 'RON', balances: { '2026-10': -100 } },
        { id: 'm', name: 'Missing', currency: 'RON', balances: {} },
      ],
      creditRecords: [
        {
          id: 'v',
          kind: 'vendor',
          name: 'Vendor',
          remainingBalance: 50,
          currency: 'RON',
          monthlyPayment: null,
        },
      ],
      displayCurrency: 'RON',
      fxRates: { EUR: 5, USD: 4 },
    };
    const rows = getNetWorthBreakdown(data, new Date(2026, 9, 5));
    expect(rows.reduce((sum, row) => sum + (row.contribution ?? 0), 0)).toBe(
      getOverviewPosition(data).netWorth,
    );
    expect(rows[0]).toMatchObject({ rate: 5, contribution: 500, status: 'Older balance — review' });
    expect(rows[2]).toMatchObject({ contribution: null, status: 'Missing — excluded' });
  });
});
