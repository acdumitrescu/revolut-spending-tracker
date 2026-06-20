import { Outlet } from 'react-router-dom';
import { useAppContext } from '../lib/AppContext';
import MixedCurrencyNotice from './MixedCurrencyNotice';
import MobileNavigation from './MobileNavigation';
import SideNavigation from './SideNavigation';
import TopBar from './TopBar';

export default function AppShell() {
  const { currencySummary } = useAppContext();

  return (
    <div className="new-app-shell">
      <SideNavigation />
      <div className="new-main-column">
        <TopBar />
        <main className="new-content-scroll" id="main-content">
          {currencySummary.hasMixedCurrencies && (
            <MixedCurrencyNotice currencies={currencySummary.currencies} compact />
          )}
          <Outlet />
        </main>
      </div>
      <MobileNavigation />
    </div>
  );
}
