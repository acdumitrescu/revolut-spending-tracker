/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrencySummary } from './selectors';
import { sanitizeAppData } from './validation';

const AppContext = createContext(null);

const LS_KEY = 'simple_safe_banking_data';

const initialState = {
  transactions: [],
  customVendors: {},
  accounts: [],
  budgets: {},
  goals: [],
  displayCurrency: 'RON',
  lastUpdated: null,
};

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

  const updateTimestamp = (prev) => ({ ...prev, lastUpdated: Date.now() });
  const currencySummary = getCurrencySummary(data.transactions);

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

  const addAccount = (name, monthlyContribution = 0) => {
    setData((prev) => updateTimestamp({
      ...prev,
      accounts: [
        ...prev.accounts,
        { id: Date.now().toString(), name, balances: {}, monthlyContribution: Number(monthlyContribution) || 0 },
      ],
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
    setData((prev) => updateTimestamp({
      ...prev,
      displayCurrency: currency,
    }));
  };

  const clearData = () => {
    setData({ ...initialState, lastUpdated: Date.now() });
  };

  return (
    <AppContext.Provider
      value={{
        data,
        addTransactions,
        updateCustomVendor,
        removeCustomVendor,
        addAccount,
        updateAccountBalance,
        updateAccountContribution,
        removeAccount,
        setBudget,
        removeBudget,
        addGoal,
        removeGoal,
        importBackup,
        setDisplayCurrency,
        currencySummary,
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
