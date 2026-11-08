import { useMemo, useState } from 'react';
import { FileUp, Pencil, ReceiptText, Search, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { EXPENSE_CATS, formatCurrency, getColorForCategory } from '../lib/utils';
import { convertAmountToDisplay, SUPPORTED_DISPLAY_CURRENCIES } from '../lib/fx';
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
  const { data, updateTransactionCategory, clearTransactionCategoryOverride, setTransactionCurrency } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const month = searchParams.get('month') || '';
  const category = searchParams.get('category') || '';
  const currency = searchParams.get('currency') || '';
  const [editingKey, setEditingKey] = useState(null);
  const [editCategory, setEditCategory] = useState('');
  const [editSubcategory, setEditSubcategory] = useState('');
  const displayCurrency = data.displayCurrency;
  const txns = data.transactions;

  const filtered = useMemo(() => {
    const needle = search.toLocaleLowerCase();
    return txns
      .filter((transaction) => (!month || transaction.ym === month)
        && (!category || transaction.cat === category)
        && (!currency || (transaction.currency || 'RON') === currency))
      .filter((transaction) => [transaction.desc, transaction.cat, transaction.sub, transaction.matchedVendor]
        .some((value) => String(value || '').toLocaleLowerCase().includes(needle)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [txns, search, month, category, currency]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 100));
  const requestedPage = Number(searchParams.get('page'));
  const page = Math.min(pageCount, Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const visible = filtered.slice((page - 1) * 100, page * 100);

  const changeFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
    setEditingKey(null);
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

  const handleUseAutomaticCategory = (transaction) => {
    clearTransactionCategoryOverride(
      txKey(transaction),
      transaction.baseCat,
      transaction.baseSub
    );
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span className="transaction-result-count">{filtered.length ? (page - 1) * 100 + 1 : 0}–{Math.min(page * 100, filtered.length)} of {filtered.length} matching · {txns.length} total</span>
          <Link className="btn btn-primary" to="/app/import"><FileUp size={16} aria-hidden="true" /> Import</Link>
        </div>
      </div>

      <label className="transaction-search">
        <Search size={16} />
        <input type="search" placeholder="Search activity" value={search} onChange={(event) => changeFilter('q', event.target.value)} />
      </label>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {[
          ['month', month, [...new Set(txns.map((item) => item.ym))].sort().reverse(), 'months'],
          ['category', category, [...new Set(txns.map((item) => item.cat))].sort(), 'categories'],
          ['currency', currency, [...new Set(txns.map((item) => item.currency || 'RON'))].sort(), 'currencies'],
        ].map(([key, value, options, label]) => (
          <select key={key} className="input" aria-label={`Filter by ${key}`} value={value} onChange={(event) => changeFilter(key, event.target.value)}>
            <option value="">All {label}</option>
            {options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        ))}
      </div>

      <div className="card transaction-table-card">
        <div className="tbl-wrap">
          <table className="transactions-table">
            <thead>
              <tr><th>Date</th><th>Description</th><th>Category</th><th>Currency</th><th className="align-right">Amount</th><th>Flow</th></tr>
            </thead>
            <tbody>
              {visible.map((transaction) => {
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
                          <span className={`transaction-category-source ${transaction.categorySource || 'imported'}`}>
                            {transaction.categorySource === 'manual' ? 'Manual' : transaction.categorySource === 'custom' ? 'Vendor mapping' : transaction.categorySource === 'automatic' ? 'Automatic' : 'Imported'}
                          </span>
                          <Pencil size={12} />
                        </button>
                      )}
                      {!isEditing && transaction.categorySource === 'manual' ? (
                        <button
                          type="button"
                          className="transaction-use-automatic"
                          onClick={() => handleUseAutomaticCategory(transaction)}
                        >
                          Use vendor mapping
                        </button>
                      ) : null}
                    </td>
                    <td data-label="Currency" className="transaction-currency">
                      <select
                        className="input"
                        value={transaction.currency || ''}
                        aria-label={`Currency for ${transaction.desc}`}
                        onChange={(event) => event.target.value && setTransactionCurrency(key, event.target.value)}
                      >
                        {!transaction.currency ? <option value="">N/A</option> : null}
                        {SUPPORTED_DISPLAY_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
                      </select>
                      {transaction.baseCurrency !== undefined ? (
                        <button type="button" className="transaction-use-automatic" onClick={() => setTransactionCurrency(key)}>
                          Restore {transaction.baseCurrency || 'N/A'}
                        </button>
                      ) : null}
                    </td>
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
      <nav aria-label="Transaction pages" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn" disabled={page === 1} onClick={() => changeFilter('page', String(page - 1))}>Previous</button>
        <span>Page {page} of {pageCount}</span>
        <button className="btn" disabled={page >= pageCount} onClick={() => changeFilter('page', String(page + 1))}>Next</button>
      </nav>
    </div>
  );
}
