import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import Forecast from '../pages/Forecast';
import { calculateCashFlowScenario } from '../lib/forecast';

const { chart, context } = vi.hoisted(() => ({ chart: vi.fn(() => null), context: { data: {} } }));
vi.mock('../components/ChartWrapper', () => ({ default: chart }));
vi.mock('../lib/AppContext', () => ({ useAppContext: () => context }));
beforeEach(() => {
  chart.mockClear();
  context.data = {
    transactions: [],
    accounts: [
      { id: 'brd', name: 'BRD', currency: 'RON', balances: { '2020-01': 10000 } },
      { id: 'savings', name: 'Savings', currency: 'EUR', balances: { '2020-01': 1000 } },
      { id: 'empty', name: 'Empty', currency: 'RON', balances: {} },
      { id: 'future', name: 'Future', currency: 'RON', balances: { '2099-01': 100 } },
    ],
    displayCurrency: 'RON',
    fxRates: { EUR: 5, USD: 4 },
  };
});
function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
}
function estimates() {
  fill('Estimated monthly income (RON)', 8000);
  fill('Estimated monthly expenses (RON)', 5000);
}

it('requires explicit inputs and works with no imported transactions or accounts', () => {
  context.data.accounts = [];
  render(<Forecast />);
  expect(chart).not.toHaveBeenCalled();
  estimates();
  expect(chart).not.toHaveBeenCalled();
  fill('Starting balance (RON)', 0);
  expect(chart.mock.lastCall[0].data.datasets[0].data.at(-1)).toBe(36000);
  expect(chart.mock.lastCall[0].options.scales.y.beginAtZero).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include zero on balance axis' }));
  expect(chart.mock.lastCall[0].options.scales.y.beginAtZero).toBe(true);
  fill('Scenario period', 24);
  expect(chart.mock.lastCall[0].data.datasets[0].data.at(-1)).toBe(72000);
  fireEvent.click(screen.getByRole('button', { name: 'Clear scenario' }));
  expect(screen.queryByRole('region', { name: 'Cash-flow projection' })).not.toBeInTheDocument();
});

it('uses only explicitly selected accounts and discloses old balances without mutating them', () => {
  const original = JSON.stringify(context.data);
  render(<Forecast />);
  estimates();
  fill('Starting balance source', 'accounts');
  expect(chart).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('BRD (RON)'));
  expect(chart.mock.lastCall[0].data.datasets[0].data[0]).toBe(10000);
  expect(screen.getByText('BRD: using balance recorded 2020-01')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Savings (EUR)'));
  expect(chart.mock.lastCall[0].data.datasets[0].data[0]).toBe(15000);
  fireEvent.click(screen.getByLabelText('Empty (RON)'));
  expect(screen.getByRole('alert')).toHaveTextContent('no balance');
  expect(screen.queryByRole('region', { name: 'Cash-flow projection' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Empty (RON)'));
  fireEvent.click(screen.getByLabelText('Future (RON)'));
  expect(screen.getByRole('alert')).toHaveTextContent('no balance');
  expect(JSON.stringify(context.data)).toBe(original);
});

it('handles zero, shortfalls and invalid entries and converts display amounts only', () => {
  context.data.displayCurrency = 'EUR';
  render(<Forecast />);
  estimates();
  fill('Starting balance (RON)', 10000);
  expect(chart.mock.lastCall[0].data.datasets[0].data[0]).toBe(2000);
  fill('Estimated monthly income (RON)', 0);
  expect(chart.mock.lastCall[0].data.datasets[0].data.at(-1)).toBe(-10000);
  expect(screen.getByRole('status')).toHaveTextContent('Expenses exceed income');
  fill('Estimated monthly expenses (RON)', '-1');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fill('Estimated monthly expenses (RON)', '1.001');
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fill('Estimated monthly expenses (RON)', '');
  expect(screen.queryByRole('region', { name: 'Cash-flow projection' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use 5,000 RON expenses' }));
  expect(screen.getByLabelText('Estimated monthly expenses (RON)')).toHaveValue('5000');
});

it('projects explicit income minus expenses in cents, including flat and negative balances', () => {
  expect(
    calculateCashFlowScenario({
      startingBalance: 10000,
      monthlyIncome: 8000,
      monthlyExpenses: 5000,
      months: 12,
    }),
  ).toMatchObject({ monthlyNet: 3000, endingBalance: 46000, totalChange: 36000 });
  expect(
    calculateCashFlowScenario({
      startingBalance: 0.1,
      monthlyIncome: 0.2,
      monthlyExpenses: 0.1,
      months: 3,
    }).balances,
  ).toEqual([0.1, 0.2, 0.3, 0.4]);
  expect(
    calculateCashFlowScenario({
      startingBalance: -10,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      months: 3,
    }).balances,
  ).toEqual([-10, -10, -10, -10]);
  for (const monthlyIncome of [-1, NaN, Infinity])
    expect(() =>
      calculateCashFlowScenario({ startingBalance: 0, monthlyIncome, monthlyExpenses: 0 }),
    ).toThrow();
});
