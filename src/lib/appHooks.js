import { useAppContext } from './AppContext';

export function useTransactions() {
  const context = useAppContext();
  return {
    transactions: context.data.transactions,
    customVendors: context.data.customVendors,
    addTransactions: context.addTransactions,
    updateTransactionCategory: context.updateTransactionCategory,
    recordImportSummary: context.recordImportSummary,
  };
}

export function usePlanning() {
  const context = useAppContext();
  return {
    budgets: context.data.budgets,
    goals: context.data.goals,
    setBudget: context.setBudget,
    removeBudget: context.removeBudget,
    addGoal: context.addGoal,
    removeGoal: context.removeGoal,
  };
}

export function useDisplaySettings() {
  const context = useAppContext();
  return {
    displayCurrency: context.data.displayCurrency,
    themeMode: context.data.themeMode,
    fxRates: context.data.fxRates,
    setDisplayCurrency: context.setDisplayCurrency,
    setThemeMode: context.setThemeMode,
  };
}
