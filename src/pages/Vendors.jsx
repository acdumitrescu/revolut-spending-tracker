import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency, EXPENSE_CATS, getColorForCategory } from '../lib/utils';
import { convertAmountToDisplay } from '../lib/fx';
import { Pencil, X, Plus, Trash2, Search, Store } from 'lucide-react';
import MixedCurrencyNotice from '../components/MixedCurrencyNotice';
import { filterTransactionsByPeriod, getUniqueYears } from '../lib/selectors';
import { EmptyState } from '../components/ui';

export default function Vendors() {
  const {
    data,
    updateCustomVendor,
    removeCustomVendor,
    currencySummary,
    runtimeConfig,
    loadVendorObservations,
    resolveVendorObservation,
  } = useAppContext();
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
  const [unknownObservations, setUnknownObservations] = useState([]);
  const [unknownLoading, setUnknownLoading] = useState(false);
  const [unknownError, setUnknownError] = useState('');
  const loadVendorObservationsRef = useRef(loadVendorObservations);

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
  const pendingUnknownObservations = unknownObservations.filter((observation) => (observation.status || 'pending') === 'pending');

  useEffect(() => {
    loadVendorObservationsRef.current = loadVendorObservations;
  }, [loadVendorObservations]);

  useEffect(() => {
    if (!runtimeConfig.privateSyncEnabled) return undefined;

    let cancelled = false;
    const controller = new AbortController();

    async function refreshUnknownObservations() {
      setUnknownLoading(true);
      setUnknownError('');
      try {
        const response = await loadVendorObservationsRef.current(controller.signal);
        if (!cancelled) {
          setUnknownObservations(response.observations || []);
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setUnknownError(error.message);
        }
      } finally {
        if (!cancelled) {
          setUnknownLoading(false);
        }
      }
    }

    void refreshUnknownObservations();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [runtimeConfig.privateSyncEnabled]);

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

  const handleApplyObservation = async (observation, candidate) => {
    if (!candidate) return;
    updateCustomVendor(observation.normalizedDescription, candidate.category, candidate.subcategory);
    try {
      const result = await resolveVendorObservation({
        normalizedDescription: observation.normalizedDescription,
        status: 'mapped-custom',
        resolution: {
          vendorKey: observation.normalizedDescription,
          category: candidate.category,
          subcategory: candidate.subcategory,
          matchedVendor: candidate.canonicalName,
        },
      });
      setUnknownObservations(result.observations || []);
    } catch (error) {
      setUnknownError(error.message);
    }
  };

  const handleMarkPublicCandidate = async (observation) => {
    try {
      const result = await resolveVendorObservation({
        normalizedDescription: observation.normalizedDescription,
        status: 'candidate-public',
        resolution: {
          candidate: observation.suggestedCandidates?.[0] || null,
        },
      });
      setUnknownObservations(result.observations || []);
    } catch (error) {
      setUnknownError(error.message);
    }
  };

  if (txns.length === 0) {
    return (
      <div className="page-stack">
        <div>
          <h2 className="page-title" style={{ marginBottom: '10px' }}>Vendors</h2>
          <div className="page-subtitle">Understand where spending concentrates and override vendor categorization when you want tighter control.</div>
        </div>
        <EmptyState icon={Store} title="No vendor activity yet" description="Import transactions to reveal merchant concentration and category mappings." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Vendors</h2>
          <div className="page-subtitle">Track your heaviest merchants, review custom overrides, and narrow the dataset with the same time filters used on Overview.</div>
        </div>
        <div className="page-actions">
          <select 
            className="input select-inline"
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
            className="input select-inline"
            value={yearFilter} 
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="ALL">All Years</option>
            {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(timeFilter !== 'ALL TIME' || yearFilter !== 'ALL') && (
            <div className="tag-pill">Filtered vendors</div>
          )}
        </div>
      </div>

      {runtimeConfig.privateSyncEnabled && (
        <div className="card" style={{ marginBottom: '0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div className="card-title" style={{ marginBottom: '4px' }}>Unknown Vendor Review</div>
              <div className="section-note" style={{ marginBottom: 0 }}>
                Repeated unresolved merchants are cached privately so you can map them once instead of reclassifying them every import.
              </div>
            </div>
            <div className="tag-pill">{pendingUnknownObservations.length} pending</div>
          </div>

          {unknownLoading && (
            <div className="section-note" style={{ paddingTop: '12px' }}>Loading private vendor observations…</div>
          )}

          {unknownError && (
            <div className="section-note" style={{ paddingTop: '12px', color: 'var(--danger)' }}>{unknownError}</div>
          )}

          {!unknownLoading && pendingUnknownObservations.length === 0 && (
            <div className="section-note" style={{ paddingTop: '12px' }}>
              No unresolved vendor clusters are waiting for review.
            </div>
          )}

          {!unknownLoading && pendingUnknownObservations.length > 0 && (
            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
              {pendingUnknownObservations.slice(0, 12).map((observation) => {
                const topCandidate = observation.suggestedCandidates?.[0];
                return (
                  <div
                    key={observation.normalizedDescription}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      padding: '14px',
                      background: 'var(--surface-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ display: 'block', marginBottom: '4px' }}>{observation.rawSamples?.[0] || observation.normalizedDescription}</strong>
                        <div className="section-note" style={{ marginBottom: 0 }}>
                          {observation.count} occurrences · last seen {observation.lastSeenAt}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {topCandidate && (
                          <button className="btn btn-primary" onClick={() => handleApplyObservation(observation, topCandidate)}>
                            Map to {topCandidate.category} / {topCandidate.subcategory}
                          </button>
                        )}
                        <button className="btn" onClick={() => handleMarkPublicCandidate(observation)}>
                          Mark public override
                        </button>
                      </div>
                    </div>

                    {observation.suggestedCandidates?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                        {observation.suggestedCandidates.map((candidate) => (
                          <div
                            key={`${observation.normalizedDescription}-${candidate.canonicalName}-${candidate.alias}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '999px',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              fontSize: '11px',
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{candidate.canonicalName}</span>
                            <span style={{ color: 'var(--muted)' }}>{candidate.category} / {candidate.subcategory}</span>
                            <span style={{ color: 'var(--muted)' }}>score {candidate.score}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Custom Category Mappings</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', top: '50%', left: '10px', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input className="input" value={mappingSearch} onChange={(e) => setMappingSearch(e.target.value)} placeholder="Search mappings..." style={{ paddingLeft: '32px', fontSize: '12px', minWidth: '220px' }} />
            </div>
            <button className="btn btn-primary" onClick={() => setShowAddVendor(!showAddVendor)} style={{ fontSize: '12px' }}>
              <Plus size={14} /> Add Mapping
            </button>
          </div>
        </div>
        <div className="section-note" style={{ marginTop: '6px', marginBottom: '14px' }}>
          Override vendor categorization. Built-in matching is local-first, case-insensitive, trims punctuation and legal suffix noise, prefers stronger aliases first, and falls back to low-confidence keyword hints only when needed.
        </div>

        {showAddVendor && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '14px', padding: '14px', background: 'var(--surface-subtle)', borderRadius: '16px', flexWrap: 'wrap' }}>
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
          <div className="section-note" style={{ textAlign: 'center', padding: '12px' }}>
            No custom mappings yet. Click "Add Mapping" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {filteredMappings.map(([vendor, [cat, sub]]) => (
              <div key={vendor} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--surface-subtle)',
                border: '1px solid var(--border)',
                borderRadius: '999px',
                padding: '7px 12px',
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
          <div style={{ marginTop: '14px', padding: '14px', background: 'var(--surface-subtle)', borderRadius: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
      
      <div className="card" style={{ marginBottom: '0' }}>
        <div className="card-title">Top 100 Vendors {timeFilter !== 'ALL TIME' || yearFilter !== 'ALL' ? '(Filtered)' : ''}</div>
        <div className="section-note" style={{ marginBottom: '14px' }}>
          Total spend reflects expense-only transactions in the selected period, converted to your current display currency.
        </div>
        {currencySummary.hasMixedCurrencies && (
          <div style={{ marginBottom: '12px' }}>
            <MixedCurrencyNotice currencies={currencySummary.currencies} compact />
          </div>
        )}
        <div className="tbl-wrap">
          {sorted.length === 0 ? (
            <div className="section-note" style={{ padding: '20px', textAlign: 'center' }}>No vendors match the selected filters.</div>
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
