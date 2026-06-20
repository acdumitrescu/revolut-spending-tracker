import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileUp,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { mergeTransactions, parseCSV } from '../lib/csvParser';
import { useAppContext } from '../lib/AppContext';
import { parseImportedAppState } from '../lib/persistence';
import { exportExcelWorkbook, exportJsonBackup } from '../lib/workspaceExports';
import { useToast } from '../components/Toast';
import { ActionCard, PageHeader, StatusPill } from '../components/ui';

export default function ImportWorkspace() {
  const {
    data,
    persistedState,
    addTransactions,
    importBackup,
    recordImportSummary,
    recordVendorObservations,
  } = useAppContext();
  const toast = useToast();
  const navigate = useNavigate();
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [summary, setSummary] = useState(data.importMeta?.latestSummary || null);
  const [busy, setBusy] = useState(false);
  const isDemoImport = summary?.fileName === 'demo-revolut.csv';
  const hasImportedTransactions = Boolean(summary?.processedRows);
  const shouldShowPersonalBackupReminder = hasImportedTransactions && !isDemoImport;

  const processCsv = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await parseCSV(file, data.customVendors);
      const merged = mergeTransactions(data.transactions, result.transactions);
      addTransactions(merged);
      recordImportSummary(file.name, result.summary);
      await recordVendorObservations(result.vendorObservations);
      setSummary({ fileName: file.name, ...result.summary });
      toast.success(
        file.name === 'demo-revolut.csv'
          ? `${result.summary.processedRows} demo transactions processed locally.`
          : `${result.summary.processedRows} transactions processed locally. Export a backup before leaving if you want to keep this browser-local data.`
      );
    } catch (error) {
      console.error(error);
      toast.error(`Unable to import CSV: ${error.message}`);
    } finally {
      setBusy(false);
    }
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
      await processCsv(file);
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
      importBackup(parsed.data);
      toast.success('Private backup restored successfully.');
      navigate('/app');
    } catch (error) {
      console.error(error);
      toast.error('Unable to restore this backup JSON.');
    }
    event.target.value = '';
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

  return (
    <div className="page-stack import-workspace">
      <PageHeader
        eyebrow="Private workspace"
        title="Bring your financial history into focus"
        description="Import is processed locally in this browser. Start with your Revolut CSV, explore synthetic demo data, or restore a private backup."
        actions={<StatusPill tone="success"><ShieldCheck size={14} /> Local processing</StatusPill>}
      />

      <input ref={csvInputRef} className="visually-hidden" type="file" accept=".csv" onChange={handleCsvUpload} />
      <input ref={jsonInputRef} className="visually-hidden" type="file" accept=".json" onChange={handleRestore} />

      <section className="import-primary-panel">
        <div className="import-primary-copy">
          <span className="step-marker">Recommended</span>
          <h2>Import a Revolut CSV</h2>
          <p>Personal, Business transaction statement, Business expense, and normalized CSV profiles are supported. In this public demo, uploaded CSVs stay in this browser on this device and are not saved to an account or public server.</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => csvInputRef.current?.click()}>
            <FileUp size={17} /> {busy ? 'Processing…' : 'Choose CSV file'}
          </button>
        </div>
        <div className="privacy-proof">
          <ShieldCheck size={24} />
          <strong>No bank connection or public upload required</strong>
          <span>The file is parsed in this app and stored in this browser. If you import personal data, export a JSON backup before leaving.</span>
        </div>
      </section>

      <section className="demo-privacy-note" aria-label="How this public demo handles data">
        <strong>How this public demo handles data</strong>
        <p>Try the synthetic sample safely, or upload your own CSV for a local-only session. Nothing from a CSV import is stored on our server in this demo, and browser data can disappear later if you clear storage, use private browsing, or switch devices.</p>
      </section>

      <div className="workspace-action-grid">
        <ActionCard icon={Sparkles} title="Try synthetic demo data" description="Explore the full dashboard without using personal records." action={handleDemo} />
        <ActionCard icon={DatabaseBackup} title="Restore private backup" description="Load a versioned SimpleSafeBanking JSON backup." action={() => jsonInputRef.current?.click()} />
      </div>

      {summary && (
        <section className="import-success-panel" aria-live="polite">
          <div className="import-success-heading">
            <span><FileCheck2 size={20} /></span>
            <div>
              <div className="eyebrow">Import complete</div>
              <h2>{summary.processedRows} transactions are ready</h2>
              <p>{summary.detectedProfileLabel}{summary.fileName ? ` · ${summary.fileName}` : ''}</p>
            </div>
          </div>
          <div className="import-summary-stats">
            <div><span>Processed</span><strong>{summary.processedRows}</strong></div>
            <div><span>Skipped</span><strong>{summary.skippedRows}</strong></div>
            <div><span>Rows read</span><strong>{summary.totalRows}</strong></div>
            <div><span>Unknown</span><strong>{summary.unknownVendorCount || 0}</strong></div>
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
              <span>This demo keeps your data only in this browser. Export a JSON backup before leaving so you do not lose access later.</span>
            </div>
          )}
          <button className="btn btn-primary" type="button" onClick={() => navigate('/app')}>
            Continue to overview <ArrowRight size={16} />
          </button>
        </section>
      )}

      <section className="backup-section">
        <div>
          <div className="eyebrow">Portable backups</div>
          <h2>Your data should remain easy to leave with.</h2>
          <p>{shouldShowPersonalBackupReminder ? 'You imported personal data into a browser-local demo. Export a JSON backup before leaving and store it in a private local folder.' : 'Export after important changes and store generated files outside tracked project folders.'}</p>
        </div>
        <div className="backup-actions">
          <button className="btn" type="button" disabled={!data.transactions.length} onClick={() => exportJsonBackup(persistedState)}>
            <Download size={16} /> Export JSON
          </button>
          <button className="btn" type="button" disabled={!data.transactions.length} onClick={handleExcel}>
            <Download size={16} /> Export Excel
          </button>
        </div>
      </section>
    </div>
  );
}
