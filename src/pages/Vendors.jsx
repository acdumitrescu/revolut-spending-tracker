import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../lib/AppContext';
import { formatCurrency, EXPENSE_CATS, getColorForCategory } from '../lib/utils';
import { convertAmountToDisplay } from '../lib/fx';
import { Pencil, Sparkles, Store } from 'lucide-react';
import { filterTransactionsByPeriod, getUniqueYears } from '../lib/selectors';
import { EmptyState } from '../components/ui';
import { useLocation } from 'react-router-dom';
import { getOtherVendorGroups } from '../lib/vendorReview';
import CustomMappings from '../components/CustomMappings';
import UnknownVendorReview from '../components/UnknownVendorReview';

export default function Vendors() {
  const location = useLocation();
  const {
    data,
    updateCustomVendor,
    removeCustomVendor,
    runtimeConfig,
    syncStatus,
    loadVendorObservations,
    resolveVendorObservation,
  } = useAppContext();
  const txns = data.transactions;
  const customVendors = data.customVendors || {};
  const displayCurrency = data.displayCurrency;

  const [timeFilter, setTimeFilter] = useState('ALL TIME');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [mappingRequest, setMappingRequest] = useState(null);
  const [unknownObservations, setUnknownObservations] = useState([]);
  const [unknownLoading, setUnknownLoading] = useState(false);
  const [unknownError, setUnknownError] = useState('');
  const loadVendorObservationsRef = useRef(loadVendorObservations);

  const uniqueYears = useMemo(() => getUniqueYears(txns), [txns]);

  const filteredTxns = useMemo(() => {
    return filterTransactionsByPeriod(txns, timeFilter, yearFilter).filter(
      (txn) => txn.flow === 'Debit' && EXPENSE_CATS.has(txn.cat),
    );
  }, [txns, timeFilter, yearFilter]);

  const vendors = {};
  filteredTxns.forEach((t) => {
    if (!vendors[t.desc]) vendors[t.desc] = { total: 0, count: 0, cat: t.cat };
    vendors[t.desc].total += Math.abs(
      convertAmountToDisplay(t.amt, t.currency || 'RON', displayCurrency, data.fxRates),
    );
    vendors[t.desc].count += 1;
  });

  const sorted = Object.entries(vendors)
    .map(([v, d]) => ({ v, ...d }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 100);
  const otherVendorGroups = useMemo(
    () => getOtherVendorGroups(txns, displayCurrency, data.fxRates),
    [data.fxRates, displayCurrency, txns],
  );

  useEffect(() => {
    loadVendorObservationsRef.current = loadVendorObservations;
  }, [loadVendorObservations]);

  useEffect(() => {
    if (location.hash !== '#mappings') return;
    window.requestAnimationFrame(() => {
      document.getElementById('mappings')?.scrollIntoView({ block: 'start' });
    });
  }, [location.hash]);

  useEffect(() => {
    if (!runtimeConfig.privateSyncEnabled || syncStatus.phase !== 'synced') return undefined;

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
  }, [runtimeConfig.privateSyncEnabled, syncStatus.phase]);

  const openMappingEditor = (vendorName) => {
    const existing = customVendors[vendorName];
    const auto = vendors[vendorName];
    setMappingRequest({
      mode: 'edit',
      vendor: vendorName,
      cat: existing ? existing[0] : auto?.cat || '',
      sub: existing ? existing[1] : '',
    });
  };

  const handleSuggestedOtherMapping = (group, candidate) => {
    updateCustomVendor(group.vendorKey, candidate.category, candidate.subcategory);
  };

  const handleManualOtherMapping = (group) => {
    setMappingRequest({ mode: 'add', vendor: group.vendorKey });
  };

  const handleApplyObservation = async (observation, candidate) => {
    if (!candidate) return;
    updateCustomVendor(
      observation.normalizedDescription,
      candidate.category,
      candidate.subcategory,
    );
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

  const handleMapObservation = (observation) => {
    setMappingRequest({ mode: 'add', vendor: observation.normalizedDescription });
  };

  const handleIgnoreObservation = async (observation) => {
    try {
      const result = await resolveVendorObservation({
        normalizedDescription: observation.normalizedDescription,
        status: 'ignored',
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
          <h2 className="page-title" style={{ marginBottom: '10px' }}>
            Vendors
          </h2>
          <div className="page-subtitle">
            Understand where spending concentrates and override vendor categorization when you want
            tighter control.
          </div>
        </div>
        <EmptyState
          icon={Store}
          title="No vendor activity yet"
          description="Import transactions to reveal merchant concentration and category mappings."
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">Vendors</h2>
          <div className="page-subtitle">
            Track your heaviest merchants, review custom overrides, and narrow the dataset with the
            same time filters used on Overview.
          </div>
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
            {uniqueYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {(timeFilter !== 'ALL TIME' || yearFilter !== 'ALL') && (
            <div className="tag-pill">Filtered vendors</div>
          )}
        </div>
      </div>

      {runtimeConfig.privateSyncEnabled && (
        <UnknownVendorReview
          observations={unknownObservations}
          customVendors={customVendors}
          loading={unknownLoading}
          error={unknownError}
          onApply={handleApplyObservation}
          onMap={handleMapObservation}
          onIgnore={handleIgnoreObservation}
        />
      )}

      {otherVendorGroups.length > 0 && (
        <div className="card" style={{ marginBottom: '0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div className="card-title" style={{ marginBottom: '4px' }}>
                Other Vendor Review
              </div>
              <div className="section-note" style={{ marginBottom: 0 }}>
                Review uncategorized vendors using only the bundled local knowledge base. Merchant
                descriptions are not sent to an external service.
              </div>
            </div>
            <div className="tag-pill">{otherVendorGroups.length} vendors</div>
          </div>

          <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
            {otherVendorGroups.map((group) => (
              <div
                key={group.vendorKey}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  background: 'var(--surface-subtle)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: '220px', flex: 1 }}>
                  <strong style={{ display: 'block' }}>{group.samples[0]}</strong>
                  <span className="section-note" style={{ marginBottom: 0 }}>
                    {group.count} {group.count === 1 ? 'transaction' : 'transactions'} ·{' '}
                    {formatCurrency(group.total, displayCurrency)}
                  </span>
                </div>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                >
                  {group.suggestions.map((candidate) => (
                    <button
                      key={`${group.vendorKey}-${candidate.canonicalName}-${candidate.alias}`}
                      type="button"
                      className="btn"
                      onClick={() => handleSuggestedOtherMapping(group, candidate)}
                      title={`Local similarity score ${candidate.score}; lower is closer`}
                    >
                      <Sparkles size={13} /> {candidate.category}
                      {candidate.subcategory ? ` / ${candidate.subcategory}` : ''}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleManualOtherMapping(group)}
                  >
                    Map manually
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CustomMappings
        customVendors={customVendors}
        onSave={updateCustomVendor}
        onRemove={removeCustomVendor}
        request={mappingRequest}
      />

      <div className="card" style={{ marginBottom: '0' }}>
        <div className="card-title">
          Top 100 Vendors {timeFilter !== 'ALL TIME' || yearFilter !== 'ALL' ? '(Filtered)' : ''}
        </div>
        <div className="section-note" style={{ marginBottom: '14px' }}>
          Total spend reflects expense-only transactions in the selected period, converted to your
          current display currency.
        </div>
        <div className="tbl-wrap">
          {sorted.length === 0 ? (
            <div className="section-note" style={{ padding: '20px', textAlign: 'center' }}>
              No vendors match the selected filters.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Total Spend</th>
                  <th style={{ textAlign: 'right' }}>Transactions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((v, i) => (
                  <tr key={v.v}>
                    <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{v.v}</td>
                    <td>
                      <span
                        style={{
                          color: getColorForCategory(v.cat),
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {v.cat}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {formatCurrency(v.total, displayCurrency)}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{v.count}</td>
                    <td>
                      <button
                        className="btn"
                        style={{ padding: '2px 6px', fontSize: '10px' }}
                        onClick={() => openMappingEditor(v.v)}
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
