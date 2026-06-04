import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, FolderTree, Store, List, Wallet, Upload, Download, Trash2, TrendingUp, PiggyBank, Flame, Target, Repeat, DatabaseBackup, RefreshCw, Settings2, Save } from 'lucide-react';
import ExcelJS from 'exceljs';
import { parseCSV, mergeTransactions } from '../lib/csvParser';
import { useAppContext } from '../lib/AppContext';
import { BASE_CURRENCY } from '../lib/fx';
import { SUPPORTED_DISPLAY_CURRENCIES } from '../lib/utils';
import { useToast } from './Toast';
import { FreshnessIndicator } from './FreshnessIndicator';
import MixedCurrencyNotice from './MixedCurrencyNotice';

export default function Layout() {
  const { data, addTransactions, importBackup, clearData, setDisplayCurrency, setFxRates, refreshFxRates, currencySummary } = useAppContext();
  const toast = useToast();
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);
  const [showFxPanel, setShowFxPanel] = useState(false);
  const [manualRates, setManualRates] = useState({
    EUR: String(data.fxRates?.EUR || ''),
    USD: String(data.fxRates?.USD || ''),
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseCSV(file, data.customVendors);
      const newTxns = result.transactions;
      const summary = result.summary;
      
      const merged = mergeTransactions(data.transactions, newTxns);
      addTransactions(merged);
      
      let msg = `Processed ${summary.processedRows} transactions.`;
      if (summary.skippedRows > 0) {
        msg += ` Skipped ${summary.skippedRows} rows.`;
      }
      msg += ` Total: ${merged.length}.`;
      toast.success(msg);
    } catch (err) {
      console.error(err);
      toast.error('Error parsing CSV: ' + err.message);
    }
    
    e.target.value = '';
  };

  const handleJsonRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      importBackup(parsed);
      toast.success('Backup restored successfully.');
    } catch (err) {
      console.error(err);
      toast.error('Unable to restore backup JSON.');
    }

    e.target.value = '';
  };

  const hasData = data.transactions.length > 0;

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `simple_safe_banking_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportWorkbook = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SimpleSafeBanking';
      workbook.created = new Date();

      const transactionSheet = workbook.addWorksheet('Transactions');
      transactionSheet.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Description', key: 'desc', width: 28 },
        { header: 'Category', key: 'cat', width: 18 },
        { header: 'Subcategory', key: 'sub', width: 18 },
        { header: 'Amount', key: 'amt', width: 12 },
        { header: 'Flow', key: 'flow', width: 12 },
        { header: 'Type', key: 'type', width: 18 },
        { header: 'YearMonth', key: 'ym', width: 12 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'Reference', key: 'ref', width: 20 },
        { header: 'Source', key: 'source', width: 12 },
      ];
      data.transactions.forEach((txn) => transactionSheet.addRow(txn));

      const accountsSheet = workbook.addWorksheet('Accounts');
      const accountMonths = [...new Set(data.accounts.flatMap((acc) => Object.keys(acc.balances)))].sort();
      accountsSheet.columns = [
        { header: 'Account', key: 'name', width: 24 },
        { header: 'Currency', key: 'currency', width: 12 },
        { header: 'MonthlyContribution', key: 'monthlyContribution', width: 18 },
        ...accountMonths.map((month) => ({ header: month, key: month, width: 14 })),
      ];
      data.accounts.forEach((acc) => {
        accountsSheet.addRow({
          name: acc.name,
          currency: acc.currency || BASE_CURRENCY,
          monthlyContribution: acc.monthlyContribution,
          ...acc.balances,
        });
      });

      const vendorSheet = workbook.addWorksheet('Custom Vendors');
      vendorSheet.columns = [
        { header: 'Vendor', key: 'vendor', width: 24 },
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Subcategory', key: 'subcategory', width: 18 },
      ];
      Object.entries(data.customVendors).forEach(([vendor, [category, subcategory]]) => {
        vendorSheet.addRow({ vendor, category, subcategory });
      });

      const settingsSheet = workbook.addWorksheet('Settings');
      settingsSheet.columns = [
        { header: 'Key', key: 'key', width: 20 },
        { header: 'Value', key: 'value', width: 26 },
      ];
      settingsSheet.addRows([
        { key: 'BaseCurrency', value: data.baseCurrency },
        { key: 'DisplayCurrency', value: data.displayCurrency },
        { key: 'RonPerEur', value: data.fxRates?.EUR },
        { key: 'RonPerUsd', value: data.fxRates?.USD },
        { key: 'FxUpdatedAt', value: data.fxUpdatedAt ? new Date(data.fxUpdatedAt).toISOString() : '' },
        { key: 'FxSource', value: data.fxSource || '' },
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `simple_safe_banking_backup_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('Unable to export Excel workbook.');
    }
  };

  const handleSaveRates = () => {
    const nextRates = {
      EUR: Number(manualRates.EUR),
      USD: Number(manualRates.USD),
    };

    if (!Number.isFinite(nextRates.EUR) || nextRates.EUR <= 0 || !Number.isFinite(nextRates.USD) || nextRates.USD <= 0) {
      toast.error('Enter valid positive EUR and USD rates.');
      return;
    }

    setFxRates(nextRates, 'manual');
    toast.success('FX rates saved locally.');
  };

  const handleRefreshRates = async () => {
    try {
      const refreshed = await refreshFxRates();
      setManualRates({
        EUR: String(refreshed.fxRates.EUR),
        USD: String(refreshed.fxRates.USD),
      });
      toast.success('FX rates refreshed from Frankfurter.');
    } catch (error) {
      console.error(error);
      toast.warning('Could not refresh FX rates. Keeping your saved local values.');
    }
  };

  const fxUpdatedLabel = data.fxUpdatedAt
    ? new Date(data.fxUpdatedAt).toLocaleString()
    : 'Not refreshed yet';

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* Sidebar */}
      <aside className="app-sidebar" style={{ width: '240px', background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold', letterSpacing: '0.05em', color: 'var(--accent)' }}>SimpleSafeBanking</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>Local-first finance tracking for Revolut users</div>
        </div>

        <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', padding: '10px 12px 6px', letterSpacing: '0.08em' }}>Views</div>
          
          <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Overview" />
          <NavItem to="/monthly" icon={<CalendarDays size={18} />} label="Monthly" />
          <NavItem to="/categories" icon={<FolderTree size={18} />} label="Categories" />
          <NavItem to="/vendors" icon={<Store size={18} />} label="Vendors" />
          <NavItem to="/transactions" icon={<List size={18} />} label="Transactions" />
          <NavItem to="/accounts" icon={<Wallet size={18} />} label="Accounts" />
          <NavItem to="/budget" icon={<PiggyBank size={18} />} label="Budget" />
          <NavItem to="/heatmap" icon={<Flame size={18} />} label="Heatmap" />
          <NavItem to="/forecast" icon={<TrendingUp size={18} />} label="Forecast" />
          <NavItem to="/goals" icon={<Target size={18} />} label="Goals" />
          <NavItem to="/recurring" icon={<Repeat size={18} />} label="Recurring" />
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="dz" onClick={() => csvInputRef.current?.click()}>
            <Upload size={20} style={{ marginBottom: '4px' }} />
            <div className="dz-lbl">Import Revolut CSV</div>
            <div className="dz-hint">Supported raw or normalized exports</div>
            <input 
              type="file" 
              ref={csvInputRef} 
              style={{ display: 'none' }} 
              accept=".csv"
              onChange={handleFileUpload} 
            />
          </div>

          <button className="btn" onClick={() => jsonInputRef.current?.click()} style={{ width: '100%', fontSize: '12px' }}>
            <DatabaseBackup size={14} /> Restore Backup JSON
          </button>
          <input
            type="file"
            ref={jsonInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleJsonRestore}
          />

          {!hasData && (
            <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5 }}>
              Your data stays in this browser via localStorage. Export JSON for personal backups or XLSX for spreadsheet review.
            </div>
          )}

          {hasData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn" onClick={handleExportJSON} style={{ flex: 1, borderColor: 'var(--border)', fontSize: '12px' }}>
                  <Download size={14} /> JSON
                </button>
                <button className="btn" onClick={handleExportWorkbook} style={{ flex: 1, borderColor: 'var(--border)', fontSize: '12px' }}>
                  <Download size={14} /> Excel
                </button>
              </div>
              <button className="btn" onClick={() => {
                if (window.confirm('Are you sure? This will permanently delete all your data.')) {
                  clearData();
                  toast.warning('All data has been cleared.');
                }
              }} style={{ width: '100%', color: 'var(--red)', borderColor: 'var(--border)', fontSize: '12px' }}>
                <Trash2 size={14} /> Clear Data
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ minHeight: '60px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '10px 24px' }}>
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Base currency: <strong style={{ color: 'var(--text)' }}>{BASE_CURRENCY}</strong>
            </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              className="input"
              value={data.displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value)}
              style={{ fontSize: '12px', padding: '8px 10px' }}
            >
              {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
            <button
              className="btn"
              onClick={() => {
                setManualRates({
                  EUR: String(data.fxRates?.EUR || ''),
                  USD: String(data.fxRates?.USD || ''),
                });
                setShowFxPanel((current) => !current);
              }}
              style={{ fontSize: '12px' }}
            >
              <Settings2 size={14} /> FX Rates
            </button>
            <FreshnessIndicator />
          </div>
        </div>
          {showFxPanel && (
            <div style={{ width: '100%', marginTop: '12px', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg)', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ minWidth: '180px' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Latest saved rates</div>
                <div style={{ fontSize: '12px', color: 'var(--text)', marginTop: '6px', lineHeight: 1.5 }}>
                  <div>1 EUR = {Number(data.fxRates?.EUR || 0).toFixed(4)} RON</div>
                  <div>1 USD = {Number(data.fxRates?.USD || 0).toFixed(4)} RON</div>
                </div>
              </div>
              <div style={{ minWidth: '190px', fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
                <div>Source: {data.fxSource || 'manual-default'}</div>
                <div>Updated: {fxUpdatedLabel}</div>
                <div style={{ color: data.fxUpdatedAt ? 'var(--muted)' : 'var(--amber)' }}>
                  {data.fxUpdatedAt ? 'Using the latest saved rate snapshot.' : 'Rates are still using local defaults until you refresh or edit them.'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>RON per EUR</label>
                <input
                  className="input"
                  type="number"
                  step="0.0001"
                  value={manualRates.EUR}
                  onChange={(e) => setManualRates((prev) => ({ ...prev, EUR: e.target.value }))}
                  style={{ minWidth: '120px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>RON per USD</label>
                <input
                  className="input"
                  type="number"
                  step="0.0001"
                  value={manualRates.USD}
                  onChange={(e) => setManualRates((prev) => ({ ...prev, USD: e.target.value }))}
                  style={{ minWidth: '120px' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button className="btn" onClick={handleRefreshRates} style={{ fontSize: '12px' }}>
                  <RefreshCw size={14} /> Refresh
                </button>
                <button className="btn btn-primary" onClick={handleSaveRates} style={{ fontSize: '12px' }}>
                  <Save size={14} /> Save Rates
                </button>
              </div>
              <div style={{ width: '100%', fontSize: '12px', color: 'var(--muted)' }}>
                Stored balances, budgets, goals, and forecast inputs remain in RON. The selector only changes the displayed equivalent values using your latest saved rates.
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {currencySummary.hasMixedCurrencies && (
            <div style={{ marginBottom: '16px' }}>
              <MixedCurrencyNotice currencies={currencySummary.currencies} />
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink 
      to={to} 
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderRadius: '8px',
        fontSize: '14px',
        color: isActive ? 'var(--accent)' : 'var(--muted)',
        background: isActive ? 'rgba(52, 199, 89, 0.15)' : 'transparent',
        marginBottom: '4px',
        transition: 'all 0.15s',
        fontWeight: isActive ? '600' : '500'
      })}
    >
      {icon}
      {label}
    </NavLink>
  );
}
