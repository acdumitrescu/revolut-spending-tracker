import { memo, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { EXPENSE_CATS, getColorForCategory } from '../lib/utils';
import './CustomMappings.css';

const CATEGORY_OPTIONS = [...EXPENSE_CATS, 'Income', 'Savings', 'Transfers'];

function CategoryFields({ category, subcategory, onCategory, onSubcategory, idPrefix }) {
  return (
    <>
      <select id={`${idPrefix}-cat`} className="input" aria-label="Category" value={category} onChange={(event) => onCategory(event.target.value)}>
        <option value="">Category…</option>
        {CATEGORY_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <input id={`${idPrefix}-sub`} className="input" aria-label="Subcategory" placeholder="Subcategory (optional)" value={subcategory} onChange={(event) => onSubcategory(event.target.value)} />
    </>
  );
}

// `request` ({ mode, vendor, cat, sub, mode }) lets the page open the editor or the add form
// (from the vendor table or Other Vendor Review) without owning any of this component's state.
function CustomMappings({ customVendors, onSave, onRemove, request }) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ vendor: '', cat: '', sub: '' });
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState({ cat: '', sub: '' });

  // Adjust state during render when a new request arrives, instead of cascading through an effect.
  const [handledRequest, setHandledRequest] = useState(null);
  if (request && request !== handledRequest) {
    setHandledRequest(request);
    if (request.mode === 'add') {
      setDraft({ vendor: request.vendor, cat: request.cat || '', sub: request.sub || '' });
      setAdding(true);
      setEditing(null);
    } else {
      setEditing(request.vendor);
      setEditDraft({ cat: request.cat || '', sub: request.sub || '' });
    }
  }

  useEffect(() => {
    if (request) window.requestAnimationFrame(() => document.getElementById('mappings')?.scrollIntoView({ block: 'start' }));
  }, [request]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return Object.entries(customVendors)
      .filter(([vendor, [cat, sub]]) => !needle || `${vendor} ${cat} ${sub}`.toLowerCase().includes(needle))
      .sort((a, b) => a[1][0].localeCompare(b[1][0]) || a[0].localeCompare(b[0]));
  }, [customVendors, search]);

  const total = Object.keys(customVendors).length;

  const saveNew = (event) => {
    event.preventDefault();
    if (!draft.vendor.trim() || !draft.cat) return;
    onSave(draft.vendor.trim(), draft.cat, draft.sub.trim());
    setDraft({ vendor: '', cat: '', sub: '' });
    setAdding(false);
  };

  const saveEdit = (vendor) => {
    if (!editDraft.cat) return;
    onSave(vendor, editDraft.cat, editDraft.sub.trim());
    setEditing(null);
  };

  return (
    <section className="card custom-mappings" id="mappings" aria-labelledby="mappings-title">
      <header className="custom-mappings-head">
        <div>
          <h2 className="card-title" id="mappings-title">Custom Category Mappings <span className="tag-pill">{total}</span></h2>
          <p className="section-note">Your rules win over built-in matching and apply instantly to every transaction, except ones you categorised by hand.</p>
        </div>
        <div className="custom-mappings-tools">
          <label className="custom-mappings-search">
            <Search size={14} aria-hidden="true" />
            <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mappings" aria-label="Search mappings" />
          </label>
          <button type="button" className="btn btn-primary" onClick={() => setAdding((value) => !value)} aria-expanded={adding}>
            <Plus size={14} /> Add mapping
          </button>
        </div>
      </header>

      {adding && (
        <form className="custom-mappings-form" onSubmit={saveNew}>
          <input className="input" aria-label="Vendor name" placeholder="Vendor, e.g. STARBUCKS" value={draft.vendor} onChange={(event) => setDraft({ ...draft, vendor: event.target.value })} autoFocus />
          <CategoryFields idPrefix="new-mapping" category={draft.cat} subcategory={draft.sub} onCategory={(cat) => setDraft({ ...draft, cat })} onSubcategory={(sub) => setDraft({ ...draft, sub })} />
          <button type="submit" className="btn btn-primary" disabled={!draft.vendor.trim() || !draft.cat}>Save</button>
          <button type="button" className="btn" onClick={() => setAdding(false)} aria-label="Cancel"><X size={14} /></button>
        </form>
      )}

      {total === 0 && !adding ? (
        <p className="custom-mappings-empty">No custom mappings yet. Add one, or map a vendor from Other Vendor Review.</p>
      ) : rows.length === 0 ? (
        <p className="custom-mappings-empty">No mappings match “{search}”.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="custom-mappings-table">
            <thead>
              <tr><th>Vendor</th><th>Category</th><th>Subcategory</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map(([vendor, [cat, sub]]) => (
                editing === vendor ? (
                  <tr key={vendor} className="is-editing">
                    <td className="custom-mappings-vendor">{vendor}</td>
                    <td colSpan={2}>
                      <div className="custom-mappings-inline">
                        <CategoryFields idPrefix={`edit-${vendor}`} category={editDraft.cat} subcategory={editDraft.sub} onCategory={(next) => setEditDraft({ ...editDraft, cat: next })} onSubcategory={(next) => setEditDraft({ ...editDraft, sub: next })} />
                      </div>
                    </td>
                    <td className="custom-mappings-actions">
                      <button type="button" className="btn btn-primary" onClick={() => saveEdit(vendor)} disabled={!editDraft.cat} aria-label={`Save mapping for ${vendor}`}><Check size={14} /></button>
                      <button type="button" className="btn" onClick={() => setEditing(null)} aria-label="Cancel editing"><X size={14} /></button>
                    </td>
                  </tr>
                ) : (
                  <tr key={vendor}>
                    <td className="custom-mappings-vendor">{vendor}</td>
                    <td><span className="custom-mappings-cat" style={{ '--cat-color': getColorForCategory(cat) }}>{cat}</span></td>
                    <td className="custom-mappings-sub">{sub || '—'}</td>
                    <td className="custom-mappings-actions">
                      <button type="button" className="btn" onClick={() => { setEditing(vendor); setEditDraft({ cat, sub }); }} aria-label={`Edit mapping for ${vendor}`}><Pencil size={13} /></button>
                      <button type="button" className="btn custom-mappings-delete" onClick={() => onRemove(vendor)} aria-label={`Delete mapping for ${vendor}`}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default memo(CustomMappings);
