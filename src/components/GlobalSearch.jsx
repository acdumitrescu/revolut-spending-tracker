import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Store, Tags, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { buildSearchResults } from '../lib/globalSearch';

const RESULT_ICONS = {
  transaction: Search,
  vendor: Store,
  category: Tags,
};

export default function GlobalSearch() {
  const { data } = useAppContext();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => buildSearchResults(data.transactions, query), [data.transactions, query]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="global-search">
      <Search size={17} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search transactions, vendors, categories"
        aria-label="Search transactions, vendors, and categories"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {query ? (
        <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
          <X size={15} />
        </button>
      ) : (
        <kbd>⌘K</kbd>
      )}

      {open && query.length >= 2 && (
        <div className="search-results" role="listbox" aria-label="Search results">
          {results.length ? results.map((result) => {
            const Icon = RESULT_ICONS[result.type];
            return (
              <Link key={result.id} to={result.to} className="search-result" role="option" onClick={() => setOpen(false)}>
                <span className="search-result-icon"><Icon size={16} /></span>
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.meta}</small>
                </span>
              </Link>
            );
          }) : (
            <div className="search-empty">No matching activity yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
