// AppProvider and the schema version of stored workspaces: legacy data is migrated on load, and a
// workspace written by a newer app is refused with a readable message and never overwritten.
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({ config: {} }));
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: config,
  isPrivateSyncDeployment: () => config.privateSyncEnabled,
}));

import { AppProvider } from '../lib/AppContext';
import { NEWER_SCHEMA_VERSION_MESSAGE } from '../lib/migrations';
import { parseImportedAppState } from '../lib/persistence';
import SettingsPage from '../pages/SettingsPage';
import { ToastProvider } from '../components/Toast';
import {
  CLIENT_ONLY_CONFIG,
  FIXED_NOW,
  LS_KEY,
  PRIVATE_SYNC_CONFIG,
  advance,
  applyConfig,
  installFakeServer,
  jsonResponse,
  memoryLocalStorage,
  renderApp,
  syntheticWorkspace,
} from './fixtures/appContextHarness';
import legacyInitial from './fixtures/synthetic-workspace-v0-initial.json';
import currentV1 from './fixtures/synthetic-workspace-v1.json';

const TOKEN_KEY = 'simple_safe_banking_sync_token';
const SAVE_DEBOUNCE_MS = 1500;
const newerWorkspace = () => ({ ...structuredClone(currentV1), schemaVersion: 99 });

beforeEach(() => {
  applyConfig(config, CLIENT_ONLY_CONFIG);
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.__SSB_DESKTOP__;
});

describe('localStorage (client-only mode)', () => {
  it('migrates a legacy unversioned workspace on load and saves it in the current shape', () => {
    const store = memoryLocalStorage({ [LS_KEY]: JSON.stringify(legacyInitial) });
    const { ctx } = renderApp();
    expect(ctx.current.runtimeIssues).toEqual([]);
    expect(ctx.current.persistedState.schemaVersion).toBe(1);
    expect(ctx.current.data.transactions.map((row) => row.amt)).toEqual(
      legacyInitial.transactions.map((row) => row.amt),
    );
    expect(JSON.parse(store.get(LS_KEY))).toEqual(ctx.current.persistedState);
  });

  it('refuses a newer workspace, reports it and never writes over it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stored = JSON.stringify(newerWorkspace());
    const store = memoryLocalStorage({ [LS_KEY]: stored });
    const { ctx } = renderApp();

    expect(ctx.current.runtimeIssues).toEqual(['newer-local-state']);
    expect(ctx.current.data.transactions).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      'Saved workspace uses a newer schema version:',
      expect.stringMatching(/data format 99; this app reads up to 1/),
    );

    act(() => ctx.current.addAccount('Fake Later', 'RON'));
    await advance(SAVE_DEBOUNCE_MS * 2);
    expect(ctx.current.data.accounts).toHaveLength(1);
    expect(store.get(LS_KEY)).toBe(stored);
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(LS_KEY, expect.anything());
  });

  it('shows the readable message on the Settings page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(newerWorkspace()) });
    render(
      <MemoryRouter>
        <ToastProvider>
          <AppProvider>
            <SettingsPage />
          </AppProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText(NEWER_SCHEMA_VERSION_MESSAGE)).toBeTruthy();
  });

  it('rejects a newer backup file with the reason and replaces nothing', () => {
    expect(() => parseImportedAppState(JSON.stringify(newerWorkspace()))).toThrow(
      /newer version of SimpleSafeBanking.*Nothing was replaced\./,
    );
  });
});

describe('private server sync', () => {
  beforeEach(() => {
    applyConfig(config, PRIVATE_SYNC_CONFIG);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.sessionStorage.setItem(TOKEN_KEY, 'fake-sync-token');
  });

  it('refuses a newer remote workspace and never saves over it', async () => {
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(syntheticWorkspace()) });
    const server = installFakeServer({
      'GET /data': () => jsonResponse({ data: newerWorkspace(), version: 4, updatedAt: 1 }),
    });
    const { ctx } = renderApp();
    await advance();

    expect(ctx.current.runtimeIssues).toEqual(['newer-remote-state']);
    expect(ctx.current.syncStatus).toMatchObject({
      phase: 'sync-delayed',
      message: NEWER_SCHEMA_VERSION_MESSAGE,
    });
    expect(ctx.current.data.accounts[0].name).toBe('Fake Savings');

    act(() => ctx.current.addAccount('Fake Later', 'RON'));
    await advance(SAVE_DEBOUNCE_MS * 2);
    expect(server.requests('POST /data')).toHaveLength(0);
  });

  it('does not load a newer workspace returned by a save conflict', async () => {
    const server = installFakeServer({
      'GET /data': () => jsonResponse({ data: syntheticWorkspace(), version: 5, updatedAt: 1 }),
      'POST /data': () =>
        jsonResponse(
          { error: 'Version conflict', data: newerWorkspace(), version: 9, updatedAt: 1 },
          409,
        ),
    });
    const { ctx } = renderApp();
    await advance();
    expect(ctx.current.syncStatus.phase).toBe('synced');

    act(() => ctx.current.addAccount('Fake Local Edit', 'RON'));
    await advance(SAVE_DEBOUNCE_MS + 5000);

    expect(server.requests('POST /data').length).toBeGreaterThan(0);
    expect(ctx.current.data.accounts.map((account) => account.name)).toContain('Fake Local Edit');
    expect(ctx.current.syncStatus.phase).toBe('sync-delayed');
  });
});
