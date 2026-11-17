import { Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import { SUPPORTED_DISPLAY_CURRENCIES } from '../lib/utils';
import AppLogo from './AppLogo';
import CurrencyBadge from './CurrencyBadge';
import GlobalSearch from './GlobalSearch';
import UtilityMenu from './UtilityMenu';

export default function TopBar() {
  const { data, setDisplayCurrency, setThemeMode, syncStatus } = useAppContext();

  return (
    <header className="new-topbar">
      <Link to="/app" className="topbar-brand" aria-label="SimpleSafeBanking overview">
        <span className="topbar-brand-mark">
          <AppLogo size={25} />
        </span>
        <strong>SimpleSafeBanking</strong>
      </Link>
      <GlobalSearch />
      <div className="new-topbar-actions">
        <span className={`sync-indicator ${syncStatus.phase}`} title={syncStatus.message}>
          <span />{' '}
          {syncStatus.phase === 'auth-required'
            ? 'Sync locked'
            : !syncStatus.enabled
              ? 'Saved locally'
              : syncStatus.phase === 'synced'
                ? 'Saved to server'
                : syncStatus.phase === 'syncing'
                  ? 'Syncing…'
                  : 'Needs attention'}
        </span>
        <label className="compact-currency">
          <CurrencyBadge currency={data.displayCurrency} />
          <select
            value={data.displayCurrency}
            onChange={(event) => setDisplayCurrency(event.target.value)}
            aria-label="Display currency"
          >
            {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          onClick={() => setThemeMode(data.themeMode === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${data.themeMode === 'dark' ? 'light' : 'dark'} theme`}
        >
          {data.themeMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <UtilityMenu />
      </div>
    </header>
  );
}
