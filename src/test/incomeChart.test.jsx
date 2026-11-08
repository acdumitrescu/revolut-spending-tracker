import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IncomeChart from '../components/IncomeChart';
import { monthlyIncome } from '../lib/moneyFlow';

vi.mock('../components/ChartWrapper', () => ({default: ({data}) => <output data-testid="chart-values">{JSON.stringify(data.datasets[0].data)}</output>}));
const incomes = [
  {date:'2024-01-02',currency:'RON',amountMinor:10025},
  {date:'2024-01-20',currency:'RON',amountMinor:20000},
  {date:'2024-12-31',currency:'RON',amountMinor:5000},
  {date:'2024-01-03',currency:'EUR',amountMinor:9900},
  {date:'2025-01-02',currency:'RON',amountMinor:77700},
];
describe('monthly income chart', () => {
  it('groups exact cents into all twelve months without mixing years or currencies', () => {
    expect(monthlyIncome(incomes, '2024', 'RON')).toEqual([30025,0,0,0,0,0,0,0,0,0,0,5000]);
    expect(monthlyIncome([], '2024', 'RON')).toEqual(Array(12).fill(0));
  });
  it('changes the displayed year and currency and exposes accessible monthly amounts', () => {
    render(<IncomeChart incomes={incomes} />);
    fireEvent.change(screen.getByLabelText('Income chart year'), {target:{value:'2024'}});
    expect(JSON.parse(screen.getByTestId('chart-values').textContent)[0]).toBe(300.25);
    fireEvent.change(screen.getByLabelText('Income chart currency'), {target:{value:'EUR'}});
    expect(JSON.parse(screen.getByTestId('chart-values').textContent)[0]).toBe(99);
    fireEvent.change(screen.getByLabelText('Income chart year'), {target:{value:'2025'}});
    expect(screen.getByText('No EUR income recorded in 2025.')).toBeInTheDocument();
    expect(screen.getByText('Recorded income in 2025 (EUR)')).toBeInTheDocument();
  });
});
