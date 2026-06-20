import { Moon, Sun } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { SUPPORTED_DISPLAY_CURRENCIES } from '../lib/utils';
import CurrencyBadge from './CurrencyBadge';
import GlobalSearch from './GlobalSearch';
import UtilityMenu from './UtilityMenu';

export default function TopBar() {
  const { data, setDisplayCurrency, setThemeMode, syncStatus } = useAppContext();

  return (
    <header className="new-topbar">
      <GlobalSearch />
      <div className="new-topbar-actions">
        <span className={`sync-indicator ${syncStatus.status}`} title={syncStatus.message}>
          <span /> {syncStatus.enabled ? 'Private sync' : 'Local'}
        </span>
        <label className="compact-currency">
          <CurrencyBadge currency={data.displayCurrency} />
          <select
            value={data.displayCurrency}
            onChange={(event) => setDisplayCurrency(event.target.value)}
            aria-label="Display currency"
          >
            {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          onClick={() => setThemeMode(data.themeMode === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${data.themeMode === 'dark' ? 'light' : 'dark'} theme`}
        >
          {data.themeMode === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <UtilityMenu />
      </div>
    </header>
  );
}
