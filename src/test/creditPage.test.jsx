import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../lib/AppContext';
import Credit from '../pages/Credit';

function renderPage() {
  return render(
    <AppProvider>
      <MemoryRouter>
        <Credit />
      </MemoryRouter>
    </AppProvider>,
  );
}
describe('Credit page', () => {
  it('shows three distinct categories and a safe missing-ING state', () => {
    renderPage();
    for (const name of ['Credit cards', 'Other credit', 'Future financing'])
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    expect(screen.getByText(/No ING credit-card account found/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link a credit card' })).toBeDisabled();
  });
  it('creates vendor credit, edits it and requires confirmation to remove it', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add vendor credit' }));
    fireEvent.change(screen.getByLabelText('Vendor / creditor'), {
      target: { value: 'Synthetic furniture' },
    });
    fireEvent.change(screen.getByLabelText('Amount still owed'), { target: { value: '1200' } });
    fireEvent.change(screen.getByLabelText('Monthly payment (optional)'), {
      target: { value: '100' },
    });
    fireEvent.change(screen.getByLabelText('Next payment date (optional)'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save credit details' }));
    expect(screen.getByRole('heading', { name: 'Synthetic furniture' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No transaction was created');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Synthetic furniture' }));
    expect(screen.getByLabelText('Amount still owed')).toHaveValue(1200);
    fireEvent.change(screen.getByLabelText('Amount still owed'), { target: { value: '1100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save credit details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Synthetic furniture' }));
    expect(screen.getByRole('heading', { name: 'Synthetic furniture' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    expect(screen.queryByRole('heading', { name: 'Synthetic furniture' })).not.toBeInTheDocument();
  });
  it('stores a future financing plan without changing actual-debt totals', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add financing plan' }));
    fireEvent.change(screen.getByLabelText('Plan name'), {
      target: { value: 'Synthetic car lease' },
    });
    fireEvent.change(screen.getByLabelText('Amount to finance'), { target: { value: '25000' } });
    fireEvent.change(screen.getByLabelText('Estimated monthly payment (optional)'), {
      target: { value: '600' },
    });
    fireEvent.change(screen.getByLabelText('Term in months (optional)'), {
      target: { value: '48' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(screen.getByRole('heading', { name: 'Synthetic car lease' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Actual debt is unchanged');
    expect(within(container.querySelector('.credit-kpis')).getAllByText(/0\s*RON/)).toHaveLength(2);
  });
  it('cancels an unsaved record without creating it', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add vendor credit' }));
    fireEvent.change(screen.getByLabelText('Vendor / creditor'), {
      target: { value: 'Not saved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Not saved' })).not.toBeInTheDocument();
  });
});
