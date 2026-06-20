import { useMemo, useState } from 'react';
import { Pencil, ReceiptText, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { EXPENSE_CATS, formatCurrency, getColorForCategory } from '../lib/utils';
import { convertAmountToDisplay } from '../lib/fx';
import { txKey } from '../lib/csvParser';
import { EmptyState } from '../components/ui';

const MANUAL_CATEGORIES = [...EXPENSE_CATS, 'Income', 'Savings', 'Transfers', 'Refunds', 'Cash'];

function normalizeEditableSubcategory(category, subcategory) {
  const nextSubcategory = String(subcategory || '').trim();
  if (!nextSubcategory) return '';
  return nextSubcategory === category ? '' : nextSubcategory;
}

function getDisplaySubcategory(category, subcategory) {
  return normalizeEditableSubcategory(category, subcategory);
}

export default function Transactions() {
  const { data, updateTransactionCategory } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [editingKey, setEditingKey] = useState(null);
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const displayCurrency = data.displayCurrency;
  const txns = data.transactions;

  const filtered = useMemo(() => {
    const needle = search.toLocaleLowerCase();
    return txns
      .filter((transaction) => [transaction.desc, transaction.cat, transaction.sub, transaction.matchedVendor]
        .some((value) => String(value || '').toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100);
  }, [txns, search]);

  const handleSearch = (event) => {
    const value = event.target.value;
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('q', value); else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const startEditing = (transaction) => {
    setEditingKey(txKey(transaction));
    setEditCategory(transaction.cat || '');
    setEditSubcategory(normalizeEditableSubcategory(transaction.cat || '', transaction.sub || ''));
  };

  const stopEditing = () => {
    setEditingKey(null);
    setEditCategory('');
    setEditSubcategory('');
  };

  const saveEditing = () => {
    if (!editingKey || !editCategory.trim()) return;
    const nextCategory = editCategory.trim();
    updateTransactionCategory(editingKey, nextCategory, normalizeEditableSubcategory(nextCategory, editSubcategory));
    stopEditing();
  };

  if (txns.length === 0) {
    return <EmptyState icon={ReceiptText} title="No transactions yet" description="Import a CSV to search, filter, and inspect your activity." />;
  }

  return (
    <div className="page-stack transactions-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Transactions</h2>
          <div className="page-subtitle">Search descriptions, vendors, categories, and subcategories. Click a category cell to edit that transaction.</div>
        </div>
        <span className="transaction-result-count">{filtered.length} of {txns.length} shown</span>
      </div>

      <label className="transaction-search">
        <Search size={16} />
        <input type="search" placeholder="Search activity" value={search} onChange={handleSearch} />
      </label>

      <div className="card transaction-table-card">
        <div className="tbl-wrap">
          <table className="transactions-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Currency</th><th className="align-right">Amount</th><th>Flow</th></tr>
            </thead>
            <tbody>
              {filtered.map((transaction) => {
                const key = txKey(transaction);
                const isEditing = editingKey === key;
                const displaySubcategory = getDisplaySubcategory(transaction.cat, transaction.sub);

                return (
                  <tr key={key} className={isEditing ? 'transaction-row-editing' : ''}>
                    <td data-label="Date" className="transaction-date">{transaction.date}</td>
                    <td data-label="Description" className="transaction-description" title={transaction.desc}>{transaction.desc}</td>
                    <td data-label="Category" className="transaction-category-cell">
                      {isEditing ? (
                        <div className="transaction-category-editor">
                          <select className="input" value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>
                            <option value="">Select…</option>
                            {MANUAL_CATEGORIES.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                          <input
                            className="input"
                            type="text"
                            placeholder="Subcategory"
                            value={editSubcategory}
                            onChange={(event) => setEditSubcategory(event.target.value)}
                          />
                          <div className="transaction-category-editor-actions">
                            <button className="btn btn-primary" type="button" onClick={saveEditing}>Save</button>
                            <button className="btn" type="button" onClick={stopEditing}><X size={14} /></button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="transaction-category-button"
                          onClick={() => startEditing(transaction)}
                          aria-label={`Edit category for ${transaction.desc}`}
                        >
                          <span className="transaction-category" style={{ color: getColorForCategory(transaction.cat) }}>
                            {transaction.cat}
                          </span>
                          {displaySubcategory ? <span className="transaction-category-sub">{displaySubcategory}</span> : null}
                          <Pencil size={12} />
                        </button>
                      )}
                    </td>
                    <td data-label="Currency" className="transaction-currency">{transaction.currency || 'N/A'}</td>
                    <td data-label="Amount" className={`transaction-amount ${transaction.flow.toLocaleLowerCase()}`}>
                      {transaction.flow === 'Credit' ? '+' : '-'}{formatCurrency(
                        Math.abs(convertAmountToDisplay(transaction.amt, transaction.currency || 'RON', displayCurrency, data.fxRates)),
                        displayCurrency
                      )}
                    </td>
                    <td data-label="Flow"><span className={`badge ${transaction.flow}`}>{transaction.flow}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="table-empty">No transactions match “{search}”.</div>}
        </div>
      </div>
    </div>
  );
}
