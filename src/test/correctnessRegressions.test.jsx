import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { appReducer, createInitialAppData, createPersistedAppState } from '../lib/appState';
import {
  getAccountBalanceSnapshot,
  getAccountTotalsByMonth,
  getLatestAccountTotal,
} from '../lib/selectors';
import { calculateForecastScenario } from '../lib/forecast';
import { parseImportedAppState, serializeBackupState } from '../lib/persistence';
import BalanceInput from '../components/BalanceInput';

const accounts = [
  { id: 'a', name: 'Synthetic A', currency: 'RON', balances: { '2026-08': 100, '2026-09': 150 } },
  { id: 'b', name: 'Synthetic B', currency: 'EUR', balances: { '2026-08': 20 } },
  { id: 'c', name: 'Synthetic C', currency: 'RON', balances: {} },
];

describe('financial correctness regressions', () => {
  it('carries known balances forward without using future observations or inventing missing balances', () => {
    const options = { fxRates: { EUR: 5, USD: 4 } };
    expect(getAccountTotalsByMonth(accounts, options)).toEqual([
      { month: '2026-08', total: 200 },
      { month: '2026-09', total: 250 },
    ]);
    expect(getLatestAccountTotal(accounts, options)).toBe(250);
    expect(getAccountBalanceSnapshot(accounts, options)).toMatchObject({
      updated: 1,
      carried: 1,
      missing: 1,
    });
    expect(getAccountBalanceSnapshot(accounts, { ...options, month: '2026-07' })).toMatchObject({
      total: 0,
      missing: 3,
    });
  });

  it('preserves zero, removes a cleared observation, rejects invalid input and guards currency', () => {
    const state = createPersistedAppState({ ...createInitialAppData(), accounts });
    const action = { type: 'update_account_balance', accountId: 'a', month: '2026-09' };
    const zero = appReducer(state, { ...action, balance: '0' });
    expect(zero.data.accounts[0].balances['2026-09']).toBe(0);
    expect(
      appReducer(zero, { ...action, balance: '' }).data.accounts[0].balances,
    ).not.toHaveProperty('2026-09');
    expect(appReducer(state, { ...action, balance: 'invalid' })).toBe(state);
    expect(
      appReducer(state, { type: 'update_account_currency', accountId: 'a', currency: 'EUR' }),
    ).toBe(state);
    expect(
      appReducer(state, { type: 'update_account_currency', accountId: 'c', currency: 'EUR' }).data
        .accounts[2].currency,
    ).toBe('EUR');
  });

  it('keeps editing local until blur or Enter and visibly renders an explicit zero', () => {
    const onCommit = vi.fn();
    render(
      <BalanceInput accountName="Synthetic A" month="2026-09" value={0} onCommit={onCommit} />,
    );
    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(0);
    fireEvent.change(input, { target: { value: '-12.5' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('-12.5');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm balance' }));
    expect(onCommit).toHaveBeenLastCalledWith('');
  });

  it('applies expense reductions consistently and distinguishes unreachable emergency targets', () => {
    const inputs = {
      avgMonthlyExp: 1000,
      avgMonthlyNet: 0,
      currentTotalBalance: 100,
      emergencyMonths: 6,
    };
    expect(calculateForecastScenario(inputs).monthsToEmergencyFund).toBeNull();
    expect(calculateForecastScenario({ ...inputs, expenseReduction: 100 })).toMatchObject({
      effectiveMonthlySavings: 100,
      projectedMonthlyExp: 900,
      emergencyFundTarget: 5400,
      monthsToEmergencyFund: 53,
    });
    expect(calculateForecastScenario({ ...inputs, expenseReduction: 2000 }).appliedReduction).toBe(
      1000,
    );
    expect(calculateForecastScenario({ ...inputs, expenseReduction: -100 }).appliedReduction).toBe(
      0,
    );
    expect(
      calculateForecastScenario({ ...inputs, currentTotalBalance: 6000 }).monthsToEmergencyFund,
    ).toBe(0);
    expect(
      calculateForecastScenario({ ...inputs, customMonthlySavings: 50, expenseReduction: 100 })
        .effectiveMonthlySavings,
    ).toBe(150);
  });

  it.each([
    {},
    [],
    null,
    { hello: 'world' },
    { schemaVersion: 99, data: createInitialAppData() },
    { schemaVersion: 1, data: { ...createInitialAppData(), accounts: [{ name: 'broken' }] } },
  ])('rejects invalid backup input without silently repairing it: %j', (value) => {
    expect(() => parseImportedAppState(JSON.stringify(value))).toThrow();
  });

  it('round-trips account notes, transactions, budgets, goals and import history without loss', () => {
    const state = createPersistedAppState({
      ...createInitialAppData(),
      accounts: accounts.map((account) => ({ ...account, notes: { '2026-09': 'Synthetic note' } })),
      budgets: { '2026-09': { Groceries: 200 } },
      goals: [{ id: 'g', name: 'Synthetic goal', targetAmount: 500 }],
    });
    expect(parseImportedAppState(serializeBackupState(state)).data).toEqual(state.data);
  });
});
