import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Store, Tags, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { buildSearchResults } from '../lib/globalSearch';

const RESULT_ICONS = {
  transaction: Search,
  vendor: Store,
  category: Tags,
};

export default function GlobalSearch() {
  const { data } = useAppContext();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = useMemo(() => buildSearchResults(data.transactions, query), [data.transactions, query]);
  const selectedIndex = results.length ? Math.min(Math.max(activeIndex, 0), results.length - 1) : -1;

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

  const handleKeyDown = (event) => {
    if (!open || query.length < 2 || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter' && selectedIndex >= 0) {
      event.preventDefault();
      setOpen(false);
      navigate(results[selectedIndex].to);
    }
  };

  return (
    <div className="global-search">
      <Search size={17} aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search transactions, vendors, categories"
        aria-label="Search transactions, vendors, and categories"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="global-search-results"
        aria-expanded={open}
        aria-activedescendant={selectedIndex >= 0 ? `global-search-result-${selectedIndex}` : undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
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
        <div id="global-search-results" className="search-results" role="listbox" aria-label="Search results">
          {results.length ? results.map((result, index) => {
            const Icon = RESULT_ICONS[result.type];
            return (
              <Link
                id={`global-search-result-${index}`}
                key={result.id}
                to={result.to}
                className={`search-result${selectedIndex === index ? ' active' : ''}`}
                role="option"
                aria-selected={selectedIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => setOpen(false)}
              >
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
