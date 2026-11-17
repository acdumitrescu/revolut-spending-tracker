import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { appReducer, createInitialAppData, createPersistedAppState } from '../lib/appState';
import { mergeTransactions, txKey } from '../lib/csvParser';

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

  it('commits and undoes one import batch without touching earlier transactions', () => {
    const data = createInitialAppData();
    data.transactions = [
      {
        date: '2026-05-01',
        desc: 'Earlier transaction',
        cat: 'Other',
        sub: '',
        amt: -5,
        flow: 'Debit',
        type: 'Card Payment',
        ym: '2026-05',
        currency: 'RON',
      },
    ];
    const base = createPersistedAppState(data);
    const importedTransaction = {
      date: '2026-06-01',
      desc: 'Imported transaction',
      cat: 'Groceries',
      sub: 'Market',
      amt: -20,
      flow: 'Debit',
      type: 'Card Payment',
      ym: '2026-06',
      currency: 'RON',
    };
    const committed = appReducer(base, {
      type: 'commit_transaction_import',
      batchId: 'batch-1',
      fileName: 'sample.csv',
      importedAt: 1000,
      transactions: [importedTransaction],
      summary: {
        detectedProfileId: 'revolut-personal-raw',
        detectedProfileLabel: 'Revolut Personal CSV',
        totalRows: 1,
        processedRows: 1,
        skippedRows: 0,
      },
    });

    expect(committed.data.transactions).toHaveLength(2);
    expect(committed.data.transactions[1]).toMatchObject({
      desc: 'Imported transaction',
      importBatchId: 'batch-1',
    });
    expect(committed.data.importMeta.latestSummary.batchId).toBe('batch-1');
    expect(committed.data.importMeta.history[0]).toMatchObject({
      batchId: 'batch-1',
      fileName: 'sample.csv',
      status: 'active',
    });

    const undone = appReducer(committed, {
      type: 'undo_transaction_import',
      batchId: 'batch-1',
      undoneAt: 2000,
    });

    expect(undone.data.transactions).toHaveLength(1);
    expect(undone.data.transactions[0]).toMatchObject(data.transactions[0]);
    expect(undone.data.importMeta.latestSummary).toBeNull();
    expect(undone.data.importMeta.history[0]).toMatchObject({
      batchId: 'batch-1',
      status: 'undone',
      undoneAt: 2000,
    });
    expect(appReducer(undone, { type: 'undo_transaction_import', batchId: 'batch-1' })).toBe(
      undone,
    );
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
    expect(next.data.transactions).toBe(base.data.transactions);
    expect(next.data.customVendors).toBe(base.data.customVendors);
  });

  it('preserves category inputs across unrelated state updates', () => {
    const data = createInitialAppData();
    data.transactions = [
      {
        date: '2026-06-01',
        desc: 'Synthetic Merchant',
        cat: 'Other',
        sub: '',
        amt: -10,
        flow: 'Debit',
        type: 'Card Payment',
        ym: '2026-06',
        currency: 'RON',
      },
    ];
    data.customVendors = { synthetic: ['Shopping', 'General'] };
    const base = createPersistedAppState(data);

    const themeChanged = appReducer(base, { type: 'set_theme_mode', themeMode: 'light' });
    const accountAdded = appReducer(themeChanged, {
      type: 'add_account',
      name: 'Synthetic Account',
      currency: 'RON',
    });
    const fxChanged = appReducer(accountAdded, {
      type: 'set_fx_rates',
      rates: { EUR: 4.99, USD: 4.59 },
      source: 'manual',
    });

    expect(themeChanged.data.transactions).toBe(base.data.transactions);
    expect(accountAdded.data.transactions).toBe(base.data.transactions);
    expect(fxChanged.data.transactions).toBe(base.data.transactions);
    expect(themeChanged.data.customVendors).toBe(base.data.customVendors);
    expect(accountAdded.data.customVendors).toBe(base.data.customVendors);
    expect(fxChanged.data.customVendors).toBe(base.data.customVendors);
  });

  it('stores and clears a note for an account month', () => {
    const data = createInitialAppData();
    data.accounts = [
      { id: 'account-1', name: 'Savings', currency: 'RON', balances: {}, notes: {} },
    ];
    const base = createPersistedAppState(data);

    const noted = appReducer(base, {
      type: 'update_account_note',
      accountId: 'account-1',
      month: '2026-09',
      note: 'Estimated balance',
    });
    expect(noted.data.accounts[0].notes).toEqual({ '2026-09': 'Estimated balance' });

    const cleared = appReducer(noted, {
      type: 'update_account_note',
      accountId: 'account-1',
      month: '2026-09',
      note: '',
    });
    expect(cleared.data.accounts[0].notes).toEqual({});
  });

  it('copies only missing budget categories from the previous month', () => {
    const data = createInitialAppData();
    data.budgets = {
      '2026-05': { Groceries: 500, Utilities: 300, 'Pet fund': 100 },
      '2026-06': { Groceries: 650 },
    };
    const base = createPersistedAppState(data);

    const next = appReducer(base, {
      type: 'copy_budgets',
      sourceMonth: '2026-05',
      targetMonth: '2026-06',
    });

    expect(next.data.budgets['2026-06']).toEqual({
      Groceries: 650,
      Utilities: 300,
      'Pet fund': 100,
    });
    expect(next.data.budgets['2026-05']).toEqual(data.budgets['2026-05']);
  });

  it('preserves transactions when only custom mappings change', () => {
    const base = createPersistedAppState(createInitialAppData());
    const next = appReducer(base, {
      type: 'update_custom_vendor',
      vendorName: 'Synthetic Merchant',
      category: 'Shopping',
      subcategory: 'General',
    });

    expect(next.data.transactions).toBe(base.data.transactions);
    expect(next.data.customVendors).not.toBe(base.data.customVendors);
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
    expect(next.data.transactions[0].baseCat).toBe('Food & Dining');
    expect(next.data.transactions[0].manualCat).toBe('Shopping');
    expect(next.data.transactions[1].cat).toBe('Transport');
    expect(next.data.lastUpdated).toBe(Date.now());

    const cleared = appReducer(next, {
      type: 'clear_transaction_category_override',
      transactionKey: txKey(next.data.transactions[0]),
      getTransactionKey: txKey,
    });

    expect(cleared.data.transactions[0].cat).toBe('Food & Dining');
    expect(cleared.data.transactions[0].manualCat).toBeUndefined();
  });

  it('overrides a transaction currency without changing its identity, and restores it', () => {
    const txn = {
      date: '2026-10-26',
      desc: 'Shop',
      amt: 20,
      type: 'card',
      flow: 'Debit',
      ym: '2026-10',
      cat: 'Shopping',
      sub: '',
      currency: 'RON',
    };
    const other = { ...txn, desc: 'Other', currency: 'RON' };
    const base = createPersistedAppState({ ...createInitialAppData(), transactions: [txn, other] });
    const originalKey = txKey(txn);

    const next = appReducer(base, {
      type: 'set_transaction_currency',
      transactionKey: originalKey,
      currency: 'EUR',
      getTransactionKey: txKey,
    });
    const changed = next.data.transactions[0];
    expect(changed.currency).toBe('EUR');
    expect(changed.baseCurrency).toBe('RON');
    expect(txKey(changed)).toBe(originalKey); // re-import dedupe and category overrides keep matching
    expect(next.data.transactions[1].currency).toBe('RON');

    // a second change keeps the first original currency
    const again = appReducer(next, {
      type: 'set_transaction_currency',
      transactionKey: originalKey,
      currency: 'USD',
      getTransactionKey: txKey,
    });
    expect(again.data.transactions[0].baseCurrency).toBe('RON');

    const cleared = appReducer(again, {
      type: 'set_transaction_currency',
      transactionKey: originalKey,
      getTransactionKey: txKey,
    });
    expect(cleared.data.transactions[0].currency).toBe('RON');
    expect(cleared.data.transactions[0].baseCurrency).toBeUndefined();
  });

  it('restores a missing original currency to missing', () => {
    const txn = {
      date: '2026-10-26',
      desc: 'Shop',
      amt: 20,
      type: 'card',
      flow: 'Debit',
      ym: '2026-10',
      cat: 'Shopping',
      sub: '',
    };
    const base = createPersistedAppState({ ...createInitialAppData(), transactions: [txn] });
    const key = txKey(txn);
    const set = appReducer(base, {
      type: 'set_transaction_currency',
      transactionKey: key,
      currency: 'EUR',
      getTransactionKey: txKey,
    });
    expect(txKey(set.data.transactions[0])).toBe(key);
    const cleared = appReducer(set, {
      type: 'set_transaction_currency',
      transactionKey: key,
      getTransactionKey: txKey,
    });
    expect('currency' in cleared.data.transactions[0]).toBe(false);
  });

  it('adds, updates, and removes manual portfolio holdings without private seed data', () => {
    const base = createPersistedAppState(createInitialAppData());
    const holding = {
      id: 'holding-1',
      ticker: 'TEST',
      name: 'Synthetic Holding',
      assetClass: 'Stock',
      quantity: 2,
      avgCost: 10,
      currentPrice: 12,
      currency: 'RON',
      priceSource: 'manual',
    };
    const added = appReducer(base, { type: 'upsert_portfolio_holding', holding });
    expect(added.data.portfolioHoldings).toEqual([holding]);

    const updatedHolding = { ...holding, currentPrice: 15 };
    const updated = appReducer(added, {
      type: 'upsert_portfolio_holding',
      holding: updatedHolding,
    });
    expect(updated.data.portfolioHoldings).toEqual([updatedHolding]);

    const removed = appReducer(updated, {
      type: 'remove_portfolio_holding',
      holdingId: holding.id,
    });
    expect(removed.data.portfolioHoldings).toEqual([]);
  });
});

describe('record_import_sources', () => {
  it('records source columns without changing identity or amounts, and is a no-op when nothing matches', () => {
    const txn = {
      date: '2026-10-26',
      desc: 'Shop',
      amt: -20,
      type: 'card',
      flow: 'Debit',
      ym: '2026-10',
      cat: 'Shopping',
      sub: '',
      currency: 'EUR',
      ref: 'r1',
    };
    const base = createPersistedAppState({ ...createInitialAppData(), transactions: [txn] });
    const next = appReducer(base, {
      type: 'record_import_sources',
      parsedTransactions: [{ ...txn, amountSource: 'amount', currencySource: 'currency' }],
      getTransactionKey: txKey,
    });
    expect(next.data.transactions[0]).toMatchObject({ ...txn, amountSource: 'amount' });
    expect(txKey(next.data.transactions[0])).toBe(txKey(txn));
    const same = appReducer(next, {
      type: 'record_import_sources',
      parsedTransactions: [],
      getTransactionKey: txKey,
    });
    expect(same).toBe(next);
  });
});

describe('bulk currency correction', () => {
  it('sets, restores, and keeps re-import dedupe working', () => {
    const file = [
      {
        date: '2026-10-01',
        desc: 'A',
        amt: -1,
        type: 'card',
        flow: 'Debit',
        ym: '2026-10',
        cat: 'X',
        sub: '',
        currency: 'RON',
      },
      {
        date: '2026-10-02',
        desc: 'B',
        amt: -2,
        type: 'card',
        flow: 'Debit',
        ym: '2026-10',
        cat: 'X',
        sub: '',
        currency: 'RON',
        ref: 'b',
      },
      {
        date: '2026-10-03',
        desc: 'C',
        amt: -3,
        type: 'card',
        flow: 'Debit',
        ym: '2026-10',
        cat: 'X',
        sub: '',
        currency: 'RON',
      },
    ];
    const base = createPersistedAppState({ ...createInitialAppData(), transactions: file });
    const keys = file.slice(0, 2).map(txKey);
    const set = appReducer(base, {
      type: 'set_transaction_currency',
      transactionKeys: keys,
      currency: 'EUR',
      getTransactionKey: txKey,
    });
    expect(set.data.transactions.map((t) => t.currency)).toEqual(['EUR', 'EUR', 'RON']);
    expect(set.data.transactions.map(txKey)).toEqual(file.map(txKey));
    expect(mergeTransactions(set.data.transactions, file)).toHaveLength(3);

    const restored = appReducer(set, {
      type: 'set_transaction_currency',
      transactionKeys: keys,
      getTransactionKey: txKey,
    });
    expect(restored.data.transactions).toEqual(base.data.transactions);
  });
});
