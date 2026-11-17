import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImportWorkspace from '../pages/ImportWorkspace';
import { AppProvider } from '../lib/AppContext';
import { ToastProvider } from '../components/Toast';
import * as csvParser from '../lib/csvParser';

describe('ImportWorkspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers CSV, demo, and private restore paths', () => {
    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>,
    );

    expect(
      screen.getByRole('heading', { name: /bring your financial history into focus/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose csv file/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try synthetic demo data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore private backup/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download csv template/i })).toBeInTheDocument();
    expect(screen.getByText(/no bank connection or public upload required/i)).toBeInTheDocument();
    expect(
      screen.getByText(/uploaded csvs stay in this browser on this device/i),
    ).toBeInTheDocument();
  });

  it('reviews a non-demo CSV before adding it and then shows the backup reminder', async () => {
    vi.spyOn(csvParser, 'parseCSV').mockResolvedValue({
      transactions: [
        {
          date: '2026-06-01',
          desc: 'Demo Coffee Shop',
          cat: 'Food & Dining',
          sub: 'Coffee',
          amt: 24,
          flow: 'Debit',
          type: 'Card payment',
          ym: '2026-06',
        },
      ],
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
      </AppProvider>,
    );

    const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
    const file = new File(['date,description,amount\n'], 'my-private-upload.csv', {
      type: 'text/csv',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'my-private-upload.csv' })).toBeInTheDocument();
    });
    expect(screen.getByText(/review before adding/i)).toBeInTheDocument();
    expect(screen.queryByText(/imported your own csv/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }));

    await waitFor(() => {
      expect(screen.getByText(/imported your own csv/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/export a json backup before leaving/i).length).toBeGreaterThan(0);
  });

  it('shows an already imported transaction as a duplicate before a second import', async () => {
    const parsedResult = {
      transactions: [
        {
          date: '2026-06-01',
          desc: 'Synthetic Coffee Shop',
          cat: 'Food & Dining',
          sub: 'Coffee',
          amt: -24,
          flow: 'Debit',
          type: 'Card Payment',
          ym: '2026-06',
          currency: 'RON',
          ref: 'synthetic-1',
        },
      ],
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
    vi.spyOn(csvParser, 'parseCSV').mockResolvedValue(parsedResult);

    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>,
    );

    const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
    const file = new File(['synthetic'], 'repeat.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByRole('button', { name: /add 1 transaction/i });
    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }));
    await screen.findByText(/import complete/i);

    fireEvent.change(fileInput, { target: { files: [file] } });

    await screen.findByText(/duplicates will not be added/i);
    expect(screen.getByText(/1 already in the app/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no new transactions/i })).toBeDisabled();
  });

  it('cancels a pending review without adding transactions', async () => {
    vi.spyOn(csvParser, 'parseCSV').mockResolvedValue({
      transactions: [
        {
          date: '2026-06-01',
          desc: 'Synthetic Market',
          cat: 'Groceries',
          sub: 'Market',
          amt: -20,
          flow: 'Debit',
          type: 'Card Payment',
          ym: '2026-06',
          currency: 'RON',
        },
      ],
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
    });

    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>,
    );

    const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['synthetic'], 'cancel.csv', { type: 'text/csv' })] },
    });
    await screen.findByRole('button', { name: /add 1 transaction/i });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByText(/review before adding/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/import complete/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeEnabled();
  });

  it('shows invalid row details and offers a review report', async () => {
    vi.spyOn(csvParser, 'parseCSV').mockResolvedValue({
      transactions: [],
      rejectedRows: [{ rowNumber: 2, reason: 'invalid amount' }],
      summary: {
        detectedProfileId: 'normalized-csv',
        detectedProfileLabel: 'Normalized CSV',
        totalRows: 1,
        processedRows: 0,
        skippedRows: 1,
        warnings: [],
        skippedReasonCounts: { 'invalid amount': 1 },
        skippedDetails: ['Row 2: invalid amount'],
        validationCategories: { 'suspicious-amount': 1 },
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
      </AppProvider>,
    );

    const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['invalid'], 'invalid.csv', { type: 'text/csv' })] },
    });

    await screen.findByText(/invalid rows will be skipped/i);
    fireEvent.click(screen.getByText(/view rejected rows/i));
    expect(screen.getByText('Row 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download review report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no new transactions/i })).toBeDisabled();
  });

  it('keeps an audit record when a confirmed import is undone', async () => {
    vi.spyOn(csvParser, 'parseCSV').mockResolvedValue({
      transactions: [
        {
          date: '2026-06-01',
          desc: 'Synthetic Market',
          cat: 'Groceries',
          sub: 'Market',
          amt: -20,
          flow: 'Debit',
          type: 'Card Payment',
          ym: '2026-06',
          currency: 'RON',
        },
      ],
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
    });

    render(
      <AppProvider>
        <ToastProvider>
          <MemoryRouter>
            <ImportWorkspace />
          </MemoryRouter>
        </ToastProvider>
      </AppProvider>,
    );

    const fileInput = document.querySelector('input[type="file"][accept=".csv"]');
    fireEvent.change(fileInput, {
      target: { files: [new File(['synthetic'], 'undo.csv', { type: 'text/csv' })] },
    });
    await screen.findByRole('button', { name: /add 1 transaction/i });
    fireEvent.click(screen.getByRole('button', { name: /add 1 transaction/i }));
    await screen.findByRole('button', { name: /undo import/i });

    fireEvent.click(screen.getByRole('button', { name: /undo import/i }));
    expect(screen.getByText(/remove 1 transaction/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm undo/i }));

    await screen.findByText('Undone');
    expect(screen.queryByText(/import complete/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export json/i })).toBeEnabled();
  });
});
