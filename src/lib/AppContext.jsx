/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrencySummary } from './selectors';
import { sanitizeAppData } from './validation';
import { BASE_CURRENCY, DEFAULT_FX_RATES, normalizeFxRates, SUPPORTED_DISPLAY_CURRENCIES } from './fx';

const AppContext = createContext(null);

const LS_KEY = 'simple_safe_banking_data';
const FX_API_URL = 'https://api.frankfurter.dev/v2/rates?base=RON&quotes=EUR,USD';

const initialState = {
  transactions: [],
  customVendors: {},
  accounts: [],
  budgets: {},
  goals: [],
  baseCurrency: BASE_CURRENCY,
  displayCurrency: BASE_CURRENCY,
  themeMode: 'light',
  fxRates: DEFAULT_FX_RATES,
  fxUpdatedAt: null,
  fxSource: 'manual-default',
  lastUpdated: null,
};

async function fetchLatestFxRates() {
  const response = await fetch(FX_API_URL);
  if (!response.ok) {
    throw new Error(`FX refresh failed with status ${response.status}`);
  }

  const payload = await response.json();
  const nextRates = normalizeFxRates(payload?.rates);
  return {
    fxRates: nextRates,
    fxUpdatedAt: Date.now(),
    fxSource: 'Frankfurter',
  };
}

export function AppProvider({ children }) {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return sanitizeAppData(parsed);
      }
    } catch (e) {
      console.error('Failed to load data from localStorage', e);
    }
    return initialState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data to localStorage (quota may be exceeded):', e);
      // Optionally, we could trigger a UI warning here in the future
    }
  }, [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = data.themeMode || 'light';
    document.documentElement.style.colorScheme = data.themeMode === 'dark' ? 'dark' : 'light';
  }, [data.themeMode]);

  const updateTimestamp = (prev) => ({ ...prev, lastUpdated: Date.now() });
  const currencySummary = getCurrencySummary(data.transactions);
  const fxStatus = {
    source: data.fxSource || 'manual-default',
    updatedAt: data.fxUpdatedAt,
    hasManualRates: Boolean(data.fxRates?.EUR && data.fxRates?.USD),
  };

  const addTransactions = (newTxns) => {
    setData((prev) => updateTimestamp({
      ...prev,
      transactions: newTxns,
    }));
  };

  const updateCustomVendor = (vendorName, category, subcategory) => {
    setData((prev) => updateTimestamp({
      ...prev,
      customVendors: {
        ...prev.customVendors,
        [vendorName]: [category, subcategory],
      },
    }));
  };

  const removeCustomVendor = (vendorName) => {
    setData((prev) => {
      const nextVendors = { ...prev.customVendors };
      delete nextVendors[vendorName];
      return updateTimestamp({
        ...prev,
        customVendors: nextVendors,
      });
    });
  };

  const addAccount = (name, currency = BASE_CURRENCY, monthlyContribution = 0) => {
    setData((prev) => updateTimestamp({
      ...prev,
      accounts: [
        ...prev.accounts,
        { id: Date.now().toString(), name, currency, balances: {}, monthlyContribution: Number(monthlyContribution) || 0 },
      ],
    }));
  };

  const updateAccountCurrency = (accountId, currency) => {
    if (!SUPPORTED_DISPLAY_CURRENCIES.includes(currency)) return;
    setData((prev) => updateTimestamp({
      ...prev,
      accounts: prev.accounts.map((acc) =>
        acc.id === accountId
          ? { ...acc, currency }
          : acc
      ),
    }));
  };

  const updateAccountContribution = (accountId, contribution) => {
    setData((prev) => updateTimestamp({
      ...prev,
      accounts: prev.accounts.map((acc) =>
        acc.id === accountId
          ? { ...acc, monthlyContribution: Number(contribution) || 0 }
          : acc
      ),
    }));
  };

  const updateAccountBalance = (accountId, month, balance) => {
    setData((prev) => updateTimestamp({
      ...prev,
      accounts: prev.accounts.map((acc) =>
        acc.id === accountId
          ? { ...acc, balances: { ...acc.balances, [month]: parseFloat(balance) || 0 } }
          : acc
      ),
    }));
  };
  
  const removeAccount = (accountId) => {
    setData(prev => updateTimestamp({
      ...prev,
      accounts: prev.accounts.filter(a => a.id !== accountId)
    }));
  };

  const setBudget = (month, category, amount) => {
    setData(prev => updateTimestamp({
      ...prev,
      budgets: {
        ...prev.budgets,
        [month]: {
          ...(prev.budgets[month] || {}),
          [category]: Number(amount) || 0,
        },
      },
    }));
  };

  const removeBudget = (month, category) => {
    setData(prev => {
      const updated = { ...prev.budgets };
      const monthBudgets = { ...(updated[month] || {}) };
      delete monthBudgets[category];
      if (Object.keys(monthBudgets).length === 0) {
        delete updated[month];
      } else {
        updated[month] = monthBudgets;
      }
      return updateTimestamp({ ...prev, budgets: updated });
    });
  };

  const addGoal = (goal) => {
    setData((prev) => updateTimestamp({
      ...prev,
      goals: [...prev.goals, goal],
    }));
  };

  const removeGoal = (goalId) => {
    setData((prev) => updateTimestamp({
      ...prev,
      goals: prev.goals.filter((goal) => goal.id !== goalId),
    }));
  };

  const importBackup = (nextData) => {
    setData(updateTimestamp(sanitizeAppData(nextData)));
  };

  const setDisplayCurrency = (currency) => {
    if (!SUPPORTED_DISPLAY_CURRENCIES.includes(currency)) return;
    setData((prev) => ({
      ...prev,
      displayCurrency: currency,
    }));
  };

  const setThemeMode = (themeMode) => {
    if (!['light', 'dark'].includes(themeMode)) return;
    setData((prev) => ({
      ...prev,
      themeMode,
    }));
  };

  const setFxRates = (rates, source = 'manual') => {
    setData((prev) => ({
      ...prev,
      fxRates: normalizeFxRates({
        ...prev.fxRates,
        ...rates,
      }),
      fxUpdatedAt: Date.now(),
      fxSource: source,
    }));
  };

  const refreshFxRates = async () => {
    const nextFxState = await fetchLatestFxRates();
    setData((prev) => ({
      ...prev,
      ...nextFxState,
    }));
    return nextFxState;
  };

  const clearData = () => {
    setData({ ...initialState, lastUpdated: Date.now() });
  };

  useEffect(() => {
    let cancelled = false;

    async function refreshOnLoad() {
      try {
        const nextFxState = await fetchLatestFxRates();
        if (cancelled) return;
        setData((prev) => ({
          ...prev,
          ...nextFxState,
        }));
      } catch (error) {
        console.warn('Failed to refresh FX rates on load', error);
      }
    }

    void refreshOnLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        data,
        addTransactions,
        updateCustomVendor,
        removeCustomVendor,
        addAccount,
        updateAccountCurrency,
        updateAccountBalance,
        updateAccountContribution,
        removeAccount,
        setBudget,
        removeBudget,
        addGoal,
        removeGoal,
        importBackup,
        setDisplayCurrency,
        setThemeMode,
        setFxRates,
        refreshFxRates,
        currencySummary,
        fxStatus,
        clearData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
