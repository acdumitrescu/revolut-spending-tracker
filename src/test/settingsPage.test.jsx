import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import SettingsPage from '../pages/SettingsPage';

const unlockPrivateSync = vi.fn();
const lockPrivateSync = vi.fn();
let automaticAuthentication = false;

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      displayCurrency: 'RON',
      themeMode: 'dark',
      fxRates: { EUR: 5, USD: 4.6 },
      fxSource: 'manual-default',
    },
    currencySummary: { currencies: ['RON'] },
    fxStatus: { message: 'Saved rates active.' },
    runtimeConfig: {
      deploymentProfile: 'private-sync',
      privateSyncEnabled: true,
      privateSyncAutoAuth: automaticAuthentication,
    },
    runtimeIssues: [],
    syncStatus: {
      phase: 'auth-required',
      enabled: true,
      message: 'Unlock private sync in Settings.',
    },
    setDisplayCurrency: vi.fn(),
    setThemeMode: vi.fn(),
    setFxRates: vi.fn(),
    refreshFxRates: vi.fn(),
    clearData: vi.fn(),
    unlockPrivateSync,
    lockPrivateSync,
  }),
}));

describe('Settings private sync access', () => {
  afterEach(() => {
    automaticAuthentication = false;
  });

  it('unlocks with a tab-scoped token and can lock without clearing app data', () => {
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    );

    const tokenInput = screen.getByLabelText('Private sync token');
    fireEvent.change(tokenInput, { target: { value: 'synthetic-settings-token-32-characters-minimum' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(unlockPrivateSync).toHaveBeenCalledWith('synthetic-settings-token-32-characters-minimum');
    expect(tokenInput).toHaveValue('');
    expect(screen.getByText(/never included in app data or backups/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    expect(lockPrivateSync).toHaveBeenCalled();
  });

  it('replaces token controls with automatic local sync status in trusted development', () => {
    automaticAuthentication = true;
    render(
      <ToastProvider>
        <SettingsPage />
      </ToastProvider>
    );

    expect(screen.getByText('Automatic local sync')).toBeInTheDocument();
    expect(screen.getByText(/trusted localhost development proxy/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Private sync token')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument();
  });
});
