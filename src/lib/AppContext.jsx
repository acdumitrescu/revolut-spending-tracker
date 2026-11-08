/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { appReducer, createPersistedAppState } from './appState';
import { fetchLatestFxRates } from './fxService';
import { saveLocalAppState, loadLocalAppState } from './persistence';
import { runtimeConfig } from './runtimeConfig';
import { getCurrencySummary } from './selectors';
import {
  AppDataSchema,
  MoneyFlowSchema,
  SubscriptionSchema,
  CarListingSchema,
  CreditRecordSchema,
  CardPurchaseSchema,
  PersistedAppStateSchema,
  sanitizePersistedAppState,
} from './validation';
import {
  clearSyncAccessToken,
  createPrivateBackup,
  getConflictSnapshot,
  getRemoteLogicalUpdatedAt,
  hasPrivateSyncAccess,
  isVersionConflict,
  loadServerSnapshot,
  saveServerSnapshot,
  setSyncAccessToken,
  shouldLoadRemoteAtBootstrap,
} from './serverSync';
import { mergeTransactions, txKey } from './csvParser';
import { resolveTransactionCategories } from './transactionCategories';
import { prepareBrdImport } from './brdStatement';
import {
  loadVendorObservations,
  recordVendorObservations as persistVendorObservations,
  resolveVendorObservation as persistVendorObservationResolution,
} from './vendorObservations';

const AppContext = createContext(null);

const LS_KEY = 'simple_safe_banking_state_v1';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function appendIssue(setter, issue) {
  setter((current) => (current.includes(issue) ? current : [...current, issue]));
}

function isValidRemoteState(rawState) {
  return PersistedAppStateSchema.safeParse(rawState).success || AppDataSchema.safeParse(rawState).success;
}

async function saveSnapshotWithRetry(persistedState, version, signal) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await saveServerSnapshot(persistedState, version, signal);
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error?.status === 401 || isVersionConflict(error)) throw error;
      if (attempt === 2) break;
      await wait(400 * (attempt + 1));
    }
  }

  throw lastError || new Error('Private server sync failed');
}

export function AppProvider({ children }) {
  const [initialLoad] = useState(() => runtimeConfig.encryptedStorage
    ? { persistedState: createPersistedAppState(), issues: [] }
    : loadLocalAppState(LS_KEY));
  const [appState, dispatch] = useReducer(appReducer, initialLoad.persistedState);
  const [runtimeIssues, setRuntimeIssues] = useState(initialLoad.issues);
  const [fxRuntime, setFxRuntime] = useState({
    status: runtimeConfig.fxRefreshEnabled ? 'idle' : 'disabled',
    message: runtimeConfig.fxRefreshEnabled ? '' : 'FX refresh disabled for this deployment profile.',
  });
  const [syncRuntime, setSyncRuntime] = useState(() => (
    runtimeConfig.privateSyncEnabled
      ? hasPrivateSyncAccess()
        ? { phase: 'syncing', enabled: true, message: 'Checking private server sync...' }
        : { phase: 'auth-required', enabled: true, message: 'Unlock private sync in Settings.' }
      : { phase: 'local-only', enabled: false, message: 'Running in client-only mode.' }
  ));
  const [syncAuthRevision, setSyncAuthRevision] = useState(0);
  const [databaseLoaded, setDatabaseLoaded] = useState(!runtimeConfig.encryptedStorage);

  const persistedStateRef = useRef(appState);
  const saveTimerRef = useRef(null);
  const saveRequestRef = useRef(null);
  const syncReadyRef = useRef(!runtimeConfig.privateSyncEnabled);
  const lastSyncedLocalUpdatedAtRef = useRef(0);

  useEffect(() => {
    persistedStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    if (runtimeConfig.privateSyncAutoAuth) clearSyncAccessToken();
  }, []);

  useEffect(() => {
    if (runtimeConfig.encryptedStorage) return;
    try {
      saveLocalAppState(LS_KEY, appState);
    } catch (error) {
      console.error('Failed to save data to local storage', error);
      appendIssue(setRuntimeIssues, 'local-save-failed');
    }
  }, [appState]);

  useEffect(() => {
    document.documentElement.dataset.theme = appState.data.themeMode || 'dark';
    document.documentElement.style.colorScheme = appState.data.themeMode === 'dark' ? 'dark' : 'light';
  }, [appState.data.themeMode]);

  useEffect(() => {
    if (!runtimeConfig.fxRefreshEnabled) return undefined;

    let cancelled = false;
    const controller = new AbortController();

    async function refreshOnLoad() {
      setFxRuntime({
        status: 'refreshing',
        message: 'Refreshing latest FX rates...',
      });

      try {
        const nextFxState = await fetchLatestFxRates({ signal: controller.signal });
        if (cancelled) return;
        dispatch({
          type: 'set_fx_rates',
          rates: nextFxState.fxRates,
          source: nextFxState.fxSource,
        });
        setFxRuntime({
          status: 'ready',
          message: 'Latest FX rates loaded.',
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.warn('Failed to refresh FX rates on load', error);
        setFxRuntime({
          status: 'degraded',
          message: 'FX refresh unavailable. Saved local rates remain active.',
        });
      }
    }

    void refreshOnLoad();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!runtimeConfig.privateSyncEnabled) return undefined;
    if (!hasPrivateSyncAccess()) {
      syncReadyRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let canSave = false;
    const controller = new AbortController();
    syncReadyRef.current = false;

    async function bootstrapPrivateSync() {
      setSyncRuntime({
        phase: 'syncing',
        enabled: true,
        message: 'Checking private server sync...',
      });

      try {
        const snapshot = await loadServerSnapshot(controller.signal);
        if (cancelled) return;

        if (snapshot.data && !isValidRemoteState(snapshot.data)) {
          appendIssue(setRuntimeIssues, 'corrupted-remote-state');
          setSyncRuntime({
            phase: 'sync-delayed',
            enabled: true,
            message: 'Remote state was ignored because it could not be validated.',
          });
          return;
        }

        const remoteState = snapshot.data ? sanitizePersistedAppState(snapshot.data) : null;
        const serverTime = getRemoteLogicalUpdatedAt(snapshot);
        const localTime = persistedStateRef.current.data.lastUpdated || 0;

        if (shouldLoadRemoteAtBootstrap(remoteState, persistedStateRef.current, serverTime)) {
          lastSyncedLocalUpdatedAtRef.current = remoteState.data.lastUpdated || serverTime;
          dispatch({ type: 'replace_state', payload: remoteState.data });
          dispatch({
            type: 'set_sync_info',
            syncInfo: {
              lastSuccessfulSyncAt: Date.now(),
              lastRemoteVersion: snapshot.version,
              lastRemoteUpdatedAt: snapshot.remoteServerUpdatedAt || null,
            },
          });
          setSyncRuntime({
            phase: 'synced',
            enabled: true,
            message: 'Private server state loaded.',
          });
        } else if (localTime > 0) {
          const saved = await saveSnapshotWithRetry(persistedStateRef.current, snapshot.version, controller.signal);
          lastSyncedLocalUpdatedAtRef.current = persistedStateRef.current.data.lastUpdated || localTime;
          dispatch({
            type: 'set_sync_info',
            syncInfo: {
              lastSuccessfulSyncAt: Date.now(),
              lastRemoteVersion: saved.version,
              lastRemoteUpdatedAt: saved.remoteServerUpdatedAt || null,
            },
          });
          setSyncRuntime({
            phase: 'synced',
            enabled: true,
            message: 'Local state synced to your private server.',
          });
        } else {
          setSyncRuntime({
            phase: 'synced',
            enabled: true,
            message: 'Private server sync is ready.',
          });
        }
        canSave = true;
        setDatabaseLoaded(true);
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          if (error?.status === 401) {
            if (!runtimeConfig.privateSyncAutoAuth) clearSyncAccessToken();
            setSyncRuntime({
              phase: 'auth-required',
              enabled: true,
              message: runtimeConfig.privateSyncAutoAuth
                ? 'Automatic local sync authentication is unavailable. Restart with ssb start.'
                : 'Private sync token was rejected. Unlock it again in Settings.',
            });
            return;
          }
          console.warn('Private server sync unavailable:', error.message);
          setSyncRuntime({
            phase: 'sync-delayed',
            enabled: true,
            message: runtimeConfig.encryptedStorage ? 'Encrypted database unavailable. Do not edit or close unsaved work.' : 'Private server sync is unavailable. Local mode remains active.',
          });
        }
      } finally {
        syncReadyRef.current = canSave;
      }
    }

    void bootstrapPrivateSync();

    return () => {
      cancelled = true;
      controller.abort();
      syncReadyRef.current = false;
    };
  }, [syncAuthRevision]);

  useEffect(() => {
    if (!runtimeConfig.encryptedStorage) return;
    const warn = (event) => {
      if (persistedStateRef.current.data.lastUpdated !== lastSyncedLocalUpdatedAtRef.current) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    if (!runtimeConfig.privateSyncEnabled) return undefined;
    if (!hasPrivateSyncAccess()) return undefined;

    const lastUpdated = appState.data.lastUpdated || 0;
    if (!lastUpdated) return undefined;
    if (!syncReadyRef.current) return undefined;
    if (lastSyncedLocalUpdatedAtRef.current === lastUpdated) return undefined;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const snapshot = persistedStateRef.current;

      if (saveRequestRef.current) {
        if (runtimeConfig.encryptedStorage) return;
        saveRequestRef.current.abort();
      }

      const controller = new AbortController();
      saveRequestRef.current = controller;

      setSyncRuntime({
        phase: 'syncing',
        enabled: true,
        message: 'Syncing your latest local changes...',
      });

      try {
        const saved = await saveSnapshotWithRetry(
          snapshot,
          snapshot.data.syncInfo?.lastRemoteVersion || 0,
          controller.signal
        );
        lastSyncedLocalUpdatedAtRef.current = snapshot.data.lastUpdated || 0;
        dispatch({
          type: 'set_sync_info',
          syncInfo: {
            lastSuccessfulSyncAt: Date.now(),
            lastRemoteVersion: saved.version,
            lastRemoteUpdatedAt: saved.remoteServerUpdatedAt || null,
          },
        });
        setSyncRuntime({
          phase: 'synced',
          enabled: true,
          message: 'Private server sync is up to date.',
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error?.status === 401) {
          if (!runtimeConfig.privateSyncAutoAuth) clearSyncAccessToken();
          syncReadyRef.current = false;
          setSyncRuntime({
            phase: 'auth-required',
            enabled: true,
            message: runtimeConfig.privateSyncAutoAuth
              ? 'Automatic local sync authentication is unavailable. Restart with ssb start.'
              : 'Private sync token expired or was rejected. Unlock it again in Settings.',
          });
          return;
        }

        if (isVersionConflict(error)) {
          const conflict = getConflictSnapshot(error);
          const remoteLogicalUpdatedAt = getRemoteLogicalUpdatedAt(conflict);

          if (!runtimeConfig.encryptedStorage && snapshot.data.lastUpdated > remoteLogicalUpdatedAt) {
            try {
              const retried = await saveSnapshotWithRetry(snapshot, conflict.version, controller.signal);
              lastSyncedLocalUpdatedAtRef.current = snapshot.data.lastUpdated || 0;
              dispatch({
                type: 'set_sync_info',
                syncInfo: {
                  lastSuccessfulSyncAt: Date.now(),
                  lastRemoteVersion: retried.version,
                  lastRemoteUpdatedAt: retried.remoteServerUpdatedAt || null,
                },
              });
              setSyncRuntime({
                phase: 'synced',
                enabled: true,
                message: 'A sync conflict occurred. Your newer local changes were kept.',
              });
              return;
            } catch (retryError) {
              if (!controller.signal.aborted) {
                console.warn('Private server sync retry failed:', retryError.message);
              }
            }
          }

          if (conflict.data && isValidRemoteState(conflict.data)) {
            let conflictBackup;
            if (runtimeConfig.encryptedStorage) {
              try {
                conflictBackup = await createPrivateBackup(persistedStateRef.current, 'recovery');
              } catch {
                setSyncRuntime({ phase: 'sync-delayed', enabled: true, message: 'A database conflict occurred. Your unsaved edits remain in this tab because a recovery backup could not be created. Export a recovery copy before reloading.' });
                return;
              }
            }
            const conflictState = sanitizePersistedAppState(conflict.data);
            lastSyncedLocalUpdatedAtRef.current = conflictState.data.lastUpdated || remoteLogicalUpdatedAt;
            dispatch({ type: 'replace_state', payload: conflictState.data });
            dispatch({
              type: 'set_sync_info',
              syncInfo: {
                lastSuccessfulSyncAt: Date.now(),
                lastRemoteVersion: conflict.version,
                lastRemoteUpdatedAt: conflict.remoteServerUpdatedAt || null,
              },
            });
            setSyncRuntime({
              phase: 'synced',
              enabled: true,
              message: conflictBackup ? `A database conflict occurred. Your unsaved edits were preserved in ${conflictBackup.filename}; the current server state is now loaded.` : 'A sync conflict occurred. The server state was restored because it was newer.',
            });
            return;
          }
        }

        console.warn('Private server sync failed:', error.message);
        setSyncRuntime({
          phase: 'sync-delayed',
          enabled: true,
          message: runtimeConfig.encryptedStorage ? 'Database save failed. Changes are only in memory; keep this tab open and export a recovery copy.' : 'Private server sync is delayed. Local changes remain safe in this browser.',
        });
      } finally {
        if (saveRequestRef.current === controller) {
          saveRequestRef.current = null;
        }
      }
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveRequestRef.current && !runtimeConfig.encryptedStorage) {
        saveRequestRef.current.abort();
        saveRequestRef.current = null;
      }
    };
  }, [appState]);

  const resumeUserSession = async () => {
    const snapshot = await loadServerSnapshot();
    if (!snapshot.data || !isValidRemoteState(snapshot.data)) throw new Error('Unable to validate this user’s saved workspace');
    const current = persistedStateRef.current;
    let message = '';
    if (snapshot.version !== current.data.syncInfo?.lastRemoteVersion) {
      if ((current.data.lastUpdated || 0) !== lastSyncedLocalUpdatedAtRef.current) {
        const backup = await createPrivateBackup(current, 'recovery');
        message = `Another save changed this workspace. Your unsaved edits were preserved in ${backup.filename}; the current saved workspace is loaded.`;
      }
      const remote = sanitizePersistedAppState(snapshot.data);
      lastSyncedLocalUpdatedAtRef.current = remote.data.lastUpdated || getRemoteLogicalUpdatedAt(snapshot);
      dispatch({ type: 'replace_state', payload: remote.data });
    }
    syncReadyRef.current = true;
    dispatch({ type: 'set_sync_info', syncInfo: { lastSuccessfulSyncAt: Date.now(), lastRemoteVersion: snapshot.version, lastRemoteUpdatedAt: snapshot.remoteServerUpdatedAt || null } });
    setSyncRuntime({ phase: 'synced', enabled: true, message: message || 'User unlocked. Pending edits can now be saved.' });
    return message;
  };

  // Locking hides/inerts the workspace before calling this. Wait for an in-flight
  // save, then commit the latest draft using its exact server revision.
  const flushPendingChanges = useCallback(async () => {
    if (!runtimeConfig.localUsers) return;
    if (!syncReadyRef.current) throw new Error('Workspace is not ready to save');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const deadline = Date.now() + 15000;
    while (saveRequestRef.current) {
      if (Date.now() >= deadline) throw new Error('Save is still pending');
      await wait(50);
    }
    await wait(0); // allow the completed save's revision to render
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = persistedStateRef.current;
    if ((snapshot.data.lastUpdated || 0) === lastSyncedLocalUpdatedAtRef.current) return;
    const controller = new AbortController();
    saveRequestRef.current = controller;
    try {
      const saved = await saveSnapshotWithRetry(snapshot, snapshot.data.syncInfo?.lastRemoteVersion || 0, controller.signal);
      lastSyncedLocalUpdatedAtRef.current = snapshot.data.lastUpdated || 0;
      dispatch({ type: 'set_sync_info', syncInfo: { lastSuccessfulSyncAt: Date.now(), lastRemoteVersion: saved.version, lastRemoteUpdatedAt: saved.remoteServerUpdatedAt || null } });
    } finally { saveRequestRef.current = null; }
  }, []);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveRequestRef.current) saveRequestRef.current.abort();
  }, []);

  const effectiveTransactions = useMemo(() => resolveTransactionCategories(
    appState.data.transactions,
    appState.data.customVendors
  ), [appState.data.transactions, appState.data.customVendors]);
  const data = useMemo(() => ({
    ...appState.data,
    transactions: effectiveTransactions,
  }), [appState.data, effectiveTransactions]);
  const currencySummary = useMemo(
    () => getCurrencySummary(effectiveTransactions),
    [effectiveTransactions]
  );
  const fxStatus = {
    source: data.fxSource || 'manual-default',
    updatedAt: data.fxUpdatedAt,
    hasManualRates: Boolean(data.fxRates?.EUR && data.fxRates?.USD),
    ...fxRuntime,
  };
  const syncStatus = {
    ...syncRuntime,
    deploymentProfile: runtimeConfig.deploymentProfile,
    lastSuccessfulSyncAt: data.syncInfo?.lastSuccessfulSyncAt || null,
    lastRemoteVersion: data.syncInfo?.lastRemoteVersion || 0,
    lastRemoteUpdatedAt: data.syncInfo?.lastRemoteUpdatedAt || null,
  };

  const addTransactions = (transactions) => dispatch({
    type: 'set_transactions',
    transactions: mergeTransactions(persistedStateRef.current.data.transactions, transactions),
  });

  const commitTransactionImport = async ({ fileName, transactions, summary, batchId: requestedBatchId, isDemo = false }) => {
    const batchId = requestedBatchId || globalThis.crypto?.randomUUID?.()
      || `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const action = {
      type: 'commit_transaction_import',
      batchId,
      fileName,
      transactions,
      summary,
      importedAt: Date.now(),
      updatedAt: Date.now(),
    };
    let backup = null;

    if (runtimeConfig.privateBackupEnabled && !isDemo) {
      const nextState = appReducer(persistedStateRef.current, action);
      backup = await createPrivateBackup(nextState, 'import', batchId);
    }

    dispatch(action);
    return { batchId, backup };
  };

  const createBackupNow = () => createPrivateBackup(
    persistedStateRef.current,
    'manual'
  );

  const commitBrdStatement = async (request) => {
    if (runtimeConfig.privateSyncEnabled && !syncReadyRef.current) throw new Error('Wait for private sync before importing.');
    await flushPendingChanges();
    const base = persistedStateRef.current;
    const prepared = prepareBrdImport(base.data, request);
    const next = createPersistedAppState({ ...base.data, moneyFlow: prepared.moneyFlow, accounts: prepared.accounts, lastUpdated: Date.now() });
    if (runtimeConfig.privateBackupEnabled) {
      await createPrivateBackup(base, 'recovery');
      await createPrivateBackup(next, 'import', `brd-${crypto.randomUUID()}`);
    }
    if (persistedStateRef.current.data.lastUpdated !== base.data.lastUpdated) throw new Error('Workspace changed while preparing the backup. Review and retry the import.');
    dispatch({ type: 'replace_state', payload: next.data });
    return { added: prepared.added, duplicates: prepared.duplicates };
  };

  const refreshFxRates = async () => {
    setFxRuntime({
      status: 'refreshing',
      message: 'Refreshing latest FX rates...',
    });

    try {
      const nextFxState = await fetchLatestFxRates();
      dispatch({
        type: 'set_fx_rates',
        rates: nextFxState.fxRates,
        source: nextFxState.fxSource,
      });
      setFxRuntime({
        status: 'ready',
        message: 'Latest FX rates loaded.',
      });
      return nextFxState;
    } catch (error) {
      console.error(error);
      setFxRuntime({
        status: 'degraded',
        message: 'FX refresh unavailable. Saved local rates remain active.',
      });
      throw error;
    }
  };

  const unlockPrivateSync = (token) => {
    setSyncAccessToken(token);
    syncReadyRef.current = false;
    setSyncRuntime({
      phase: 'syncing',
      enabled: true,
      message: 'Checking private sync token...',
    });
    setSyncAuthRevision((revision) => revision + 1);
  };

  const lockPrivateSync = () => {
    clearSyncAccessToken();
    syncReadyRef.current = false;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveRequestRef.current) saveRequestRef.current.abort();
    setSyncRuntime({
      phase: 'auth-required',
      enabled: true,
      message: 'Private sync is locked. Local data remains available.',
    });
    setSyncAuthRevision((revision) => revision + 1);
  };

  return (
    <AppContext.Provider
      value={{
        data,
        persistedState: appState,
        runtimeConfig,
        runtimeIssues,
        syncStatus,
        flushPendingChanges,
        resumeUserSession,
        unlockPrivateSync,
        lockPrivateSync,
        fxStatus,
        currencySummary,
        upsertSubscription: (subscription) => dispatch({ type: 'upsert_subscription', subscription: SubscriptionSchema.parse(subscription) }),
        upsertCarListing: (listing) => dispatch({ type: 'upsert_car_listing', listing: CarListingSchema.parse(listing) }),
        removeCarListing: (id) => dispatch({ type: 'remove_car_listing', id }),
        setMoneyFlow: (moneyFlow) => dispatch({ type: 'set_money_flow', moneyFlow: MoneyFlowSchema.parse(moneyFlow) }),
        commitBrdStatement,
        upsertCardPurchase: (accountId, purchase) => dispatch({ type: 'upsert_card_purchase', accountId, purchase: CardPurchaseSchema.parse(purchase) }),
        archiveCardPurchase: (accountId, purchaseId) => dispatch({ type: 'archive_card_purchase', accountId, purchaseId }),
        deleteCardPurchase: (accountId, purchaseId) => dispatch({ type: 'delete_card_purchase', accountId, purchaseId }),
        reopenCardPurchase: (accountId, purchaseId) => dispatch({ type: 'reopen_card_purchase', accountId, purchaseId }),
        upsertCreditRecord: (record) => {
          const validated = CreditRecordSchema.parse(record);
          if (validated.kind === 'card' && !persistedStateRef.current.data.accounts.some((account) => account.id === validated.accountId)) {
            throw new Error('The linked account no longer exists. Choose an account again.');
          }
          dispatch({ type: 'upsert_credit_record', record: validated });
        },
        removeCreditRecord: (id) => dispatch({ type: 'remove_credit_record', id }),
        addTransactions,
        commitTransactionImport,
        createBackupNow,
        undoTransactionImport: (batchId) => dispatch({
          type: 'undo_transaction_import',
          batchId,
          undoneAt: Date.now(),
        }),
        updateTransactionCategory: (transactionKey, category, subcategory) => dispatch({
          type: 'update_transaction_category',
          transactionKey,
          category,
          subcategory,
          getTransactionKey: txKey,
        }),
        clearTransactionCategoryOverride: (transactionKey, baseCategory, baseSubcategory) => dispatch({
          type: 'clear_transaction_category_override',
          transactionKey,
          baseCategory,
          baseSubcategory,
          getTransactionKey: txKey,
        }),
        setTransactionCurrency: (transactionKey, currency) => dispatch({
          type: 'set_transaction_currency',
          transactionKey,
          currency,
          getTransactionKey: txKey,
        }),
        updateCustomVendor: (vendorName, category, subcategory) => dispatch({
          type: 'update_custom_vendor',
          vendorName,
          category,
          subcategory,
        }),
        removeCustomVendor: (vendorName) => dispatch({ type: 'remove_custom_vendor', vendorName }),
        addAccount: (name, currency) => dispatch({
          type: 'add_account',
          name,
          currency,
        }),
        setAccountGroup: (accountId, group) => dispatch({type:'set_account_group',accountId,group}),
        undoAccountBalance: (accountId, month, previous, expected) => dispatch({type:'undo_account_balance',accountId,month,previous,expected}),
        updateAccountCurrency: (accountId, currency) => dispatch({
          type: 'update_account_currency',
          accountId,
          currency,
        }),
        updateAccountBalance: (accountId, month, balance) => dispatch({
          type: 'update_account_balance',
          accountId,
          month,
          balance,
        }),
        updateAccountNote: (accountId, month, note) => dispatch({
          type: 'update_account_note',
          accountId,
          month,
          note,
        }),
        removeAccount: (accountId) => dispatch({ type: 'remove_account', accountId }),
        upsertPortfolioHolding: (holding) => dispatch({ type: 'upsert_portfolio_holding', holding }),
        removePortfolioHolding: (holdingId) => dispatch({ type: 'remove_portfolio_holding', holdingId }),
        setBudget: (month, category, amount) => dispatch({
          type: 'set_budget',
          month,
          category,
          amount,
        }),
        removeBudget: (month, category) => dispatch({
          type: 'remove_budget',
          month,
          category,
        }),
        copyBudgets: (sourceMonth, targetMonth) => dispatch({
          type: 'copy_budgets',
          sourceMonth,
          targetMonth,
        }),
        addGoal: (goal) => dispatch({ type: 'add_goal', goal }),
        removeGoal: (goalId) => dispatch({ type: 'remove_goal', goalId }),
        updateGoal: (goalId, changes) => dispatch({ type: 'update_goal', goalId, changes }),
        moveGoal: (goalId, direction) => dispatch({ type: 'move_goal', goalId, direction }),
        addGoalContribution: (goalId, contribution) => dispatch({ type: 'add_goal_contribution', goalId, contribution }),
        removeGoalContribution: (goalId, contributionId) => dispatch({ type: 'remove_goal_contribution', goalId, contributionId }),
        importBackup: async (nextData, expectedUpdatedAt) => {
          if (expectedUpdatedAt !== undefined && persistedStateRef.current.data.lastUpdated !== expectedUpdatedAt) {
            throw new Error('Workspace changed while preparing recovery. Review the backup and try again.');
          }
          const validated = AppDataSchema.parse(nextData);
          // A failed recovery write must prevent replacement. Keep this independent
          // of the normal state key so the next persistence effect cannot overwrite it.
          if (runtimeConfig.encryptedStorage) {
            await createPrivateBackup(persistedStateRef.current, 'manual');
            if (expectedUpdatedAt !== undefined && persistedStateRef.current.data.lastUpdated !== expectedUpdatedAt) throw new Error('Workspace changed during recovery backup; try again.');
          } else saveLocalAppState(`${LS_KEY}_before_restore`, persistedStateRef.current);
          dispatch({ type: 'import_backup', nextData: validated });
        },
        recordImportSummary: (fileName, summary) => dispatch({
          type: 'record_import_summary',
          fileName,
          summary,
        }),
        setDisplayCurrency: (currency) => dispatch({ type: 'set_display_currency', currency }),
        setThemeMode: (themeMode) => dispatch({ type: 'set_theme_mode', themeMode }),
        setFxRates: (rates, source = 'manual') => dispatch({ type: 'set_fx_rates', rates, source }),
        refreshFxRates,
        loadVendorObservations: (signal) => loadVendorObservations(signal),
        recordVendorObservations: (observations, signal) => persistVendorObservations(observations, signal),
        resolveVendorObservation: (resolution, signal) => persistVendorObservationResolution(resolution, signal),
        clearData: () => dispatch({ type: 'clear_data' }),
      }}
    >
      {databaseLoaded ? children : <main className="card"><h2>Opening encrypted workspace</h2><p>{syncRuntime.message}</p><button className="btn" onClick={() => setSyncAuthRevision((value) => value + 1)}>Retry database connection</button></main>}
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
