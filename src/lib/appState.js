import { BASE_CURRENCY, DEFAULT_FX_RATES, normalizeFxRates, SUPPORTED_DISPLAY_CURRENCIES } from './fx';
import { APP_STATE_SCHEMA_VERSION, sanitizePersistedAppState } from './validation';

export function createInitialAppData() {
  return {
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
    importMeta: {
      latestSummary: null,
    },
    syncInfo: {
      lastSuccessfulSyncAt: null,
      lastRemoteVersion: 0,
      lastRemoteUpdatedAt: null,
    },
    lastUpdated: null,
  };
}

export function createPersistedAppState(data, exportedAt = null) {
  if (data === undefined) {
    return sanitizePersistedAppState({
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      exportedAt,
      data: createInitialAppData(),
    });
  }
  return sanitizePersistedAppState({
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    exportedAt,
    data,
  });
}

function withTimestamp(data) {
  return {
    ...data,
    lastUpdated: Date.now(),
  };
}

function cloneSyncInfo(data, updates = {}) {
  return {
    ...data,
    syncInfo: {
      ...data.syncInfo,
      ...updates,
    },
  };
}

export function appReducer(state, action) {
  const data = state.data;

  switch (action.type) {
    case 'replace_state':
      return createPersistedAppState(action.payload, state.exportedAt);
    case 'set_transactions':
      return createPersistedAppState(withTimestamp({
        ...data,
        transactions: action.transactions,
      }), state.exportedAt);
    case 'update_transaction_category':
      return createPersistedAppState(withTimestamp({
        ...data,
        transactions: data.transactions.map((transaction) => (
          action.transactionKey === action.getTransactionKey(transaction)
            ? {
              ...transaction,
              cat: action.category,
              sub: action.subcategory,
            }
            : transaction
        )),
      }), state.exportedAt);
    case 'update_custom_vendor':
      return createPersistedAppState(withTimestamp({
        ...data,
        customVendors: {
          ...data.customVendors,
          [action.vendorName]: [action.category, action.subcategory],
        },
      }), state.exportedAt);
    case 'remove_custom_vendor': {
      const nextVendors = { ...data.customVendors };
      delete nextVendors[action.vendorName];
      return createPersistedAppState(withTimestamp({
        ...data,
        customVendors: nextVendors,
      }), state.exportedAt);
    }
    case 'add_account':
      return createPersistedAppState(withTimestamp({
        ...data,
        accounts: [
          ...data.accounts,
          {
            id: Date.now().toString(),
            name: action.name,
            currency: action.currency || BASE_CURRENCY,
            balances: {},
            monthlyContribution: Number(action.monthlyContribution) || 0,
          },
        ],
      }), state.exportedAt);
    case 'update_account_currency':
      if (!SUPPORTED_DISPLAY_CURRENCIES.includes(action.currency)) return state;
      return createPersistedAppState(withTimestamp({
        ...data,
        accounts: data.accounts.map((account) => (
          account.id === action.accountId ? { ...account, currency: action.currency } : account
        )),
      }), state.exportedAt);
    case 'update_account_contribution':
      return createPersistedAppState(withTimestamp({
        ...data,
        accounts: data.accounts.map((account) => (
          account.id === action.accountId
            ? { ...account, monthlyContribution: Number(action.contribution) || 0 }
            : account
        )),
      }), state.exportedAt);
    case 'update_account_balance':
      return createPersistedAppState(withTimestamp({
        ...data,
        accounts: data.accounts.map((account) => (
          account.id === action.accountId
            ? { ...account, balances: { ...account.balances, [action.month]: Number.parseFloat(action.balance) || 0 } }
            : account
        )),
      }), state.exportedAt);
    case 'remove_account':
      return createPersistedAppState(withTimestamp({
        ...data,
        accounts: data.accounts.filter((account) => account.id !== action.accountId),
      }), state.exportedAt);
    case 'set_budget':
      return createPersistedAppState(withTimestamp({
        ...data,
        budgets: {
          ...data.budgets,
          [action.month]: {
            ...(data.budgets[action.month] || {}),
            [action.category]: Number(action.amount) || 0,
          },
        },
      }), state.exportedAt);
    case 'remove_budget': {
      const updated = { ...data.budgets };
      const monthBudgets = { ...(updated[action.month] || {}) };
      delete monthBudgets[action.category];
      if (Object.keys(monthBudgets).length === 0) {
        delete updated[action.month];
      } else {
        updated[action.month] = monthBudgets;
      }
      return createPersistedAppState(withTimestamp({
        ...data,
        budgets: updated,
      }), state.exportedAt);
    }
    case 'add_goal':
      return createPersistedAppState(withTimestamp({
        ...data,
        goals: [...data.goals, action.goal],
      }), state.exportedAt);
    case 'remove_goal':
      return createPersistedAppState(withTimestamp({
        ...data,
        goals: data.goals.filter((goal) => goal.id !== action.goalId),
      }), state.exportedAt);
    case 'import_backup':
      return createPersistedAppState(withTimestamp(action.nextData), state.exportedAt);
    case 'set_display_currency':
      if (!SUPPORTED_DISPLAY_CURRENCIES.includes(action.currency)) return state;
      return createPersistedAppState(withTimestamp({
        ...data,
        displayCurrency: action.currency,
      }), state.exportedAt);
    case 'set_theme_mode':
      if (!['light', 'dark'].includes(action.themeMode)) return state;
      return createPersistedAppState(withTimestamp({
        ...data,
        themeMode: action.themeMode,
      }), state.exportedAt);
    case 'set_fx_rates':
      return createPersistedAppState(withTimestamp({
        ...data,
        fxRates: normalizeFxRates({
          ...data.fxRates,
          ...action.rates,
        }),
        fxUpdatedAt: Date.now(),
        fxSource: action.source,
      }), state.exportedAt);
    case 'record_import_summary':
      return createPersistedAppState(withTimestamp({
        ...data,
        importMeta: {
          ...data.importMeta,
          latestSummary: {
            fileName: action.fileName,
            importedAt: Date.now(),
            ...action.summary,
          },
        },
      }), state.exportedAt);
    case 'set_sync_info':
      return createPersistedAppState(cloneSyncInfo(data, action.syncInfo), state.exportedAt);
    case 'clear_data':
      return createPersistedAppState({
        ...createInitialAppData(),
        lastUpdated: Date.now(),
      }, state.exportedAt);
    default:
      return state;
  }
}
