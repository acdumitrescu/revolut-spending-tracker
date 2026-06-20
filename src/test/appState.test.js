import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { appReducer, createInitialAppData, createPersistedAppState } from '../lib/appState';
import { txKey } from '../lib/csvParser';

describe('appReducer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wraps state in the versioned persisted contract', () => {
    const persisted = createPersistedAppState();
    expect(persisted.schemaVersion).toBe(1);
    expect(persisted.data.displayCurrency).toBe('RON');
  });

  it('records durable import metadata when an import completes', () => {
    const base = createPersistedAppState(createInitialAppData());
    const next = appReducer(base, {
      type: 'record_import_summary',
      fileName: 'sample.csv',
      summary: {
        detectedProfileId: 'normalized-csv',
        detectedProfileLabel: 'Normalized CSV',
        totalRows: 12,
        processedRows: 10,
        skippedRows: 2,
        warnings: [],
        skippedReasonCounts: { 'invalid amount': 1 },
        skippedDetails: ['Row 3: invalid amount'],
        validationCategories: { 'suspicious-amount': 1 },
      },
    });

    expect(next.data.importMeta.latestSummary.fileName).toBe('sample.csv');
    expect(next.data.importMeta.latestSummary.validationCategories['suspicious-amount']).toBe(1);
    expect(next.data.lastUpdated).toBe(Date.now());
  });

  it('tracks sync metadata separately from content timestamps', () => {
    const base = createPersistedAppState(createInitialAppData());
    const next = appReducer(base, {
      type: 'set_sync_info',
      syncInfo: {
        lastSuccessfulSyncAt: 1234,
        lastRemoteVersion: 9,
        lastRemoteUpdatedAt: 5678,
      },
    });

    expect(next.data.syncInfo).toEqual({
      lastSuccessfulSyncAt: 1234,
      lastRemoteVersion: 9,
      lastRemoteUpdatedAt: 5678,
    });
    expect(next.data.lastUpdated).toBeNull();
  });

  it('updates a single transaction category and subcategory by transaction key', () => {
    const baseData = createInitialAppData();
    baseData.transactions = [
      {
        date: '2026-06-01',
        desc: 'Coffee Shop',
        cat: 'Food & Dining',
        sub: 'Coffee',
        amt: -18,
        flow: 'Debit',
        type: 'Card Payment',
        ym: '2026-06',
        currency: 'RON',
      },
      {
        date: '2026-06-02',
        desc: 'Taxi Ride',
        cat: 'Transport',
        sub: 'Taxi',
        amt: -42,
        flow: 'Debit',
        type: 'Card Payment',
        ym: '2026-06',
        currency: 'RON',
      },
    ];

    const base = createPersistedAppState(baseData);
    const next = appReducer(base, {
      type: 'update_transaction_category',
      transactionKey: txKey(base.data.transactions[0]),
      category: 'Shopping',
      subcategory: 'General',
      getTransactionKey: txKey,
    });

    expect(next.data.transactions[0].cat).toBe('Shopping');
    expect(next.data.transactions[0].sub).toBe('General');
    expect(next.data.transactions[1].cat).toBe('Transport');
    expect(next.data.lastUpdated).toBe(Date.now());
  });
});
