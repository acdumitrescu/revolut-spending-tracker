import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CircleAlert,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileSearch,
  FileUp,
  History,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { parseCSV } from '../lib/csvParser';
import { ImportReview, NORMALIZED_CSV_TEMPLATE, validateCsvFile } from '../lib/importReview';
import { useAppContext } from '../lib/AppContext';
import { parseImportedAppState } from '../lib/persistence';
import { listEncryptedBackups, loadEncryptedBackup } from '../lib/serverSync';
import { downloadTextFile, exportExcelWorkbook, exportJsonBackup } from '../lib/workspaceExports';
import { useToast } from '../components/Toast';
import { ActionCard, PageHeader, StatusPill } from '../components/ui';

export default function ImportWorkspace() {
  const {
    data,
    persistedState,
    commitTransactionImport,
    createBackupNow,
    importBackup,
    recordVendorObservations,
    runtimeConfig,
    syncStatus,
    undoTransactionImport,
  } = useAppContext();
  const toast = useToast();
  const navigate = useNavigate();
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [summary, setSummary] = useState(data.importMeta?.latestSummary || null);
  const [pendingImport, setPendingImport] = useState(null);
  const [pendingImportBatchId, setPendingImportBatchId] = useState(null);
  const [undoCandidateId, setUndoCandidateId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [latestBackup, setLatestBackup] = useState(null);
  const [encryptedBackups, setEncryptedBackups] = useState([]);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [pendingIsDemo, setPendingIsDemo] = useState(false);
  const privateSyncEnabled = runtimeConfig.privateSyncEnabled;
  const automaticLocalSync = runtimeConfig.privateSyncAutoAuth;
  const isDemoImport = summary?.isDemo === true;
  const hasImportedTransactions = Boolean(summary?.processedRows);
  const shouldShowPersonalBackupReminder = hasImportedTransactions && !isDemoImport;
  const importHistory = data.importMeta?.history || [];
  const importBackupReady = !runtimeConfig.privateBackupEnabled
    || pendingIsDemo
    || syncStatus.phase === 'synced';

  const processCsv = async (file, isDemo = false) => {
    if (!file) return;
    setBusy(true);
    try {
      validateCsvFile(file);
      setPendingIsDemo(isDemo);
      const result = await parseCSV(file, data.customVendors);
      setPendingImport(new ImportReview({
        fileName: file.name,
        parsedResult: result,
        existingTransactions: data.transactions,
      }));
      setPendingImportBatchId(globalThis.crypto?.randomUUID?.()
        || `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    } catch (error) {
      console.error(error);
      toast.error(`Unable to import CSV: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!pendingImport?.canCommit || !importBackupReady) return;
    setBusy(true);
    const { fileName, parsedResult, acceptedTransactions, finalSummary } = pendingImport;

    try {
      const { batchId, backup } = await commitTransactionImport({
        fileName,
        transactions: acceptedTransactions,
        summary: finalSummary,
        batchId: pendingImportBatchId,
        isDemo: pendingIsDemo,
      });
      setSummary({ fileName, batchId, backup, isDemo: pendingIsDemo, ...finalSummary });
      if (backup) setLatestBackup(backup);
      setPendingImport(null);
      setPendingImportBatchId(null);
      toast.success(
        pendingIsDemo
          ? `${finalSummary.processedRows} demo transactions added locally.`
          : `${finalSummary.processedRows} transactions added${backup ? ' and backed up' : ' locally'}. ${finalSummary.duplicateRows} duplicates were excluded.`
      );

      try {
        await recordVendorObservations(parsedResult.vendorObservations);
      } catch (error) {
        console.warn('Transactions were added, but vendor observations could not be recorded.', error);
        toast.warning('Transactions were added, but vendor-learning notes could not be synced.');
      }
    } catch (error) {
      console.error(error);
      toast.error(`Unable to complete import: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmUndoImport = (entry) => {
    undoTransactionImport(entry.batchId);
    if (summary?.batchId === entry.batchId) setSummary(null);
    setUndoCandidateId(null);
    toast.info(`${entry.processedRows} imported transactions removed. The history record was kept.`);
  };

  const handleCsvUpload = async (event) => {
    await processCsv(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDemo = async () => {
    setBusy(true);
    try {
      const response = await fetch('/demo-revolut.csv');
      if (!response.ok) throw new Error('Demo file is unavailable.');
      const file = new File([await response.blob()], 'demo-revolut.csv', { type: 'text/csv' });
      await processCsv(file, true);
    } catch (error) {
      console.error(error);
      toast.error(error.message);
      setBusy(false);
    }
  };

  const handleRestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseImportedAppState(await file.text());
      setPendingRestore({ fileName: file.name, state: parsed });
    } catch (error) {
      console.error(error);
      toast.error('Invalid or unsupported backup. Nothing was replaced.');
    }
    event.target.value = '';
  };

  const confirmRestore = async () => {
    if (!pendingRestore || busy) return;
    setBusy(true);
    try {
      if (runtimeConfig.privateBackupEnabled) {
        if (syncStatus.phase !== 'synced') throw new Error('Wait for private sync before restoring.');
        setLatestBackup(await createBackupNow());
      } else {
        // Keep a portable recovery copy before replacing a browser-only workspace.
        exportJsonBackup(persistedState);
      }
      await importBackup(pendingRestore.state.data, persistedState.data.lastUpdated);
      setPendingRestore(null);
      toast.success('Backup restored. A recovery copy of the previous workspace was saved.');
      navigate('/app');
    } catch (error) {
      toast.error(`Restore stopped: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExcel = async () => {
    try {
      await exportExcelWorkbook(data);
      toast.info('Excel workbook exported. Keep it in a private local folder.');
    } catch (error) {
      console.error(error);
      toast.error('Unable to export the Excel workbook.');
    }
  };

  const handleCreateBackup = async () => {
    setBusy(true);
    try {
      const backup = await createBackupNow();
      setLatestBackup(backup);
      toast.success(`Private backup created: ${backup.filename}`);
    } catch (error) {
      console.error(error);
      toast.error(`Unable to create private backup: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    downloadTextFile(NORMALIZED_CSV_TEMPLATE, 'simple-safe-banking-normalized-template.csv', 'text/csv;charset=utf-8');
  };

  const downloadReviewReport = () => {
    downloadTextFile(pendingImport.toRejectedCsv(), pendingImport.reportFilename, 'text/csv;charset=utf-8');
  };

  return (
    <div className="page-stack import-workspace">
      <PageHeader
        eyebrow="Private workspace"
        title="Bring your financial history into focus"
        description={privateSyncEnabled
          ? (automaticLocalSync
            ? 'CSV parsing happens locally. Confirmed app state is copied automatically to your private server.'
            : 'CSV parsing happens locally in this browser. After you unlock private sync, confirmed app state is copied to your private server.')
          : 'Import is processed locally in this browser. Start with your Revolut CSV, explore synthetic demo data, or restore a private backup.'}
        actions={<StatusPill tone="success"><ShieldCheck size={14} /> Local processing</StatusPill>}
      />

      <input ref={csvInputRef} className="visually-hidden" type="file" accept=".csv" onChange={handleCsvUpload} />
      <input ref={jsonInputRef} className="visually-hidden" type="file" accept=".json" onChange={handleRestore} />
      {pendingRestore && <section className="import-review-panel" aria-label="Review backup restoration">
        <h2>Replace this workspace with {pendingRestore.fileName}?</h2>
        <p>This replaces—not merges—your data. A recovery copy will be saved first.</p>
        <ul>
          {['transactions', 'accounts', 'goals', 'portfolioHoldings'].map((key) => <li key={key}>{key}: {pendingRestore.state.data[key].length}</li>)}
          <li>budget months: {Object.keys(pendingRestore.state.data.budgets).length}</li>
          <li>import history: {pendingRestore.state.data.importMeta.history.length}</li>
          <li>credit records: {pendingRestore.state.data.creditRecords.length}</li>
        </ul>
        <button className="btn" disabled={busy} onClick={() => setPendingRestore(null)}>Cancel restore</button>
        <button className="btn btn-primary" disabled={busy || (runtimeConfig.privateBackupEnabled && syncStatus.phase !== 'synced')} onClick={confirmRestore}>Back up current data and replace workspace</button>
      </section>}

      <section className="import-primary-panel">
        <div className="import-primary-copy">
          <span className="step-marker">Recommended</span>
          <h2>Import a Revolut CSV</h2>
          <p>Personal, Business transaction statement, Business expense, and normalized CSV profiles are supported. {privateSyncEnabled
            ? (automaticLocalSync
              ? 'CSV parsing stays in this browser; the resulting app state is copied automatically to your local private server.'
              : 'CSV parsing stays in this browser; after private sync is unlocked, the resulting app state is copied to your configured private server.')
            : 'In this public demo, uploaded CSVs stay in this browser on this device and are not saved to an account or public server.'}</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => csvInputRef.current?.click()}>
            <FileUp size={17} /> {busy ? 'Processing…' : 'Choose CSV file'}
          </button>
        </div>
        <div className="privacy-proof">
          <ShieldCheck size={24} />
          <strong>No bank connection or public upload required</strong>
          <span>{runtimeConfig.encryptedStorage ? 'CSV parsing stays in browser memory. Confirmed data is saved to your encrypted local database, not browser storage.' : privateSyncEnabled
            ? (automaticLocalSync
              ? 'The file is parsed in this app. Confirmed data is stored in this browser and copied through the trusted local sync proxy.'
              : 'The file is parsed in this app. Confirmed data is stored in this browser and copied to your private server only after sync is unlocked.')
            : 'The file is parsed in this app and stored in this browser. If you import personal data, export a JSON backup before leaving.'}</span>
        </div>
      </section>

      <section className="demo-privacy-note" aria-label={privateSyncEnabled ? 'How private sync handles data' : 'How this public demo handles data'}>
        <strong>{privateSyncEnabled ? 'How private sync handles data' : 'How this public demo handles data'}</strong>
        <p>{runtimeConfig.encryptedStorage ? 'The encrypted database is the source of truth. This browser keeps the loaded workspace in memory only. Confirmed real imports receive an encrypted backup before commitment.' : privateSyncEnabled
          ? (automaticLocalSync
            ? 'CSV contents are parsed locally. Confirmed app state remains in browser storage and is also copied automatically to your single-tenant local server.'
            : 'CSV contents are parsed locally. Confirmed app state remains in browser storage and is also copied to your single-tenant private server after you unlock sync for this tab.')
          : 'Try the synthetic sample safely, or upload your own CSV for a local-only session. Nothing from a CSV import is stored on our server in this demo, and browser data can disappear later if you clear storage, use private browsing, or switch devices.'}</p>
      </section>

      <div className="workspace-action-grid">
        <ActionCard icon={Sparkles} title="Try synthetic demo data" description="Explore the full dashboard without using personal records." action={handleDemo} />
        <ActionCard icon={DatabaseBackup} title="Restore private backup" description="Load a versioned SimpleSafeBanking JSON backup." action={() => jsonInputRef.current?.click()} />
        <ActionCard icon={Download} title="Download CSV template" description="Start from the supported normalized format and replace the example row." action={downloadTemplate} />
      </div>

      {pendingImport && (
        <section className="import-review-panel" aria-live="polite">
          <div className="import-review-heading">
            <span><FileSearch size={20} /></span>
            <div>
              <div className="eyebrow">Review before adding</div>
              <h2>{pendingImport.fileName}</h2>
              <p>{pendingImport.parsedResult.summary.detectedProfileLabel}</p>
            </div>
          </div>

          <div className="import-summary-stats">
            <div><span>Ready to add</span><strong>{pendingImport.counts.ready}</strong></div>
            <div><span>Duplicates</span><strong>{pendingImport.counts.duplicates}</strong></div>
            <div><span>Invalid</span><strong>{pendingImport.counts.invalid}</strong></div>
            <div><span>Rows read</span><strong>{pendingImport.counts.total}</strong></div>
          </div>

          {pendingImport.analysis.duplicateCount > 0 && (
            <div className="import-review-details">
              <strong><CircleAlert size={14} /> Duplicates will not be added</strong>
              <span>
                {pendingImport.analysis.existingDuplicateCount} already in the app · {pendingImport.analysis.fileDuplicateCount} repeated within this file
              </span>
              <ul>
                {pendingImport.analysis.duplicateTransactions.slice(0, 4).map(({ transaction, duplicateSource }, index) => (
                  <li key={`${transaction.date}-${transaction.ref || transaction.desc}-${index}`}>
                    <span>{transaction.date} · {transaction.desc}</span>
                    <small>{duplicateSource === 'existing' ? 'Already imported' : 'Repeated in file'}</small>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingImport.counts.invalid > 0 && (
            <div className="import-review-details">
              <strong><CircleAlert size={14} /> Invalid rows will be skipped</strong>
              <ul>
                {Object.entries(pendingImport.parsedResult.summary.skippedReasonCounts).map(([reason, count]) => (
                  <li key={reason}><span>{reason}</span><small>{count} row{count === 1 ? '' : 's'}</small></li>
                ))}
              </ul>
            </div>
          )}

          {pendingImport.parsedResult.summary.warnings?.length > 0 && (
            <div className="import-warning-list">
              <strong>Parser notes</strong>
              {pendingImport.parsedResult.summary.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          )}

          {pendingImport.rejectedRows.length > 0 && (
            <details className="import-rejection-details">
              <summary>View rejected rows ({pendingImport.rejectedRows.length})</summary>
              <ul>
                {pendingImport.rejectedRows.slice(0, 50).map((row, index) => (
                  <li key={`${row.status}-${row.row || row.date}-${index}`}>
                    <span>{row.row ? `Row ${row.row}` : `${row.date} · ${row.description}`}</span>
                    <small>{row.reason}</small>
                  </li>
                ))}
              </ul>
              {pendingImport.rejectedRows.length > 50 && <p>Showing the first 50 rows. The report includes all rejected rows.</p>}
            </details>
          )}

          <div className="import-review-actions">
            {pendingImport.rejectedRows.length > 0 && (
              <button className="btn" type="button" disabled={busy} onClick={downloadReviewReport}>
                <Download size={16} /> Download review report
              </button>
            )}
            <button className="btn" type="button" disabled={busy} onClick={() => {
              setPendingImport(null);
              setPendingImportBatchId(null);
            }}>Cancel</button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !pendingImport.canCommit || !importBackupReady}
              onClick={confirmImport}
            >
              <FileCheck2 size={16} />
              {!importBackupReady
                ? 'Waiting for private sync…'
                : pendingImport.canCommit
                ? `Add ${pendingImport.counts.ready} transaction${pendingImport.counts.ready === 1 ? '' : 's'}`
                : 'No new transactions'}
            </button>
          </div>
        </section>
      )}

      {!pendingImport && summary && (
        <section className="import-success-panel" aria-live="polite">
          <div className="import-success-heading">
            <span><FileCheck2 size={20} /></span>
            <div>
              <div className="eyebrow">Import complete</div>
              <h2>{summary.processedRows} transactions added</h2>
              <p>{summary.detectedProfileLabel}{summary.fileName ? ` · ${summary.fileName}` : ''}</p>
            </div>
          </div>
          <div className="import-summary-stats">
            <div><span>Added</span><strong>{summary.processedRows}</strong></div>
            <div><span>Duplicates</span><strong>{summary.duplicateRows || 0}</strong></div>
            <div><span>Invalid</span><strong>{summary.skippedRows}</strong></div>
            <div><span>Rows read</span><strong>{summary.totalRows}</strong></div>
          </div>
          {summary.warnings?.length > 0 && (
            <div className="import-warning-list">
              <strong>Review notes</strong>
              {summary.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          )}
          {shouldShowPersonalBackupReminder && (
            <div className="import-local-reminder">
              <strong>Imported your own CSV?</strong>
              <span>{runtimeConfig.encryptedStorage ? 'Your data is saved to the encrypted local database. Use Create backup now for an encrypted recovery copy. JSON downloads are not encrypted.' : privateSyncEnabled
                ? (summary.backup
                  ? `A restorable server backup was created as ${summary.backup.filename}. You can also keep a downloaded JSON copy.`
                  : 'Your confirmed app state is copied to your private server after sync is unlocked. Keep an offline JSON backup as an independent recovery copy.')
                : 'This demo keeps your data only in this browser. Export a JSON backup before leaving so you do not lose access later.'}</span>
            </div>
          )}
          <button className="btn btn-primary" type="button" onClick={() => navigate('/app')}>
            Continue to overview <ArrowRight size={16} />
          </button>
        </section>
      )}

      {importHistory.length > 0 && (
        <section className="import-history-section" aria-labelledby="import-history-title">
          <div className="import-history-heading">
            <div>
              <div className="eyebrow">Import history</div>
              <h2 id="import-history-title">Recent confirmed imports</h2>
              <p>Undo removes only transactions added by that import. The audit record remains visible.</p>
            </div>
            <History size={20} />
          </div>
          <div className="import-history-list">
            {importHistory.map((entry) => (
              <article className="import-history-item" key={entry.batchId}>
                <div>
                  <strong>{entry.fileName || 'CSV import'}</strong>
                  <span>
                    {entry.detectedProfileLabel} · {new Date(entry.importedAt).toLocaleString()}
                  </span>
                  <small>
                    {entry.processedRows} added · {entry.duplicateRows || 0} duplicates · {entry.skippedRows} invalid
                  </small>
                </div>
                {entry.status === 'active' ? (
                  undoCandidateId === entry.batchId ? (
                    <div className="import-undo-confirm" role="group" aria-label={`Confirm undo for ${entry.fileName || 'CSV import'}`}>
                      <span>Remove {entry.processedRows} transaction{entry.processedRows === 1 ? '' : 's'}?</span>
                      <div>
                        <button className="btn" type="button" onClick={() => setUndoCandidateId(null)}>Keep import</button>
                        <button className="btn import-undo-button" type="button" onClick={() => confirmUndoImport(entry)}>
                          <RotateCcw size={14} /> Confirm undo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn import-undo-button" type="button" onClick={() => setUndoCandidateId(entry.batchId)}>
                      <RotateCcw size={14} /> Undo import
                    </button>
                  )
                ) : (
                  <span className="import-history-status">Undone</span>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="backup-section">
        <div>
          <div className="eyebrow">Portable backups</div>
          <h2>Your data should remain easy to leave with.</h2>
          <p>{shouldShowPersonalBackupReminder
            ? (privateSyncEnabled
              ? 'You imported personal data into a private-sync workspace. Keep an offline JSON backup as an independent recovery copy.'
              : 'You imported personal data into a browser-local demo. Export a JSON backup before leaving and store it in a private local folder.')
            : 'Export after important changes and store generated files outside tracked project folders.'}</p>
        </div>
        <div className="backup-actions">
          {runtimeConfig.privateBackupEnabled && (
            <button className="btn btn-primary" type="button" disabled={busy || syncStatus.phase !== 'synced'} onClick={handleCreateBackup}>
              <DatabaseBackup size={16} /> {busy ? 'Creating…' : 'Create backup now'}
            </button>
          )}
          <button className="btn" type="button" onClick={() => exportJsonBackup(persistedState)}>
            <Download size={16} /> Export JSON
          </button>
          <button className="btn" type="button" onClick={handleExcel}>
            <Download size={16} /> Export Excel
          </button>
        </div>
        {runtimeConfig.encryptedStorage && <div className="card"><h3>Encrypted database backups</h3><p>These backups stay encrypted on disk. Preview one to restore it; your current workspace is backed up before replacement.</p><button className="btn" disabled={busy || syncStatus.phase !== 'synced'} onClick={async () => {
          try { setEncryptedBackups((await listEncryptedBackups()).filenames); } catch { toast.error('Unable to list encrypted backups.'); }
        }}>Show encrypted backups</button>{encryptedBackups.map((filename) => <p key={filename}><button className="btn" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const backup = await loadEncryptedBackup(filename); setPendingRestore({fileName:filename,state:parseImportedAppState(JSON.stringify(backup.data))}); } catch { toast.error('Backup could not be authenticated or validated.'); } finally { setBusy(false); }
        }}>Preview {filename}</button></p>)}<p>Downloaded JSON/XLSX exports and older browser copies are not encrypted. Keep them private.</p></div>}
        {latestBackup && (
          <p className="section-note" role="status">
            Saved {latestBackup.filename} at {new Date(latestBackup.createdAt).toLocaleString()} in {runtimeConfig.localUsers ? 'this user’s private backup folder' : 'backups/automatic/' }.
          </p>
        )}
      </section>
    </div>
  );
}
