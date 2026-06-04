import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Overview from './pages/Overview';
import Monthly from './pages/Monthly';
import Categories from './pages/Categories';
import Vendors from './pages/Vendors';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';
import Forecast from './pages/Forecast';
import Budget from './pages/Budget';
import Heatmap from './pages/Heatmap';
import Goals from './pages/Goals';
import Recurring from './pages/Recurring';
import { AppProvider } from './lib/AppContext';
import { ToastProvider } from './components/Toast';

function Page({ children }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ErrorBoundary><Layout /></ErrorBoundary>}>
              <Route index element={<Page><Overview /></Page>} />
              <Route path="monthly" element={<Page><Monthly /></Page>} />
              <Route path="categories" element={<Page><Categories /></Page>} />
              <Route path="vendors" element={<Page><Vendors /></Page>} />
              <Route path="transactions" element={<Page><Transactions /></Page>} />
<Route path="accounts" element={<Page><Accounts /></Page>} />
            <Route path="budget" element={<Page><Budget /></Page>} />
            <Route path="heatmap" element={<Page><Heatmap /></Page>} />
              <Route path="forecast" element={<Page><Forecast /></Page>} />
              <Route path="goals" element={<Page><Goals /></Page>} />
              <Route path="recurring" element={<Page><Recurring /></Page>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}

export default App;
