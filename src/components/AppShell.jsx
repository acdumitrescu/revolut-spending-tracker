import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import MixedCurrencyNotice from './MixedCurrencyNotice';
import MobileNavigation from './MobileNavigation';
import SideNavigation from './SideNavigation';
import TopBar from './TopBar';

export default function AppShell() {
  const { currencySummary } = useAppContext();
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);

  return (
    <div className={`new-app-shell${navigationCollapsed ? ' nav-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <TopBar />
      <SideNavigation
        collapsed={navigationCollapsed}
        onToggle={() => setNavigationCollapsed((current) => !current)}
      />
      <main className="new-content-scroll" id="main-content">
        {currencySummary.hasMixedCurrencies && (
          <MixedCurrencyNotice currencies={currencySummary.currencies} />
        )}
        <Outlet />
      </main>
      <MobileNavigation />
    </div>
  );
}
