import { memo, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { reviewableObservations } from '../lib/vendorReview';
import './UnknownVendorReview.css';

const PAGE = 12;
function UnknownVendorReview({ observations, customVendors, loading, error, onApply, onMap, onIgnore }) {
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);

  const pending = useMemo(() => reviewableObservations(observations, customVendors), [observations, customVendors]);
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? pending.filter((item) => `${item.rawSamples?.[0] || ''} ${item.normalizedDescription}`.toLowerCase().includes(needle)) : pending;
  }, [pending, search]);
  const shown = matches.slice(0, visible);

  return (
    <section className="card unknown-review" aria-labelledby="unknown-review-title">
      <header className="unknown-review-head">
        <div>
          <h2 className="card-title" id="unknown-review-title">Unknown Vendor Review <span className="tag-pill">{pending.length} pending</span></h2>
          <p className="section-note">Merchants the app could not categorise. Map one and every matching transaction updates; ignore the ones you do not care about.</p>
        </div>
        {pending.length > PAGE && (
          <label className="unknown-review-search">
            <Search size={14} aria-hidden="true" />
            <input className="input" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setVisible(PAGE); }} placeholder="Search unknown vendors" aria-label="Search unknown vendors" />
          </label>
        )}
      </header>

      {loading && <p className="section-note">Loading private vendor observations…</p>}
      {error && <p className="section-note unknown-review-error">{error}</p>}
      {!loading && pending.length === 0 && <p className="section-note">No unknown vendors are waiting for review.</p>}
      {!loading && pending.length > 0 && matches.length === 0 && <p className="section-note">No unknown vendors match “{search}”.</p>}

      <ul className="unknown-review-list">
        {shown.map((observation) => {
          const top = observation.suggestedCandidates?.[0];
          const name = observation.rawSamples?.[0] || observation.normalizedDescription;
          return (
            <li key={observation.normalizedDescription} className="unknown-review-row">
              <div className="unknown-review-main">
                <strong>{name}</strong>
                <span className="section-note">{observation.count} {observation.count === 1 ? 'transaction' : 'transactions'} · last seen {observation.lastSeenAt}</span>
                {top && <span className="unknown-review-hint">Looks like {top.canonicalName} · {top.category}{top.subcategory ? ` / ${top.subcategory}` : ''}</span>}
              </div>
              <div className="unknown-review-actions">
                {top && <button type="button" className="btn btn-primary" onClick={() => onApply(observation, top)}>Map to {top.category}</button>}
                <button type="button" className="btn" onClick={() => onMap(observation)}>Choose category…</button>
                <button type="button" className="btn" onClick={() => onIgnore(observation)} title="Hide this vendor from the review. Its transactions keep their current category.">Ignore</button>
              </div>
            </li>
          );
        })}
      </ul>

      {matches.length > shown.length && (
        <button type="button" className="btn unknown-review-more" onClick={() => setVisible((count) => count + PAGE * 2)}>
          Show more ({matches.length - shown.length} left)
        </button>
      )}
    </section>
  );
}

export default memo(UnknownVendorReview);
