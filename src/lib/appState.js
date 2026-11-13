import { ACCOUNT_GROUPS } from '../../backend/accountGroups.js';
import {
  BASE_CURRENCY,
  DEFAULT_FX_RATES,
  normalizeFxRates,
  SUPPORTED_DISPLAY_CURRENCIES,
} from './fx';
import {
  APP_STATE_SCHEMA_VERSION,
  SubscriptionSchema,
  CarListingSchema,
  MoneyFlowSchema,
  CardPurchaseSchema,
  CreditRecordSchema,
  GoalSchema,
  sanitizePersistedAppState,
} from './validation';

export function createInitialAppData() {
  return {
    transactions: [],
    customVendors: {},
    accounts: [],
    creditRecords: [],
    subscriptions: [],
    carListings: [],
    moneyFlow: { incomes: [], transfers: [] },
    portfolioHoldings: [],
    budgets: {},
    goals: [],
    baseCurrency: BASE_CURRENCY,
    displayCurrency: BASE_CURRENCY,
    themeMode: 'dark',
    fxRates: DEFAULT_FX_RATES,
    fxUpdatedAt: null,
    fxSource: 'manual-default',
    importMeta: {
      latestSummary: null,
      history: [],
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

function createUpdatedPersistedAppState(state, nextData) {
  const persistedState = createPersistedAppState(nextData, state.exportedAt);

  return {
    ...persistedState,
    data: {
      ...persistedState.data,
      transactions:
        nextData.transactions === state.data.transactions
          ? state.data.transactions
          : persistedState.data.transactions,
      customVendors:
        nextData.customVendors === state.data.customVendors
          ? state.data.customVendors
          : persistedState.data.customVendors,
    },
  };
}

export function appReducer(state, action) {
  const data = state.data;

  switch (action.type) {
    case 'upsert_subscription': {
      const parsed = SubscriptionSchema.safeParse(action.subscription);
      if (!parsed.success) return state;
      const records = data.subscriptions || [];
      const exists = records.some((record) => record.id === parsed.data.id);
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          subscriptions: exists
            ? records.map((record) => (record.id === parsed.data.id ? parsed.data : record))
            : [...records, parsed.data],
        }),
      );
    }
    case 'upsert_car_listing': {
      const parsed = CarListingSchema.safeParse(action.listing);
      if (!parsed.success) return state;
      const records = data.carListings || [];
      const exists = records.some((record) => record.id === parsed.data.id);
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          carListings: exists
            ? records.map((record) => (record.id === parsed.data.id ? parsed.data : record))
            : [...records, parsed.data],
        }),
      );
    }
    case 'remove_car_listing':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          carListings: (data.carListings || []).filter((record) => record.id !== action.id),
        }),
      );
    case 'set_money_flow': {
      const result = MoneyFlowSchema.safeParse(action.moneyFlow);
      if (!result.success) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({ ...data, moneyFlow: result.data }),
      );
    }
    case 'delete_card_purchase': {
      const card = data.creditRecords?.find(
        (record) => record.kind === 'card' && record.accountId === action.accountId,
      );
      if (!card?.purchases?.some((item) => item.id === action.purchaseId)) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          creditRecords: data.creditRecords.map((record) =>
            record.id === card.id
              ? {
                  ...record,
                  purchases: record.purchases.filter((item) => item.id !== action.purchaseId),
                }
              : record,
          ),
        }),
      );
    }
    case 'upsert_card_purchase':
    case 'archive_card_purchase':
    case 'reopen_card_purchase': {
      const existing = (data.creditRecords || []).find(
        (record) => record.kind === 'card' && record.accountId === action.accountId,
      );
      if (!existing && !data.accounts.some((account) => account.id === action.accountId))
        return state;
      const card =
        existing ||
        CreditRecordSchema.parse({
          id: `card:${action.accountId}`,
          kind: 'card',
          accountId: action.accountId,
        });
      const purchases = card.purchases || [];
      let nextPurchases;
      if (action.type === 'upsert_card_purchase') {
        const parsed = CardPurchaseSchema.safeParse(action.purchase);
        if (!parsed.success || parsed.data.status !== 'active') return state;
        if (purchases.some((item) => item.id === parsed.data.id && item.status === 'archived'))
          return state;
        nextPurchases = purchases.some((item) => item.id === parsed.data.id)
          ? purchases.map((item) => (item.id === parsed.data.id ? parsed.data : item))
          : [...purchases, parsed.data];
      } else {
        const item = purchases.find((purchase) => purchase.id === action.purchaseId);
        if (!item) return state;
        const archive = action.type === 'archive_card_purchase';
        if (
          archive &&
          (item.status !== 'active' || item.remainingBalance !== 0 || item.remainingMonths !== 0)
        )
          return state;
        const updated = CardPurchaseSchema.safeParse({
          ...item,
          status: archive ? 'archived' : 'active',
          archivedAt: archive ? Date.now() : null,
        });
        if (!updated.success) return state;
        nextPurchases = purchases.map((purchase) =>
          purchase.id === item.id ? updated.data : purchase,
        );
      }
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          creditRecords: [
            ...(data.creditRecords || []).filter((record) => record.id !== card.id),
            { ...card, purchases: nextPurchases },
          ],
        }),
      );
    }
    case 'upsert_credit_record': {
      const parsed = CreditRecordSchema.safeParse(action.record);
      if (!parsed.success) return state;
      const record = parsed.data;
      const existing = (data.creditRecords || []).find(
        (item) =>
          item.id === record.id ||
          (record.kind === 'card' && item.kind === 'card' && item.accountId === record.accountId),
      );
      if (
        existing?.kind === 'card' &&
        existing.purchases?.length &&
        (record.kind !== 'card' || record.accountId !== existing.accountId)
      )
        return state;
      if (record.kind === 'card') record.purchases = existing?.purchases || [];
      if (
        record.kind === 'card' &&
        !data.accounts.some((account) => account.id === record.accountId)
      )
        return state;
      const records = (data.creditRecords || []).filter(
        (item) =>
          item.id !== record.id &&
          !(record.kind === 'card' && item.kind === 'card' && item.accountId === record.accountId),
      );
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({ ...data, creditRecords: [...records, record] }),
      );
    }
    case 'remove_credit_record':
      if (
        data.creditRecords?.some(
          (record) => record.id === action.id && record.kind === 'card' && record.purchases?.length,
        )
      )
        return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          creditRecords: (data.creditRecords || []).filter((record) => record.id !== action.id),
        }),
      );
    case 'replace_state':
      return createPersistedAppState(action.payload, state.exportedAt);
    case 'set_transactions':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          transactions: action.transactions,
        }),
      );
    case 'commit_transaction_import': {
      const importedAt = action.importedAt ?? Date.now();
      const summaryRecord = {
        fileName: action.fileName,
        importedAt,
        batchId: action.batchId,
        ...action.summary,
      };
      const historyRecord = {
        ...summaryRecord,
        status: 'active',
        undoneAt: null,
      };
      return createUpdatedPersistedAppState(state, {
        ...data,
        transactions: [
          ...data.transactions,
          ...action.transactions.map((transaction) => ({
            ...transaction,
            importBatchId: action.batchId,
          })),
        ].sort((a, b) => a.date.localeCompare(b.date)),
        importMeta: {
          ...data.importMeta,
          latestSummary: summaryRecord,
          history: [historyRecord, ...(data.importMeta?.history || [])].slice(0, 20),
        },
        lastUpdated: action.updatedAt ?? Date.now(),
      });
    }
    case 'undo_transaction_import': {
      const history = data.importMeta?.history || [];
      const target = history.find(
        (entry) => entry.batchId === action.batchId && entry.status === 'active',
      );
      if (!target) return state;
      const updatedHistory = history.map((entry) =>
        entry.batchId === action.batchId
          ? { ...entry, status: 'undone', undoneAt: action.undoneAt ?? Date.now() }
          : entry,
      );
      const latestActiveImport = updatedHistory.find((entry) => entry.status === 'active') || null;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          transactions: data.transactions.filter(
            (transaction) => transaction.importBatchId !== action.batchId,
          ),
          importMeta: {
            ...data.importMeta,
            latestSummary: latestActiveImport,
            history: updatedHistory,
          },
        }),
      );
    }
    case 'update_transaction_category':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          transactions: data.transactions.map((transaction) =>
            action.transactionKey === action.getTransactionKey(transaction)
              ? {
                  ...transaction,
                  baseCat: transaction.baseCat || transaction.cat,
                  baseSub: transaction.baseSub || transaction.sub || '',
                  cat: action.category,
                  sub: action.subcategory,
                  manualCat: action.category,
                  manualSub: action.subcategory,
                  manualCategoryUpdatedAt: Date.now(),
                }
              : transaction,
          ),
        }),
      );
    case 'clear_transaction_category_override':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          transactions: data.transactions.map((transaction) => {
            if (action.transactionKey !== action.getTransactionKey(transaction)) return transaction;
            const rest = { ...transaction };
            delete rest.manualCat;
            delete rest.manualSub;
            delete rest.manualCategoryUpdatedAt;
            return {
              ...rest,
              baseCat: action.baseCategory || transaction.baseCat || transaction.cat,
              baseSub: action.baseSubcategory || transaction.baseSub || '',
              cat: action.baseCategory || transaction.baseCat || transaction.cat,
              sub: action.baseSubcategory || transaction.baseSub || '',
            };
          }),
        }),
      );
    case 'set_transaction_currency': // action.currency omitted = restore the imported currency
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          transactions: data.transactions.map((transaction) => {
            if (action.transactionKey !== action.getTransactionKey(transaction)) return transaction;
            const { baseCurrency, currency, ...rest } = transaction;
            if (action.currency)
              return {
                ...rest,
                baseCurrency: baseCurrency ?? currency ?? '',
                currency: action.currency,
              };
            return baseCurrency === undefined
              ? transaction
              : { ...rest, ...(baseCurrency && { currency: baseCurrency }) };
          }),
        }),
      );
    case 'update_custom_vendor':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          customVendors: {
            ...data.customVendors,
            [action.vendorName]: [action.category, action.subcategory],
          },
        }),
      );
    case 'remove_custom_vendor': {
      const nextVendors = { ...data.customVendors };
      delete nextVendors[action.vendorName];
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          customVendors: nextVendors,
        }),
      );
    }
    case 'add_account':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          accounts: [
            ...data.accounts,
            {
              id: Date.now().toString(),
              name: action.name,
              currency: action.currency || BASE_CURRENCY,
              balances: {},
              notes: {},
            },
          ],
        }),
      );
    case 'set_account_group':
      if (!ACCOUNT_GROUPS.includes(action.group)) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          accounts: data.accounts.map((account) =>
            account.id === action.accountId ? { ...account, group: action.group } : account,
          ),
        }),
      );
    case 'undo_account_balance': {
      const account = data.accounts.find((row) => row.id === action.accountId);
      if (!account || (account.balances[action.month] ?? null) !== action.expected) return state;
      return appReducer(state, {
        type: 'update_account_balance',
        accountId: action.accountId,
        month: action.month,
        balance: action.previous,
      });
    }
    case 'update_account_currency':
      if (!SUPPORTED_DISPLAY_CURRENCIES.includes(action.currency)) return state;
      // Recorded amounts must never be silently re-denominated.
      if (
        data.creditRecords?.some(
          (record) =>
            record.kind === 'card' &&
            record.accountId === action.accountId &&
            record.purchases?.length,
        )
      )
        return state;
      if (
        data.accounts.some(
          (account) => account.id === action.accountId && Object.keys(account.balances).length,
        )
      )
        return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          accounts: data.accounts.map((account) =>
            account.id === action.accountId ? { ...account, currency: action.currency } : account,
          ),
        }),
      );
    case 'update_account_balance': {
      const blank = action.balance === '' || action.balance === null;
      const balance = Number(action.balance);
      if (!blank && !Number.isFinite(balance)) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          accounts: data.accounts.map((account) => {
            if (account.id !== action.accountId) return account;
            const balances = { ...account.balances };
            if (blank) delete balances[action.month];
            else balances[action.month] = balance;
            return { ...account, balances };
          }),
        }),
      );
    }
    case 'update_account_note':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          accounts: data.accounts.map((account) => {
            if (account.id !== action.accountId) return account;
            const notes = { ...(account.notes || {}) };
            const note = String(action.note || '');
            if (note.trim()) notes[action.month] = note;
            else delete notes[action.month];
            return { ...account, notes };
          }),
        }),
      );
    case 'remove_account':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          accounts: data.accounts.filter((account) => account.id !== action.accountId),
        }),
      );
    case 'upsert_portfolio_holding': {
      const holdings = Array.isArray(data.portfolioHoldings) ? data.portfolioHoldings : [];
      const exists = holdings.some((holding) => holding.id === action.holding.id);
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          portfolioHoldings: exists
            ? holdings.map((holding) =>
                holding.id === action.holding.id ? action.holding : holding,
              )
            : [...holdings, action.holding],
        }),
      );
    }
    case 'remove_portfolio_holding':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          portfolioHoldings: (data.portfolioHoldings || []).filter(
            (holding) => holding.id !== action.holdingId,
          ),
        }),
      );
    case 'set_budget':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          budgets: {
            ...data.budgets,
            [action.month]: {
              ...(data.budgets[action.month] || {}),
              [action.category]: Number(action.amount) || 0,
            },
          },
        }),
      );
    case 'remove_budget': {
      const updated = { ...data.budgets };
      const monthBudgets = { ...(updated[action.month] || {}) };
      delete monthBudgets[action.category];
      if (Object.keys(monthBudgets).length === 0) {
        delete updated[action.month];
      } else {
        updated[action.month] = monthBudgets;
      }
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          budgets: updated,
        }),
      );
    }
    case 'copy_budgets': {
      const sourceBudgets = data.budgets[action.sourceMonth] || {};
      const targetBudgets = data.budgets[action.targetMonth] || {};
      const missingBudgets = Object.fromEntries(
        Object.entries(sourceBudgets).filter(([category]) => !(category in targetBudgets)),
      );
      if (Object.keys(missingBudgets).length === 0) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          budgets: {
            ...data.budgets,
            [action.targetMonth]: {
              ...missingBudgets,
              ...targetBudgets,
            },
          },
        }),
      );
    }
    case 'add_goal': {
      const parsed = GoalSchema.safeParse(action.goal);
      if (!parsed.success) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({ ...data, goals: [...data.goals, parsed.data] }),
      );
    }
    case 'update_goal': {
      const existing = data.goals.find((goal) => goal.id === action.goalId);
      if (!existing) return state;
      const parsed = GoalSchema.safeParse({ ...existing, ...action.changes, id: existing.id });
      if (!parsed.success) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          goals: data.goals.map((goal) => (goal.id === existing.id ? parsed.data : goal)),
        }),
      );
    }
    case 'move_goal': {
      const index = data.goals.findIndex((goal) => goal.id === action.goalId);
      const target = index + (action.direction < 0 ? -1 : 1);
      if (index < 0 || target < 0 || target >= data.goals.length) return state;
      const goals = [...data.goals];
      [goals[index], goals[target]] = [goals[target], goals[index]];
      return createUpdatedPersistedAppState(state, withTimestamp({ ...data, goals }));
    }
    case 'add_goal_contribution':
    case 'remove_goal_contribution': {
      const existing = data.goals.find((goal) => goal.id === action.goalId);
      if (!existing) return state;
      const contributions =
        action.type === 'add_goal_contribution'
          ? [...(existing.contributions || []), action.contribution]
          : (existing.contributions || []).filter((entry) => entry.id !== action.contributionId);
      const parsed = GoalSchema.safeParse({ ...existing, contributions });
      if (!parsed.success) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          goals: data.goals.map((goal) => (goal.id === existing.id ? parsed.data : goal)),
        }),
      );
    }
    case 'remove_goal':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          goals: data.goals.filter((goal) => goal.id !== action.goalId),
        }),
      );
    case 'import_backup':
      // A portable backup's server revision is not the current server revision.
      return createPersistedAppState(
        withTimestamp({ ...action.nextData, syncInfo: data.syncInfo }),
        state.exportedAt,
      );
    case 'set_display_currency':
      if (!SUPPORTED_DISPLAY_CURRENCIES.includes(action.currency)) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          displayCurrency: action.currency,
        }),
      );
    case 'set_theme_mode':
      if (!['light', 'dark'].includes(action.themeMode)) return state;
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          themeMode: action.themeMode,
        }),
      );
    case 'set_fx_rates':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          fxRates: normalizeFxRates({
            ...data.fxRates,
            ...action.rates,
          }),
          fxUpdatedAt: Date.now(),
          fxSource: action.source,
        }),
      );
    case 'record_import_summary':
      return createUpdatedPersistedAppState(
        state,
        withTimestamp({
          ...data,
          importMeta: {
            ...data.importMeta,
            latestSummary: {
              fileName: action.fileName,
              importedAt: Date.now(),
              ...action.summary,
            },
          },
        }),
      );
    case 'set_sync_info':
      return createUpdatedPersistedAppState(state, cloneSyncInfo(data, action.syncInfo));
    case 'clear_data':
      return createPersistedAppState(
        {
          ...createInitialAppData(),
          lastUpdated: Date.now(),
        },
        state.exportedAt,
      );
    default:
      return state;
  }
}
