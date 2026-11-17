// AppProvider on the client-only IndexedDB store: hydration, no save before it, saves, migration,
// fallback and the Settings storage section. In-memory backend; synthetic data only.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({ config: {} }));
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: config,
  isPrivateSyncDeployment: () => config.privateSyncEnabled,
}));

import { ToastProvider } from '../components/Toast';
import SettingsPage from '../pages/SettingsPage';
import { AppProvider } from '../lib/AppContext';
import { PHONE_COPY_KEY } from '../lib/phoneCopy';
import { STORAGE_LOCATION_KEY, STORE_KEYS } from '../lib/workspaceStore';
import {
  CLIENT_ONLY_CONFIG,
  LS_KEY,
  applyConfig,
  createProbe,
  memoryLocalStorage,
  syntheticTransaction,
  syntheticWorkspace,
} from './fixtures/appContextHarness';
import {
  createFakeBackend,
  createFakeStorageManager,
  createFakeStore,
} from './fixtures/fakeWorkspaceBackend';

const STORED = syntheticWorkspace({ transactions: [syntheticTransaction()] });
const RECORD = { syncedAt: Date.UTC(2026, 0, 10, 9), fileCreatedAt: 1, source: 'Mac' };

function gatedBackend(initial) {
  const backend = createFakeBackend(initial);
  const read = backend.read.bind(backend);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  backend.read = async (keys) => {
    await gate;
    return read(keys);
  };
  return { backend, release };
}

function mount(store, children = null) {
  const { ctx, Probe } = createProbe();
  const view = render(
    <ToastProvider>
      <MemoryRouter>
        <AppProvider workspaceStore={store}>
          <Probe />
          {children}
        </AppProvider>
      </MemoryRouter>
    </ToastProvider>,
  );
  return { ctx, view };
}

beforeEach(() => {
  applyConfig(config, CLIENT_ONLY_CONFIG);
});

describe('hydration', () => {
  it('shows the loading screen until the stored workspace is loaded, then the workspace', async () => {
    memoryLocalStorage();
    const { backend, release } = gatedBackend({ [STORE_KEYS.workspace]: STORED });
    const { store } = createFakeStore({ backend, storageKey: LS_KEY });
    const { ctx } = mount(store);

    expect(screen.getByRole('heading', { name: 'Opening workspace' })).toBeInTheDocument();
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();

    await act(async () => release());
    expect(await screen.findByTestId('workspace')).toBeInTheDocument();
    expect(ctx.current.data.accounts.map((a) => a.id)).toEqual(['acc-fake']);
    expect(ctx.current.data.transactions).toHaveLength(1);
    expect(ctx.current.storageInfo.backend).toBe('indexeddb');
  });

  it('never saves before hydration: an early FX refresh cannot overwrite the stored workspace', async () => {
    applyConfig(config, { ...CLIENT_ONLY_CONFIG, fxRefreshEnabled: true });
    memoryLocalStorage();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const base = new URL(url).searchParams.get('base');
        return {
          ok: true,
          json: async () => [{ base, quote: 'RON', rate: base === 'EUR' ? 5.1 : 4.7 }],
        };
      }),
    );
    const { backend, release } = gatedBackend({ [STORE_KEYS.workspace]: STORED });
    const { store } = createFakeStore({ backend, storageKey: LS_KEY });
    const { ctx } = mount(store);

    // Give any premature effect (FX refresh, save) plenty of time to run.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(backend.writes).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await act(async () => release());
    await screen.findByTestId('workspace');
    // After hydration the FX refresh runs and saves, on top of the stored data.
    await waitFor(() => expect(backend.writes.length).toBeGreaterThan(0));
    const saved = backend.values.get(STORE_KEYS.workspace);
    expect(saved.data.accounts.map((a) => a.id)).toEqual(['acc-fake']);
    expect(saved.data.transactions).toHaveLength(1);
    expect(ctx.current.data.fxRates.EUR).toBe(5.1);
    expect(saved.data.fxRates.EUR).toBe(5.1);
  });

  it('does not write the just-loaded workspace back', async () => {
    memoryLocalStorage();
    const backend = createFakeBackend({ [STORE_KEYS.workspace]: STORED });
    const { store } = createFakeStore({ backend, storageKey: LS_KEY });
    mount(store);
    await screen.findByTestId('workspace');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(backend.writes).toEqual([]);
  });

  it('saves edits to the store, coalesced', async () => {
    memoryLocalStorage();
    const backend = createFakeBackend({ [STORE_KEYS.workspace]: STORED });
    const { store } = createFakeStore({ backend, storageKey: LS_KEY });
    const { ctx } = mount(store);
    await screen.findByTestId('workspace');

    act(() => ctx.current.addAccount('Synthetic One', 'RON'));
    act(() => ctx.current.addAccount('Synthetic Two', 'EUR'));
    await waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(backend.values.get(STORE_KEYS.workspace).data.accounts.map((a) => a.name)).toEqual([
      'Fake Savings',
      'Synthetic One',
      'Synthetic Two',
    ]);
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(LS_KEY, expect.anything());
  });

  it('carries an existing localStorage workspace over on first start', async () => {
    const values = memoryLocalStorage({
      [LS_KEY]: JSON.stringify(STORED),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
    });
    const backend = createFakeBackend();
    const storageManager = createFakeStorageManager();
    const { store } = createFakeStore({
      backend,
      storageKey: LS_KEY,
      storageManager,
    });
    const { ctx } = mount(store);
    await screen.findByTestId('workspace');

    expect(ctx.current.data.transactions).toHaveLength(1);
    expect(ctx.current.readOnly).toBe(true);
    await waitFor(() => expect(storageManager.persistCalls).toBe(1));
    expect(backend.values.get(STORE_KEYS.workspace)).toEqual(STORED);
    expect(values.has(LS_KEY)).toBe(false);
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
    expect(values.get(STORAGE_LOCATION_KEY)).toBe('indexeddb');
  });

  it('falls back to localStorage when IndexedDB cannot be opened, and keeps the data', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(STORED) });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { store } = createFakeStore({
      storageKey: LS_KEY,
      openError: new Error('Synthetic open failure'),
    });
    const { ctx } = mount(store, <SettingsPage />);
    await screen.findByTestId('workspace');

    expect(ctx.current.data.transactions).toHaveLength(1);
    expect(ctx.current.storageInfo.backend).toBe('localStorage');
    const section = within(screen.getByRole('region', { name: 'Storage on this device' }));
    expect(section.getByText(/localStorage fallback/)).toBeInTheDocument();
    expect(section.getByText(/Synthetic open failure/)).toBeInTheDocument();

    act(() => ctx.current.addAccount('Fallback Account', 'RON'));
    await waitFor(() =>
      expect(JSON.parse(values.get(LS_KEY)).data.accounts.map((a) => a.name)).toContain(
        'Fallback Account',
      ),
    );
  });

  it('shows an error with Retry, not an empty workspace, when IndexedDB holds the data but fails', async () => {
    memoryLocalStorage({ [STORAGE_LOCATION_KEY]: 'indexeddb' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const backend = createFakeBackend({ [STORE_KEYS.workspace]: STORED });
    let fail = true;
    const { store } = createFakeStore({ backend, storageKey: LS_KEY });
    const realHydrate = store.hydrate;
    store.hydrate = () =>
      fail ? Promise.reject(Object.assign(new Error('x'), { name: 'Unavailable' })) : realHydrate();

    const { ctx } = mount(store);
    expect(await screen.findByRole('heading', { name: /could not be opened/ })).toBeInTheDocument();
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();
    expect(backend.writes).toEqual([]);

    fail = false;
    act(() => screen.getByRole('button', { name: 'Retry' }).click());
    await screen.findByTestId('workspace');
    expect(ctx.current.data.transactions).toHaveLength(1);
  });
});

describe('Settings: storage on this device', () => {
  it('shows IndexedDB, the browser promise, usage and last sync, and asks persist() once', async () => {
    memoryLocalStorage();
    const storageManager = createFakeStorageManager({ persisted: false, grant: true });
    const backend = createFakeBackend({
      [STORE_KEYS.workspace]: STORED,
      [STORE_KEYS.phoneCopy]: RECORD,
    });
    const { store } = createFakeStore({ backend, storageKey: LS_KEY, storageManager });
    const { ctx } = mount(store, <SettingsPage />);
    await screen.findByTestId('workspace');
    const section = within(screen.getByRole('region', { name: 'Storage on this device' }));

    expect(section.getByText('This device · IndexedDB')).toBeInTheDocument();
    expect(await section.findByText(/Not promised/)).toBeInTheDocument();
    expect(section.getByText('About 1.0 MB used of 500 MB available')).toBeInTheDocument();
    expect(section.getByText(/10 Jan 2026/)).toBeInTheDocument();
    expect(storageManager.persistCalls).toBe(0);

    await act(async () => {
      await ctx.current.replaceWorkspaceFromSnapshot(STORED.data, { source: 'Mac' });
    });
    expect(await section.findByText(/promised to keep it/)).toBeInTheDocument();
    expect(storageManager.persistCalls).toBe(1);
    expect(ctx.current.storageInfo.persistGranted).toBe(true);

    await act(async () => {
      await ctx.current.replaceWorkspaceFromSnapshot(STORED.data, { source: 'Mac' });
    });
    expect(storageManager.persistCalls).toBe(1);
  });

  it('asks for persistence after the first save that holds data, not for an empty workspace', async () => {
    memoryLocalStorage();
    const storageManager = createFakeStorageManager();
    const backend = createFakeBackend();
    const { store } = createFakeStore({
      backend,
      storageKey: LS_KEY,
      storageManager,
    });
    const { ctx } = mount(store);
    await screen.findByTestId('workspace');

    act(() => ctx.current.setThemeMode('light'));
    await waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(storageManager.persistCalls).toBe(0);

    act(() => ctx.current.addAccount('First Account', 'RON'));
    await waitFor(() => expect(storageManager.persistCalls).toBe(1));
  });
});
