import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppContext } from '../lib/AppContext';
import { createPersistedAppState, appReducer } from '../lib/appState';
import { MoneyFlowSchema } from '../lib/validation';
import { moneyToMinor, incomeAllocation } from '../lib/moneyFlow';
import MoneyFlow from '../pages/MoneyFlow';

vi.mock('../components/ChartWrapper', () => ({ default: () => <div>Chart preview</div> }));

function Inspect() {
  const { data } = useAppContext();
  return <output data-testid="state">{JSON.stringify(data)}</output>;
}
function setup() {
  const state = createPersistedAppState();
  state.data.accounts = [
    { id: 'salary', name: 'Salary account', currency: 'RON', balances: { '2026-10': 1234 } },
    { id: 'saving', name: 'Savings account', currency: 'RON', balances: { '2026-10': 300 } },
    { id: 'euro', name: 'Euro savings', currency: 'EUR', balances: {} },
  ];
  localStorage.getItem.mockReturnValue(JSON.stringify(state));
  render(
    <AppProvider>
      <MoneyFlow />
      <Inspect />
    </AppProvider>,
  );
  return state;
}
const change = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
const current = () => JSON.parse(screen.getByTestId('state').textContent);
function addIncome() {
  click('Record income');
  change('Source', 'Synthetic employer');
  change('Received in', 'account:salary');
  change('Income amount', '5000');
  click('Save income');
}
describe('independent income and allocations', () => {
  it('records salary and cash, completes allocations, edits and confirms removal without changing balances or transactions', () => {
    const state = setup();
    addIncome();
    click('Add allocation');
    change('Destination', 'account:saving');
    change('Amount from income (RON)', '1200');
    click('Save allocation');
    expect(current().moneyFlow.transfers[0].status).toBe('planned');
    click('Mark completed');
    expect(current().moneyFlow.transfers[0].status).toBe('completed');
    expect(current().accounts.map((row) => row.balances)).toEqual(
      state.data.accounts.map((row) => row.balances),
    );
    expect(current().transactions).toEqual([]);
    click('Edit allocation');
    change('Amount from income (RON)', '1300');
    click('Save allocation');
    expect(current().moneyFlow.transfers[0].amountMinor).toBe(130000);
    click('Remove income');
    click('Confirm removal');
    expect(
      screen
        .getAllByRole('alert')
        .map((x) => x.textContent)
        .join(''),
    ).toContain('Remove the allocations');
  });
  it('tracks cash independently and keeps currencies separate', () => {
    setup();
    click('Record income');
    change('Source', 'Cash gift');
    change('Income type', 'gift');
    change('Income amount', '50.25');
    change('Currency', 'EUR');
    click('Save income');
    expect(current().moneyFlow.incomes[0]).toMatchObject({
      source: 'Cash gift',
      amountMinor: 5025,
      currency: 'EUR',
      receivedIn: { kind: 'cash' },
    });
    expect(screen.getByText('Recorded income · EUR')).toBeInTheDocument();
    click('Remove income');
    expect(current().moneyFlow.incomes).toHaveLength(1);
    click('Confirm removal');
    expect(current().moneyFlow.incomes).toEqual([]);
  });
  it('stores both sides of a currency exchange and flags over-allocation', () => {
    setup();
    addIncome();
    click('Add allocation');
    change('Destination', 'account:euro');
    change('Amount from income (RON)', '6000');
    change('Amount arriving (EUR)', '1200');
    click('Save allocation');
    expect(current().moneyFlow.transfers[0]).toMatchObject({
      amountMinor: 600000,
      receivedMinor: 120000,
      destination: { currency: 'EUR' },
    });
    expect(
      screen.getByText('Allocations exceed this income receipt. Review your plan.'),
    ).toBeInTheDocument();
    const receipt = screen.getByRole('region', { name: 'Income from Synthetic employer' });
    expect(within(receipt).getByText(/Over-allocated/)).toBeInTheDocument();
  });
  it('rejects zero, negatives, fractional cents and orphan allocations', () => {
    for (const value of ['0', '-1', '1.234', 'NaN']) expect(() => moneyToMinor(value)).toThrow();
    expect(moneyToMinor('0.29')).toBe(29);
    const invalid = {
      incomes: [],
      transfers: [
        {
          id: 't',
          incomeId: 'missing',
          date: '2026-10-01',
          amountMinor: 100,
          receivedMinor: 100,
          status: 'planned',
          destination: { kind: 'cash', label: 'Cash', currency: 'RON', accountId: null },
        },
      ],
    };
    expect(MoneyFlowSchema.safeParse(invalid).success).toBe(false);
    const state = createPersistedAppState();
    expect(appReducer(state, { type: 'set_money_flow', moneyFlow: invalid })).toBe(state);
    expect(
      incomeAllocation({ id: 'a', amountMinor: 1000 }, [
        { incomeId: 'a', amountMinor: 200, status: 'planned' },
        { incomeId: 'a', amountMinor: 300, status: 'completed' },
      ]),
    ).toEqual({ planned: 200, completed: 300, remaining: 500 });
  });
});
