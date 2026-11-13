import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialAppData, createPersistedAppState, appReducer } from '../lib/appState';
import ImportWorkspace from '../pages/ImportWorkspace';
import { ToastProvider } from '../components/Toast';

const mocks = vi.hoisted(() => ({ importBackup: vi.fn(), createBackupNow: vi.fn() }));
vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: createInitialAppData(),
    persistedState: createPersistedAppState(),
    runtimeConfig: { privateSyncEnabled: true, privateBackupEnabled: true },
    syncStatus: { phase: 'synced' },
    ...mocks,
  }),
}));

function upload(value) {
  const input = document.querySelector('input[accept=".json"]');
  fireEvent.change(input, {
    target: { files: [{ name: 'synthetic.json', text: async () => JSON.stringify(value) }] },
  });
}
function renderPage() {
  render(
    <ToastProvider>
      <MemoryRouter>
        <ImportWorkspace />
      </MemoryRouter>
    </ToastProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.createBackupNow.mockResolvedValue({ filename: 'recovery.json' });
});

describe('safe backup restoration', () => {
  it('rejects unrelated JSON without touching app state', async () => {
    renderPage();
    upload({});
    await screen.findByText('Invalid or unsupported backup. Nothing was replaced.');
    expect(mocks.importBackup).not.toHaveBeenCalled();
    expect(mocks.createBackupNow).not.toHaveBeenCalled();
  });
  it('previews data, permits cancellation, and requires a successful recovery backup before replacement', async () => {
    renderPage();
    upload(createPersistedAppState());
    await screen.findByRole('region', { name: 'Review backup restoration' });
    expect(mocks.importBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel restore'));
    expect(mocks.createBackupNow).not.toHaveBeenCalled();
    upload(createPersistedAppState());
    await screen.findByText('Back up current data and replace workspace');
    mocks.createBackupNow.mockRejectedValueOnce(new Error('disk full'));
    fireEvent.click(screen.getByText('Back up current data and replace workspace'));
    await screen.findByText('Restore stopped: disk full');
    expect(mocks.importBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back up current data and replace workspace'));
    await waitFor(() => expect(mocks.importBackup).toHaveBeenCalledTimes(1));
    expect(mocks.createBackupNow).toHaveBeenCalledTimes(2);
  });
  it('keeps the current server revision when restoring an older portable backup', () => {
    const current = createPersistedAppState();
    current.data.syncInfo.lastRemoteVersion = 100;
    const old = createInitialAppData();
    old.syncInfo.lastRemoteVersion = 2;
    expect(
      appReducer(current, { type: 'import_backup', nextData: old }).data.syncInfo.lastRemoteVersion,
    ).toBe(100);
  });
});
