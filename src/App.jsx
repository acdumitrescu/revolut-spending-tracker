import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import HubLayout from './components/HubLayout';
import { AppProvider } from './lib/AppContext';
import { ToastProvider } from './components/Toast';
import LocalUsersGate from './components/LocalUsersGate';
import LocalUserControls from './components/LocalUserControls';
import { runtimeConfig } from './lib/runtimeConfig';

const Layout = lazy(() => import('./components/Layout'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const Overview = lazy(() => import('./pages/Overview'));
const Monthly = lazy(() => import('./pages/Monthly'));
const Categories = lazy(() => import('./pages/Categories'));
const Vendors = lazy(() => import('./pages/Vendors'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Accounts = lazy(() => import('./pages/Accounts'));
const MoneyFlow = lazy(() => import('./pages/MoneyFlow'));
const Credit = lazy(() => import('./pages/Credit'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Forecast = lazy(() => import('./pages/Forecast'));
const RentCalculator = lazy(() => import('./pages/RentCalculator'));
const CarLease = lazy(() => import('./pages/CarLease'));
const Budget = lazy(() => import('./pages/Budget'));
const Heatmap = lazy(() => import('./pages/Heatmap'));
const Goals = lazy(() => import('./pages/Goals'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const ImportWorkspace = lazy(() => import('./pages/ImportWorkspace'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function Page({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="page-stack"><div className="section-note">Loading...</div></div>}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <LocalUsersGate><AppProvider>
      <LocalUserControls />
      <div id="user-workspace">
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={runtimeConfig.privateSyncAutoAuth
              ? <Navigate to="/app" replace />
              : <Page><LandingPage /></Page>} />
            <Route path="/app" element={<Page><Layout /></Page>}>
              <Route index element={<Page><Overview /></Page>} />
              <Route path="activity" element={<HubLayout hubId="activity" />}>
                <Route index element={<Navigate to="transactions" replace />} />
                <Route path="transactions" element={<Page><Transactions /></Page>} />
                <Route path="monthly" element={<Page><Monthly /></Page>} />
                <Route path="subscriptions" element={<Page><Subscriptions /></Page>} />
                <Route path="recurring" element={<Navigate to="/app/activity/subscriptions" replace />} />
              </Route>
              <Route path="planning" element={<HubLayout hubId="planning" />}>
                <Route index element={<Navigate to="budget" replace />} />
                <Route path="budget" element={<Page><Budget /></Page>} />
                <Route path="goals" element={<Page><Goals /></Page>} />
                <Route path="forecast" element={<Page><Forecast /></Page>} />
                <Route path="rent" element={<Page><RentCalculator /></Page>} />
                <Route path="car-lease" element={<Page><CarLease /></Page>} />
              </Route>
              <Route path="insights" element={<HubLayout hubId="insights" />}>
                <Route index element={<Navigate to="categories" replace />} />
                <Route path="categories" element={<Page><Categories /></Page>} />
                <Route path="vendors" element={<Page><Vendors /></Page>} />
                <Route path="heatmap" element={<Page><Heatmap /></Page>} />
              </Route>
              <Route path="accounts" element={<HubLayout hubId="accounts" />}>
                <Route index element={<Navigate to="balances" replace />} />
                <Route path="balances" element={<Page><Accounts /></Page>} />
                <Route path="income" element={<Page><MoneyFlow /></Page>} />
                <Route path="credit" element={<Page><Credit /></Page>} />
                <Route path="portfolio" element={<Page><Portfolio /></Page>} />
              </Route>
              <Route path="import" element={<Page><ImportWorkspace /></Page>} />
              <Route path="settings" element={<Page><SettingsPage /></Page>} />
              <Route path="monthly" element={<Navigate to="/app/activity/monthly" replace />} />
              <Route path="categories" element={<Navigate to="/app/insights/categories" replace />} />
              <Route path="vendors" element={<Navigate to="/app/insights/vendors" replace />} />
              <Route path="transactions" element={<Navigate to="/app/activity/transactions" replace />} />
              <Route path="budget" element={<Navigate to="/app/planning/budget" replace />} />
              <Route path="heatmap" element={<Navigate to="/app/insights/heatmap" replace />} />
              <Route path="forecast" element={<Navigate to="/app/planning/forecast" replace />} />
              <Route path="rent" element={<Navigate to="/app/planning/rent" replace />} />
              <Route path="goals" element={<Navigate to="/app/planning/goals" replace />} />
              <Route path="recurring" element={<Navigate to="/app/activity/subscriptions" replace />} />
            </Route>
            <Route path="/monthly" element={<Navigate to="/app/activity/monthly" replace />} />
            <Route path="/categories" element={<Navigate to="/app/insights/categories" replace />} />
            <Route path="/vendors" element={<Navigate to="/app/insights/vendors" replace />} />
            <Route path="/transactions" element={<Navigate to="/app/activity/transactions" replace />} />
            <Route path="/accounts" element={<Navigate to="/app/accounts/balances" replace />} />
            <Route path="/budget" element={<Navigate to="/app/planning/budget" replace />} />
            <Route path="/heatmap" element={<Navigate to="/app/insights/heatmap" replace />} />
            <Route path="/forecast" element={<Navigate to="/app/planning/forecast" replace />} />
            <Route path="/rent" element={<Navigate to="/app/planning/rent" replace />} />
            <Route path="/goals" element={<Navigate to="/app/planning/goals" replace />} />
            <Route path="/recurring" element={<Navigate to="/app/activity/subscriptions" replace />} />
            <Route path="*" element={<Navigate to={runtimeConfig.privateSyncAutoAuth ? '/app' : '/'} replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
      </div>
    </AppProvider></LocalUsersGate>
  );
}

export default App;
