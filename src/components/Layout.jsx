import { useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, FolderTree, Store, List, Wallet, Upload, Download, Trash2, TrendingUp, PiggyBank, Flame, Target, Repeat, DatabaseBackup } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseCSV, mergeTransactions } from '../lib/csvParser';
import { useAppContext } from '../lib/AppContext';
import { useToast } from './Toast';
import { FreshnessIndicator } from './FreshnessIndicator';

export default function Layout() {
  const { data, addTransactions, importBackup, clearData } = useAppContext();
  const toast = useToast();
  const csvInputRef = useRef(null);
  const jsonInputRef = useRef(null);

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

  const handleExportXLSX = () => {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Transactions
    const wsTransactions = XLSX.utils.json_to_sheet(data.transactions);
    XLSX.utils.book_append_sheet(wb, wsTransactions, "Transactions");

    // Sheet 2: Accounts
    const accountsData = data.accounts.map(acc => ({
      Account: acc.name,
      ...acc.balances
    }));
    const wsAccounts = XLSX.utils.json_to_sheet(accountsData);
    XLSX.utils.book_append_sheet(wb, wsAccounts, "Accounts");

    // Sheet 3: Custom Vendors
    const vendorData = Object.entries(data.customVendors).map(([vendor, [cat, sub]]) => ({
      Vendor: vendor,
      Category: cat,
      Subcategory: sub
    }));
    const wsVendors = XLSX.utils.json_to_sheet(vendorData);
    XLSX.utils.book_append_sheet(wb, wsVendors, "Custom Vendors");

    XLSX.writeFile(wb, `simple_safe_banking_backup_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

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
                <button className="btn" onClick={handleExportXLSX} style={{ flex: 1, borderColor: 'var(--border)', fontSize: '12px' }}>
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
        <div style={{ height: '60px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          {/* Topbar logic (e.g. year/month filter) can go here if moved to context, or handled in specific pages */}
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FreshnessIndicator />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
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
