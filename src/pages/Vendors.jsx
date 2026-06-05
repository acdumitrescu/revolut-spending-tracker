import { useState, useMemo } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency, EXPENSE_CATS, getColorForCategory } from '../lib/utils';
import { convertAmountToDisplay } from '../lib/fx';
import { Pencil, X, Plus, Trash2, Search } from 'lucide-react';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { filterTransactionsByPeriod, getUniqueYears } from '../lib/selectors';

export default function Vendors() {
  const { data, updateCustomVendor, removeCustomVendor, currencySummary } = useAppContext();
  const txns = data.transactions;
  const customVendors = data.customVendors || {};
  const displayCurrency = data.displayCurrency;
  
  const [timeFilter, setTimeFilter] = useState('ALL TIME');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [editing, setEditing] = useState(null);
  const [editCat, setEditCat] = useState('');
  const [editSub, setEditSub] = useState('');
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendor, setNewVendor] = useState('');
  const [newVendorCat, setNewVendorCat] = useState('');
  const [newVendorSub, setNewVendorSub] = useState('');
  const [mappingSearch, setMappingSearch] = useState('');

  const uniqueYears = useMemo(() => getUniqueYears(txns), [txns]);

  const filteredTxns = useMemo(() => {
    return filterTransactionsByPeriod(txns, timeFilter, yearFilter).filter(
      (txn) => txn.flow === 'Debit' && EXPENSE_CATS.has(txn.cat)
    );
  }, [txns, timeFilter, yearFilter]);

  const vendors = {};
  filteredTxns.forEach(t => {
    if (!vendors[t.desc]) vendors[t.desc] = { total: 0, count: 0, cat: t.cat };
    vendors[t.desc].total += Math.abs(convertAmountToDisplay(t.amt, t.currency || 'RON', displayCurrency, data.fxRates));
    vendors[t.desc].count += 1;
  });

  const sorted = Object.entries(vendors).map(([v, d]) => ({ v, ...d })).sort((a, b) => b.total - a.total).slice(0, 100);
  const filteredMappings = Object.entries(customVendors).filter(([vendor, [cat, sub]]) => {
    const haystack = `${vendor} ${cat} ${sub}`.toLowerCase();
    return haystack.includes(mappingSearch.toLowerCase());
  });

  const handleStartEdit = (vendorName) => {
    const existing = customVendors[vendorName];
    if (existing) {
      setEditCat(existing[0]);
      setEditSub(existing[1]);
    } else {
      const auto = vendors[vendorName];
      setEditCat(auto ? auto.cat : '');
      setEditSub('');
    }
    setEditing(vendorName);
  };

  const handleSaveEdit = (vendorName) => {
    if (editCat.trim()) {
      updateCustomVendor(vendorName, editCat.trim(), editSub.trim());
    }
    setEditing(null);
  };

  const handleAddVendor = () => {
    if (newVendor.trim() && newVendorCat.trim()) {
      updateCustomVendor(newVendor.trim(), newVendorCat.trim(), newVendorSub.trim());
      setNewVendor('');
      setNewVendorCat('');
      setNewVendorSub('');
      setShowAddVendor(false);
    }
  };

  if (txns.length === 0) {
    return (
      <div>
        <h2 style={{ marginBottom: '20px' }}>Vendors</h2>
        <div className="empty-state">
          <div className="empty-state-icon">&#127978;</div>
          <div className="empty-state-title">No vendors</div>
          <div className="empty-state-desc">Upload a CSV to see vendor breakdowns.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Vendors</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select 
            className="input" 
            value={timeFilter} 
            onChange={(e) => setTimeFilter(e.target.value)}
          >
            <option value="ALL TIME">All Time</option>
            <option value="Today">Today</option>
            <option value="Last Week">Last 7 Days</option>
            <option value="Last Month">Last 30 Days</option>
            <option value="Last Year">Last 365 Days</option>
          </select>
          <select 
            className="input" 
            value={yearFilter} 
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="ALL">All Years</option>
            {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Custom Vendor Mappings */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Custom Category Mappings</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="input" value={mappingSearch} onChange={(e) => setMappingSearch(e.target.value)} placeholder="Search mappings..." style={{ paddingLeft: '32px', fontSize: '12px' }} />
            </div>
            <button className="btn" onClick={() => setShowAddVendor(!showAddVendor)} style={{ fontSize: '12px' }}>
              <Plus size={14} /> Add Mapping
            </button>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', marginBottom: '12px' }}>
          Override vendor categorization. Matching is case-insensitive, ignores punctuation noise, and prefers the longest vendor rule first.
        </div>

        {showAddVendor && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Vendor Name</label>
              <input type="text" className="input" placeholder="e.g. STARBUCKS" value={newVendor} onChange={e => setNewVendor(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Category</label>
              <select className="input" value={newVendorCat} onChange={e => setNewVendorCat(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select...</option>
                {[...EXPENSE_CATS, 'Income', 'Savings', 'Transfers'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Subcategory</label>
              <input type="text" className="input" placeholder="e.g. Coffee" value={newVendorSub} onChange={e => setNewVendorSub(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button className="btn btn-primary" onClick={handleAddVendor} style={{ flexShrink: 0 }}>Save</button>
          </div>
        )}

        {Object.keys(customVendors).length === 0 && !showAddVendor ? (
          <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '12px' }}>
            No custom mappings yet. Click "Add Mapping" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {filteredMappings.map(([vendor, [cat, sub]]) => (
              <div key={vendor} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: '20px',
                padding: '4px 10px',
                fontSize: '12px',
              }}>
                <span style={{ color: getColorForCategory(cat), fontWeight: 600 }}>{vendor}</span>
                <span style={{ color: 'var(--muted)' }}>→</span>
                <span>{cat}{sub ? ` / ${sub}` : ''}</span>
                <button
                  onClick={() => handleStartEdit(vendor)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => removeCustomVendor(vendor)}
                  style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div style={{ marginTop: '12px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Category</label>
              <select className="input" value={editCat} onChange={e => setEditCat(e.target.value)} style={{ width: '100%' }}>
                <option value="">Select...</option>
                {[...EXPENSE_CATS, 'Income', 'Savings', 'Transfers'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Subcategory</label>
              <input type="text" className="input" value={editSub} onChange={e => setEditSub(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button className="btn btn-primary" onClick={() => handleSaveEdit(editing)} style={{ flexShrink: 0 }}>Save</button>
            <button className="btn" onClick={() => setEditing(null)} style={{ flexShrink: 0 }}><X size={14} /></button>
          </div>
        )}
      </div>
      
      {/* Vendor Table */}
      <div className="card">
        <div className="card-title">Top 100 Vendors {timeFilter !== 'ALL TIME' || yearFilter !== 'ALL' ? '(Filtered)' : ''}</div>
        {currencySummary.hasMixedCurrencies && (
          <div style={{ marginBottom: '12px' }}>
            <MixedCurrencyNotice currencies={currencySummary.currencies} compact />
          </div>
        )}
        <div className="tbl-wrap">
          {sorted.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>No vendors match the selected filters.</div>
          ) : (
            <table>
              <thead>
                <tr><th>#</th><th>Vendor</th><th>Category</th><th style={{textAlign:'right'}}>Total Spend</th><th style={{textAlign:'right'}}>Transactions</th><th></th></tr>
              </thead>
              <tbody>
                {sorted.map((v, i) => (
                  <tr key={v.v}>
                    <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{v.v}</td>
                    <td><span style={{ color: getColorForCategory(v.cat), fontSize: '11px', fontWeight: 600 }}>{v.cat}</span></td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(v.total, displayCurrency)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{v.count}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                        onClick={() => handleStartEdit(v.v)}
                      >
                        <Pencil size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
