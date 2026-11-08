import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createPrivateBackupMock } = vi.hoisted(() => ({
  createPrivateBackupMock: vi.fn(),
}));

vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: {
    deploymentProfile: 'private-sync',
    privateSyncEnabled: false,
    privateSyncAutoAuth: false,
    privateBackupEnabled: true,
    apiBasePath: '/api',
    fxRefreshEnabled: false,
  },
}));

vi.mock('../lib/serverSync', async (importOriginal) => ({
  ...(await importOriginal()),
  createPrivateBackup: createPrivateBackupMock,
}));

import { AppProvider, useAppContext } from '../lib/AppContext';
import { createPersistedAppState } from '../lib/appState';
import { parseBrdStatement } from '../lib/brdStatement';

function BrdHarness() {
  const [done, setDone] = useState(false);
  const { data, commitBrdStatement } = useAppContext();
  const run = async () => {
    try {
      const statement = await parseBrdStatement('Date of Transaction,Merchant/Beneficiary Name,Transaction details,Amount,Currency,Transaction type,Status\n2026-10-01,Synthetic shop,POS,10,RON,DBIT,PROCESSED');
      await commitBrdStatement({ statement, accountId:'brd', ownRecipients:[], fileName:'synthetic-brd.csv', importedAt:1, balanceConfirmation:{date:'2026-10-06',amountMinor:123456} });
    } catch { /* Inspect state after the expected backup failure. */ }
    finally { setDone(true); }
  };
  return <><button onClick={run}>BRD import</button>{done && <span>BRD finished</span>}<output data-testid="brd-state">{JSON.stringify(data)}</output></>;
}

const transaction = {
  date: '2026-09-01',
  desc: 'Synthetic test',
  cat: 'Other',
  sub: '',
  amt: -10,
  flow: 'Debit',
  type: 'Card Payment',
  ym: '2026-09',
  currency: 'RON',
};

const summary = {
  detectedProfileId: 'normalized-csv',
  detectedProfileLabel: 'Normalized CSV',
  totalRows: 1,
  processedRows: 1,
  skippedRows: 0,
  duplicateRows: 0,
  existingDuplicateRows: 0,
  fileDuplicateRows: 0,
  warnings: [],
  skippedReasonCounts: {},
  skippedDetails: [],
  validationCategories: {},
  unknownVendorCount: 0,
};

function ImportHarness() {
  const { data, commitTransactionImport } = useAppContext();
  const run = async (fileName, isDemo = false) => {
    try {
      await commitTransactionImport({ fileName, transactions: [transaction], summary, isDemo });
    } catch {
      // The rendered count proves a failed backup did not commit.
    }
  };

  return (
    <div>
      <button type="button" onClick={() => run('real.csv')}>Real import</button>
      <button type="button" onClick={() => run('demo-revolut.csv', true)}>Demo import</button>
      <button type="button" onClick={() => run('demo-revolut.csv')}>Real file with demo name</button>
      <span data-testid="transaction-count">{data.transactions.length}</span>
    </div>
  );
}

afterEach(() => {
  createPrivateBackupMock.mockReset();
  window.localStorage.clear();
});

describe('AppContext import backups', () => {
  it.each([1, 2])('leaves BRD balances and activity unchanged if backup %s fails', async (failedCall) => {
    const state=createPersistedAppState();state.data.accounts=[{id:'brd',name:'BRD',currency:'RON',balances:{'2026-09':99},notes:{}}];
    window.localStorage.getItem.mockReturnValue(JSON.stringify(state));
    if (failedCall === 2) createPrivateBackupMock.mockResolvedValueOnce({filename:'recovery.ssbdb'});
    createPrivateBackupMock.mockRejectedValue(new Error('disk full'));
    render(<AppProvider><BrdHarness /></AppProvider>);
    await act(async()=>{fireEvent.click(screen.getByText('BRD import'));});
    await screen.findByText('BRD finished');
    const result=JSON.parse(screen.getByTestId('brd-state').textContent);
    expect(result.moneyFlow.brd).toBeUndefined();expect(result.accounts[0].balances).toEqual({'2026-09':99});
  });
  it('backs up old and next BRD states before atomically committing the ledger and confirmed balance', async () => {
    const state=createPersistedAppState();state.data.accounts=[{id:'brd',name:'BRD',currency:'RON',balances:{},notes:{}}];
    window.localStorage.getItem.mockReturnValue(JSON.stringify(state));
    createPrivateBackupMock.mockResolvedValue({filename:'synthetic.ssbdb'});
    render(<AppProvider><BrdHarness /></AppProvider>);
    await act(async()=>{fireEvent.click(screen.getByText('BRD import'));});
    await screen.findByText('BRD finished');
    expect(createPrivateBackupMock.mock.calls.map(call=>call[1])).toEqual(['recovery','import']);
    expect(createPrivateBackupMock.mock.calls[0][0].data.moneyFlow.brd).toBeUndefined();
    expect(createPrivateBackupMock.mock.calls[1][0].data.moneyFlow.brd.rows).toHaveLength(1);
    const result=JSON.parse(screen.getByTestId('brd-state').textContent);
    expect(result.accounts[0].balances['2026-10']).toBe(1234.56);expect(result.moneyFlow.brd.rows).toHaveLength(1);
  });
  it('does not trust an uploaded filename to bypass backups', async () => {
    createPrivateBackupMock.mockResolvedValue({ filename: 'backup.json', reason: 'import' });
    render(<AppProvider><ImportHarness /></AppProvider>);
    await act(async () => { fireEvent.click(screen.getByText('Real file with demo name')); });
    expect(createPrivateBackupMock).toHaveBeenCalledTimes(1);
  });
  it('backs up the complete next state before committing a real import', async () => {
    createPrivateBackupMock.mockResolvedValue({ filename: 'backup.json', reason: 'import' });
    render(<AppProvider><ImportHarness /></AppProvider>);

    await act(async () => {
      fireEvent.click(screen.getByText('Real import'));
    });

    await waitFor(() => expect(screen.getByTestId('transaction-count')).toHaveTextContent('1'));
    expect(createPrivateBackupMock).toHaveBeenCalledTimes(1);
    const [nextState, reason, batchId] = createPrivateBackupMock.mock.calls[0];
    expect(reason).toBe('import');
    expect(batchId).toEqual(expect.any(String));
    expect(nextState.data.transactions).toHaveLength(1);
    expect(nextState.data.transactions[0].importBatchId).toBe(batchId);
    expect(nextState.data.importMeta.history[0].batchId).toBe(batchId);
  });

  it('does not commit when the required backup fails', async () => {
    createPrivateBackupMock.mockRejectedValue(new Error('disk full'));
    render(<AppProvider><ImportHarness /></AppProvider>);

    await act(async () => {
      fireEvent.click(screen.getByText('Real import'));
    });

    expect(screen.getByTestId('transaction-count')).toHaveTextContent('0');
  });

  it('does not create an automatic backup for synthetic demo imports', async () => {
    render(<AppProvider><ImportHarness /></AppProvider>);

    await act(async () => {
      fireEvent.click(screen.getByText('Demo import'));
    });

    await waitFor(() => expect(screen.getByTestId('transaction-count')).toHaveTextContent('1'));
    expect(createPrivateBackupMock).not.toHaveBeenCalled();
  });
});
