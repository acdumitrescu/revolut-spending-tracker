import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppContext } from '../lib/AppContext';

function BackupHarness() {
  const { data, importBackup } = useAppContext();

  const payload = {
    transactions: [
      { date: '2024-05-01', ym: '2024-05', desc: 'Salary', cat: 'Income', sub: 'Income', amt: 5000, flow: 'Credit', type: 'Bank Transfer', currency: 'RON' },
    ],
    customVendors: { uber: ['Transport', 'Taxi'] },
    accounts: [{ id: 'acc-1', name: 'Savings', currency: 'EUR', balances: { '2024-05': 1000 }, monthlyContribution: 200 }],
    budgets: { '2024-05': { Groceries: 800 } },
    goals: [{ id: 'goal-1', name: 'Fund', targetAmount: 15000, targetMonth: '2025-12' }],
    baseCurrency: 'RON',
    displayCurrency: 'USD',
    fxRates: { EUR: 4.95, USD: 4.55 },
    fxUpdatedAt: 1710000000000,
    fxSource: 'manual',
    lastUpdated: 1710000001000,
  };

  return (
    <div>
      <button type="button" onClick={() => importBackup(payload)}>Import backup</button>
      <div data-testid="display-currency">{data.displayCurrency}</div>
      <div data-testid="eur-rate">{data.fxRates.EUR}</div>
      <div data-testid="account-currency">{data.accounts[0]?.currency || ''}</div>
      <div data-testid="account-contribution">{data.accounts[0]?.monthlyContribution || 0}</div>
      <div data-testid="budget-groceries">{data.budgets['2024-05']?.Groceries || 0}</div>
      <div data-testid="goal-name">{data.goals[0]?.name || ''}</div>
    </div>
  );
}

function RatesHarness() {
  const { data } = useAppContext();

  return (
    <div>
      <div data-testid="eur-rate">{data.fxRates.EUR}</div>
      <div data-testid="usd-rate">{data.fxRates.USD}</div>
      <div data-testid="fx-source">{data.fxSource}</div>
    </div>
  );
}

function ThemeHarness() {
  const { data, setThemeMode } = useAppContext();

  return (
    <div>
      <button type="button" onClick={() => setThemeMode('dark')}>Dark</button>
      <div data-testid="theme-mode">{data.themeMode}</div>
    </div>
  );
}

describe('AppContext trust behavior', () => {
  it('preserves settings, balances, and budgets when importing a backup', () => {
    render(
      <AppProvider>
        <BackupHarness />
      </AppProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Import backup'));
    });

    expect(screen.getByTestId('display-currency')).toHaveTextContent('USD');
    expect(screen.getByTestId('eur-rate')).toHaveTextContent('4.95');
    expect(screen.getByTestId('account-currency')).toHaveTextContent('EUR');
    expect(screen.getByTestId('account-contribution')).toHaveTextContent('200');
    expect(screen.getByTestId('budget-groceries')).toHaveTextContent('800');
    expect(screen.getByTestId('goal-name')).toHaveTextContent('Fund');
  });

  it('keeps saved local FX rates when refresh fails', async () => {
    const savedPayload = {
      transactions: [],
      customVendors: {},
      accounts: [],
      budgets: {},
      goals: [],
      baseCurrency: 'RON',
      displayCurrency: 'RON',
      fxRates: { EUR: 4.91, USD: 4.41 },
      fxUpdatedAt: 1710000000000,
      fxSource: 'manual',
      lastUpdated: null,
    };

    window.localStorage.getItem = vi.fn(() => JSON.stringify(savedPayload));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(
      <AppProvider>
        <RatesHarness />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('eur-rate')).toHaveTextContent('4.91');
      expect(screen.getByTestId('usd-rate')).toHaveTextContent('4.41');
      expect(screen.getByTestId('fx-source')).toHaveTextContent('manual');
    });
  });

  it('persists and applies the selected theme mode', async () => {
    render(
      <AppProvider>
        <ThemeHarness />
      </AppProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Dark'));
    });

    expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
  });
});
