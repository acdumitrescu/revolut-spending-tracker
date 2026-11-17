// Shared helpers for the AppContext behaviour tests (appContext*.test.jsx).
// Everything here is synthetic: obviously fake names, amounts and tokens.
import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import { AppProvider, useAppContext } from '../../lib/AppContext';
import { createInitialAppData, createPersistedAppState } from '../../lib/appState';

export const LS_KEY = 'simple_safe_banking_state_v1';
export const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Every flag AppContext and its imports read, all off: plain client-only browser mode. */
export const CLIENT_ONLY_CONFIG = Object.freeze({
  deploymentProfile: 'client-only',
  isDesktop: false,
  privateSyncEnabled: false,
  privateSyncAutoAuth: false,
  localUsers: false,
  devAutoLogin: null,
  encryptedStorage: false,
  privateBackupEnabled: false,
  apiBasePath: '/api',
  fxRefreshEnabled: false,
  fxRefreshRetries: 1,
  fxRefreshRetryDelayMs: 10,
});

export const PRIVATE_SYNC_CONFIG = Object.freeze({
  ...CLIENT_ONLY_CONFIG,
  deploymentProfile: 'private-sync',
  privateSyncEnabled: true,
});

export function applyConfig(target, overrides = {}) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, overrides);
}

export function syntheticTransaction(overrides = {}) {
  return {
    date: '2026-01-05',
    ym: '2026-01',
    desc: 'Synthetic Corner Shop',
    cat: 'Other',
    sub: '',
    amt: -12.5,
    flow: 'Debit',
    type: 'Card Payment',
    currency: 'RON',
    ...overrides,
  };
}

export const syntheticSummary = {
  detectedProfileId: 'normalized-csv',
  detectedProfileLabel: 'Normalized CSV',
  totalRows: 1,
  processedRows: 1,
  skippedRows: 0,
  duplicateRows: 0,
  existingDuplicateRows: 0,
  fileDuplicateRows: 0,
  warnings: [],
  skippedReasonCounts: {},
  skippedDetails: [],
  validationCategories: {},
  unknownVendorCount: 0,
};

/** A saved workspace with user data, as the server or localStorage would hold it. */
export function syntheticWorkspace(overrides = {}) {
  return createPersistedAppState({
    ...createInitialAppData(),
    accounts: [
      {
        id: 'acc-fake',
        name: 'Fake Savings',
        currency: 'RON',
        balances: { '2026-01': 100 },
        notes: {},
      },
    ],
    lastUpdated: 1_000,
    ...overrides,
  });
}

/** In-memory replacement for the localStorage stub installed by setup.js. */
export function memoryLocalStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const storage = window.localStorage;
  storage.getItem.mockImplementation((key) => (values.has(key) ? values.get(key) : null));
  storage.setItem.mockImplementation((key, value) => values.set(key, String(value)));
  storage.removeItem.mockImplementation((key) => values.delete(key));
  storage.clear.mockImplementation(() => values.clear());
  return values;
}

export function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/**
 * Fake private server behind `fetch`. Each route is a function (request) => response or a
 * promise of one; tests replace routes to script failures. Unknown routes fail loudly.
 */
export function installFakeServer(routes = {}) {
  const calls = [];
  const server = { calls, routes: { ...routes } };
  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET';
    const path = String(url).replace(/^\/api/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    const request = { method, path, body, headers: init.headers || {}, signal: init.signal };
    calls.push(request);
    const handler = server.routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unexpected request ${method} ${path}`);
    if (init.signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    return handler(request);
  });
  vi.stubGlobal('fetch', fetchMock);
  server.fetch = fetchMock;
  server.requests = (route) => calls.filter((call) => `${call.method} ${call.path}` === route);
  return server;
}

export function networkError() {
  return Promise.reject(new TypeError('Synthetic network failure'));
}

export function createProbe() {
  const ctx = { current: null };
  function Probe() {
    ctx.current = useAppContext();
    return <p data-testid="workspace">Synthetic workspace content</p>;
  }
  return { ctx, Probe };
}

export function renderApp() {
  const { ctx, Probe } = createProbe();
  const view = render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  return { ctx, view, Probe };
}

/** Runs timers and pending promises inside act (fake timers must be on). */
export async function advance(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

export async function run(fn) {
  let result;
  await act(async () => {
    result = await fn();
  });
  return result;
}
