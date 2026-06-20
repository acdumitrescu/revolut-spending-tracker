import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ImportWorkspace from '../pages/ImportWorkspace';
import { AppProvider } from '../lib/AppContext';
import { ToastProvider } from '../components/Toast';
import * as csvParser from '../lib/csvParser';

describe('ImportWorkspace', () => {
  it('offers CSV, demo, and private restore paths', () => {
    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>
    );

    expect(screen.getByRole('heading', { name: /bring your financial history into focus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose csv file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try synthetic demo data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore private backup/i })).toBeInTheDocument();
    expect(screen.getByText(/no bank connection or public upload required/i)).toBeInTheDocument();
    expect(screen.getByText(/uploaded csvs stay in this browser on this device/i)).toBeInTheDocument();
  });

  it('shows the backup reminder after a non-demo CSV import', async () => {
    vi.spyOn(csvParser, 'parseCSV').mockResolvedValue({
      transactions: [{
        date: '2026-06-01',
        desc: 'Demo Coffee Shop',
        cat: 'Food & Dining',
        sub: 'Coffee',
        amt: 24,
        flow: 'Debit',
        type: 'Card payment',
        ym: '2026-06',
      }],
      summary: {
        detectedProfileId: 'revolut-personal-raw',
        detectedProfileLabel: 'Revolut Personal CSV',
        totalRows: 12,
        processedRows: 12,
        skippedRows: 0,
        warnings: [],
        skippedReasonCounts: {},
        skippedDetails: [],
        validationCategories: {},
        unknownVendorCount: 0,
      },
      vendorObservations: [],
    });

    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>
    );

    const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
    const file = new File(['date,description,amount\n'], 'my-private-upload.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/imported your own csv/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/export a json backup before leaving/i).length).toBeGreaterThan(0);
  });
});
