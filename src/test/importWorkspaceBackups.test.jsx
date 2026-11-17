import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';

const createBackupNow = vi.fn().mockResolvedValue({
  filename: 'simple_safe_banking_backup_manual_test.json',
  createdAt: '2026-09-26T18:30:00.000Z',
  reason: 'manual',
  importBatchId: null,
});

vi.mock('../lib/AppContext', () => ({
  useAppContext: () => ({
    data: {
      transactions: [],
      customVendors: {},
      importMeta: { latestSummary: null, history: [] },
    },
    persistedState: { schemaVersion: 1, data: { transactions: [], accounts: [] } },
    runtimeConfig: {
      privateSyncEnabled: true,
      privateSyncAutoAuth: true,
      privateBackupEnabled: true,
    },
    syncStatus: { phase: 'synced' },
    createBackupNow,
    commitTransactionImport: vi.fn(),
    importBackup: vi.fn(),
    recordVendorObservations: vi.fn(),
    undoTransactionImport: vi.fn(),
  }),
}));

import ImportWorkspace from '../pages/ImportWorkspace';

describe('ImportWorkspace server backup controls', () => {
  it('creates an on-demand backup and shows its private filename', async () => {
    render(
      <ToastProvider>
        <MemoryRouter>
          <ImportWorkspace />
        </MemoryRouter>
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /create backup now/i }));

    await waitFor(() => expect(createBackupNow).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/simple_safe_banking_backup_manual_test\.json/i)).toHaveLength(2);
    expect(screen.getByText(/backups\/automatic/i)).toBeInTheDocument();
  });
});
