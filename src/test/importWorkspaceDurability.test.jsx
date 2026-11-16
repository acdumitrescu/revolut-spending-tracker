// Client-only IndexedDB store: an import only reports success once the workspace is stored, and
// leaving the page is guarded while a write is pending. In-memory backend; synthetic data only.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({ config: {} }));
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: config,
  isPrivateSyncDeployment: () => config.privateSyncEnabled,
}));

import ImportWorkspace from '../pages/ImportWorkspace';
import { AppProvider } from '../lib/AppContext';
import { ToastProvider } from '../components/Toast';
import * as csvParser from '../lib/csvParser';
import { SAVE_FAILED_MESSAGE, STORE_KEYS } from '../lib/workspaceStore';
import {
  CLIENT_ONLY_CONFIG,
  LS_KEY,
  applyConfig,
  memoryLocalStorage,
  syntheticTransaction,
} from './fixtures/appContextHarness';
import { createFakeBackend, createFakeStore, quotaError } from './fixtures/fakeWorkspaceBackend';

const PARSED = {
  transactions: [syntheticTransaction({ ref: 'synthetic-durable-1' })],
  summary: {
    detectedProfileId: 'revolut-personal-raw',
    detectedProfileLabel: 'Revolut Personal CSV',
    totalRows: 1,
    processedRows: 1,
    skippedRows: 0,
    warnings: [],
    skippedReasonCounts: {},
    skippedDetails: [],
    validationCategories: {},
    unknownVendorCount: 0,
  },
  vendorObservations: [],
};

function beforeUnloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function mountAndReview(backend) {
  memoryLocalStorage();
  vi.spyOn(csvParser, 'parseCSV').mockResolvedValue(PARSED);
  const { store } = createFakeStore({ backend, storageKey: LS_KEY });
  render(
    <AppProvider workspaceStore={store}>
      <ToastProvider>
        <MemoryRouter>
          <ImportWorkspace />
        </MemoryRouter>
      </ToastProvider>
    </AppProvider>,
  );
  await screen.findByRole('button', { name: /choose csv file/i });
  const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
  fireEvent.change(fileInput, {
    target: { files: [new File(['date,description,amount\n'], 'synthetic.csv')] },
  });
  await screen.findByRole('button', { name: /add 1 transaction/i });
}

beforeEach(() => {
  applyConfig(config, CLIENT_ONLY_CONFIG);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('import durability on the IndexedDB store', () => {
  it('shows success only after the slow write is stored, and guards leaving meanwhile', async () => {
    const backend = createFakeBackend();
    await mountAndReview(backend);
    expect(beforeUnloadPrevented()).toBe(false);

    const release = backend.hold();
    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }));
    await waitFor(() => expect(backend.started).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/imported your own csv/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue to overview/i })).toBeNull();
    expect(beforeUnloadPrevented()).toBe(true);

    release();
    expect(await screen.findByText(/imported your own csv/i)).toBeInTheDocument();
    expect(backend.values.get(STORE_KEYS.workspace).data.transactions).toHaveLength(1);
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it('shows the storage error instead of success when the write fails', async () => {
    const backend = createFakeBackend();
    await mountAndReview(backend);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    backend.failWrite = () => quotaError();

    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }));

    expect(
      await screen.findByText(`Unable to complete import: ${SAVE_FAILED_MESSAGE}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/imported your own csv/i)).not.toBeInTheDocument();
    expect(backend.values.has(STORE_KEYS.workspace)).toBe(false);
    expect(beforeUnloadPrevented()).toBe(false);
  });
});
