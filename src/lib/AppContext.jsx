/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { appReducer } from './appState';
import { fetchLatestFxRates } from './fxService';
import { saveLocalAppState, loadLocalAppState } from './persistence';
import { runtimeConfig } from './runtimeConfig';
import { getCurrencySummary } from './selectors';
import {
  AppDataSchema,
  PersistedAppStateSchema,
  sanitizePersistedAppState,
} from './validation';
import {
  getConflictSnapshot,
  getRemoteLogicalUpdatedAt,
  isVersionConflict,
  loadServerSnapshot,
  saveServerSnapshot,
} from './serverSync';
import { txKey } from './csvParser';
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
      if (signal?.aborted || isVersionConflict(error)) throw error;
      if (attempt === 2) break;
      await wait(400 * (attempt + 1));
    }
  }

  throw lastError || new Error('Private server sync failed');
}

export function AppProvider({ children }) {
  const [initialLoad] = useState(() => loadLocalAppState(LS_KEY));
  const [appState, dispatch] = useReducer(appReducer, initialLoad.persistedState);
  const [runtimeIssues, setRuntimeIssues] = useState(initialLoad.issues);
  const [fxRuntime, setFxRuntime] = useState({
    status: runtimeConfig.fxRefreshEnabled ? 'idle' : 'disabled',
    message: runtimeConfig.fxRefreshEnabled ? '' : 'FX refresh disabled for this deployment profile.',
  });
  const [syncRuntime, setSyncRuntime] = useState(() => (
    runtimeConfig.privateSyncEnabled
      ? { phase: 'syncing', enabled: true, message: 'Checking private server sync...' }
      : { phase: 'local-only', enabled: false, message: 'Running in client-only mode.' }
  ));

  const persistedStateRef = useRef(appState);
  const saveTimerRef = useRef(null);
  const saveRequestRef = useRef(null);
  const syncReadyRef = useRef(!runtimeConfig.privateSyncEnabled);
  const lastSyncedLocalUpdatedAtRef = useRef(0);

  useEffect(() => {
    persistedStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    try {
      saveLocalAppState(LS_KEY, appState);
    } catch (error) {
      console.error('Failed to save data to local storage', error);
      appendIssue(setRuntimeIssues, 'local-save-failed');
    }
  }, [appState]);

  useEffect(() => {
    document.documentElement.dataset.theme = appState.data.themeMode || 'light';
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

    let cancelled = false;
    const controller = new AbortController();

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

        if (remoteState && serverTime >= localTime) {
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
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          console.warn('Private server sync unavailable:', error.message);
          setSyncRuntime({
            phase: 'sync-delayed',
            enabled: true,
            message: 'Private server sync is unavailable. Local mode remains active.',
          });
        }
      } finally {
        syncReadyRef.current = true;
      }
    }

    void bootstrapPrivateSync();

    return () => {
      cancelled = true;
      controller.abort();
      syncReadyRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!runtimeConfig.privateSyncEnabled) return undefined;

    const lastUpdated = appState.data.lastUpdated || 0;
    if (!lastUpdated) return undefined;
    if (!syncReadyRef.current) return undefined;
    if (lastSyncedLocalUpdatedAtRef.current === lastUpdated) return undefined;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      const snapshot = persistedStateRef.current;

      if (saveRequestRef.current) {
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

        if (isVersionConflict(error)) {
          const conflict = getConflictSnapshot(error);
          const remoteLogicalUpdatedAt = getRemoteLogicalUpdatedAt(conflict);

          if (snapshot.data.lastUpdated > remoteLogicalUpdatedAt) {
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
                phase: 'conflict-retried-local-winner',
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
              phase: 'conflict-resolved-from-server',
              enabled: true,
              message: 'A sync conflict occurred. The server state was restored because it was newer.',
            });
            return;
          }
        }

        console.warn('Private server sync failed:', error.message);
        setSyncRuntime({
          phase: 'sync-delayed',
          enabled: true,
          message: 'Private server sync is delayed. Local changes remain safe in this browser.',
        });
      } finally {
        if (saveRequestRef.current === controller) {
          saveRequestRef.current = null;
        }
      }
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveRequestRef.current) {
        saveRequestRef.current.abort();
        saveRequestRef.current = null;
      }
    };
  }, [appState]);

  const data = appState.data;
  const currencySummary = getCurrencySummary(data.transactions);
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

  const setTransactions = (transactions) => dispatch({ type: 'set_transactions', transactions });

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

  return (
    <AppContext.Provider
      value={{
        data,
        persistedState: appState,
        runtimeConfig,
        runtimeIssues,
        syncStatus,
        fxStatus,
        currencySummary,
        addTransactions: setTransactions,
        updateTransactionCategory: (transactionKey, category, subcategory) => dispatch({
          type: 'update_transaction_category',
          transactionKey,
          category,
          subcategory,
          getTransactionKey: txKey,
        }),
        updateCustomVendor: (vendorName, category, subcategory) => dispatch({
          type: 'update_custom_vendor',
          vendorName,
          category,
          subcategory,
        }),
        removeCustomVendor: (vendorName) => dispatch({ type: 'remove_custom_vendor', vendorName }),
        addAccount: (name, currency, monthlyContribution) => dispatch({
          type: 'add_account',
          name,
          currency,
          monthlyContribution,
        }),
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
        updateAccountContribution: (accountId, contribution) => dispatch({
          type: 'update_account_contribution',
          accountId,
          contribution,
        }),
        removeAccount: (accountId) => dispatch({ type: 'remove_account', accountId }),
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
        addGoal: (goal) => dispatch({ type: 'add_goal', goal }),
        removeGoal: (goalId) => dispatch({ type: 'remove_goal', goalId }),
        importBackup: (nextData) => dispatch({ type: 'import_backup', nextData }),
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
