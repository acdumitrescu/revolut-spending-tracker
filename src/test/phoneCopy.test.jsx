// Phone copy: all-or-nothing replace, the read-only data-layer guard, removal. Synthetic data only.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({ config: {} }));
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: config,
  isPrivateSyncDeployment: () => config.privateSyncEnabled,
}));

import { ToastProvider } from '../components/Toast';
import PhoneCopyBanner from '../components/PhoneCopyBanner';
import SettingsPage from '../pages/SettingsPage';
import { AppProvider } from '../lib/AppContext';
import {
  commitPhoneCopy,
  formatRelativeDate,
  loadPhoneCopy,
  PHONE_COPY_KEY,
  PhoneStorageFullError,
  STORAGE_FULL_MESSAGE,
} from '../lib/phoneCopy';
import {
  CLIENT_ONLY_CONFIG,
  LS_KEY,
  applyConfig,
  createProbe,
  memoryLocalStorage,
  syntheticSummary,
  syntheticTransaction,
  syntheticWorkspace,
} from './fixtures/appContextHarness';
import { createFakeBackend, createFakeStore } from './fixtures/fakeWorkspaceBackend';
import { STORE_KEYS } from '../lib/workspaceStore';

const OLD_WORKSPACE = syntheticWorkspace();
const NEW_DATA = syntheticWorkspace({
  accounts: [
    { id: 'acc-new', name: 'Mac Checking', currency: 'RON', balances: { '2026-02': 5 }, notes: {} },
  ],
  transactions: [
    syntheticTransaction({ date: '2026-02-01', ym: '2026-02', desc: 'Synthetic Bakery' }),
    syntheticTransaction({ date: '2026-02-03', ym: '2026-02', desc: 'Synthetic Bus' }),
  ],
}).data;
const RECORD = {
  syncedAt: Date.now() - 3 * 86_400_000,
  fileCreatedAt: 1_700_000_000_000,
  source: 'Mac',
};

function quotaError() {
  return Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
}

function mount(children = null, workspaceStore = undefined) {
  const { ctx, Probe } = createProbe();
  const view = render(
    <ToastProvider>
      <MemoryRouter>
        <AppProvider workspaceStore={workspaceStore}>
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

describe('replaceWorkspaceFromSnapshot', () => {
  it('replaces the workspace, writes the record after it, and turns read-only on', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(OLD_WORKSPACE) });
    const { ctx } = mount();
    expect(ctx.current.readOnly).toBe(false);

    await act(async () => {
      await ctx.current.replaceWorkspaceFromSnapshot(NEW_DATA, {
        fileCreatedAt: 1_800_000_000_000,
        source: 'Mac',
      });
    });

    expect(ctx.current.data.transactions).toHaveLength(2);
    expect(ctx.current.readOnly).toBe(true);
    expect(JSON.parse(values.get(LS_KEY)).data.transactions).toHaveLength(2);
    expect(JSON.parse(values.get(PHONE_COPY_KEY))).toMatchObject({
      fileCreatedAt: 1_800_000_000_000,
      source: 'Mac',
    });
    expect(loadPhoneCopy()).not.toBeNull();
  });

  it('keeps the old phone data intact when saving hits the storage quota', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(OLD_WORKSPACE) });
    const { ctx } = mount();
    const before = values.get(LS_KEY);
    const setItem = window.localStorage.setItem.getMockImplementation();
    window.localStorage.setItem.mockImplementation((key, value) => {
      if (key === LS_KEY) throw quotaError();
      return setItem(key, value);
    });

    let failure;
    await act(async () => {
      try {
        await ctx.current.replaceWorkspaceFromSnapshot(NEW_DATA, {
          fileCreatedAt: 1,
          source: 'Mac',
        });
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(PhoneStorageFullError);
    expect(failure.message).toBe(STORAGE_FULL_MESSAGE);
    expect(values.get(LS_KEY)).toBe(before);
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
    expect(ctx.current.data.accounts.map((account) => account.id)).toEqual(['acc-fake']);
    expect(ctx.current.data.transactions).toEqual([]);
    expect(ctx.current.readOnly).toBe(false);
    expect(ctx.current.phoneCopy).toBeNull();
  });

  it('puts the previous values back if the record write fails after the workspace was stored', () => {
    const values = new Map([
      ['ws', 'old-workspace'],
      [PHONE_COPY_KEY, 'old-record'],
    ]);
    const storage = {
      getItem: (key) => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => {
        if (key === PHONE_COPY_KEY && value !== 'old-record') throw quotaError();
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    };
    expect(() =>
      commitPhoneCopy({ storage, storageKey: 'ws', persistedState: { a: 1 }, record: { b: 2 } }),
    ).toThrow(PhoneStorageFullError);
    expect(values.get('ws')).toBe('old-workspace');
    expect(values.get(PHONE_COPY_KEY)).toBe('old-record');
  });
});

describe('read-only phone copy', () => {
  it('refuses a representative mutation at the data layer, but still saves view preferences', async () => {
    const values = memoryLocalStorage({
      [LS_KEY]: JSON.stringify(OLD_WORKSPACE),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
    });
    const { ctx } = mount();
    expect(ctx.current.readOnly).toBe(true);

    act(() => ctx.current.addAccount('Sneaky Account', 'RON'));
    act(() => ctx.current.addTransactions([syntheticTransaction()]));
    expect(ctx.current.data.accounts).toHaveLength(1);
    expect(ctx.current.data.transactions).toEqual([]);
    expect(ctx.current.readOnlyNotice).toBe(2);
    await expect(
      ctx.current.commitTransactionImport({
        fileName: 'x.csv',
        transactions: [syntheticTransaction()],
        summary: syntheticSummary,
      }),
    ).rejects.toThrow(/read-only/i);
    await expect(ctx.current.importBackup(OLD_WORKSPACE.data)).rejects.toThrow(/read-only/i);

    act(() => ctx.current.setThemeMode('light'));
    expect(ctx.current.data.themeMode).toBe('light');
    expect(JSON.parse(values.get(LS_KEY)).data.themeMode).toBe('light');
    expect(JSON.parse(values.get(LS_KEY)).data.accounts).toHaveLength(1);
  });

  it('shows the banner with a way back to Receive from Mac, and a message for a refused edit', () => {
    memoryLocalStorage({
      [LS_KEY]: JSON.stringify(OLD_WORKSPACE),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
    });
    const { ctx } = mount(<PhoneCopyBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(
      /Copy from Mac, synced 3 days ago \(.+\)\. Read-only on this phone\./,
    );
    expect(screen.getByRole('link', { name: /Receive from Mac again/ })).toHaveAttribute(
      'href',
      '/app/import#receive-from-mac',
    );

    act(() => ctx.current.removeAccount('acc-fake'));
    expect(screen.getByText(/read-only copy from the Mac/i)).toBeInTheDocument();
  });

  it('shows no banner without a phone copy', () => {
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(OLD_WORKSPACE) });
    mount(<PhoneCopyBanner />);
    expect(screen.queryByText(/Read-only on this phone/)).not.toBeInTheDocument();
  });

  it('Remove phone copy in Settings clears the workspace and the record', () => {
    const values = memoryLocalStorage({
      [LS_KEY]: JSON.stringify(OLD_WORKSPACE),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { ctx } = mount(<SettingsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Remove phone copy/ }));

    expect(window.confirm).toHaveBeenCalled();
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
    expect(JSON.parse(values.get(LS_KEY)).data.accounts).toEqual([]);
    expect(ctx.current.data.accounts).toEqual([]);
    expect(ctx.current.readOnly).toBe(false);
    act(() => ctx.current.addAccount('Editable Again', 'RON'));
    expect(ctx.current.data.accounts).toHaveLength(1);
  });

  it('keeps the phone copy when the confirm dialog is declined', () => {
    const values = memoryLocalStorage({
      [LS_KEY]: JSON.stringify(OLD_WORKSPACE),
      [PHONE_COPY_KEY]: JSON.stringify(RECORD),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { ctx } = mount(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Remove phone copy/ }));
    expect(values.has(PHONE_COPY_KEY)).toBe(true);
    expect(ctx.current.readOnly).toBe(true);
  });
});

describe('phone copy on the IndexedDB store', () => {
  async function mountWithStore(backend, children = null) {
    const { store } = createFakeStore({ backend, storageKey: LS_KEY });
    const mounted = mount(children, store);
    await screen.findByTestId('workspace');
    return mounted;
  }

  it('replaces workspace and record in one transaction and stays read-only after a reload', async () => {
    memoryLocalStorage();
    const backend = createFakeBackend({ [STORE_KEYS.workspace]: OLD_WORKSPACE });
    const { ctx, view } = await mountWithStore(backend);

    await act(async () => {
      await ctx.current.replaceWorkspaceFromSnapshot(NEW_DATA, { fileCreatedAt: 1, source: 'Mac' });
    });
    expect(ctx.current.readOnly).toBe(true);
    expect(backend.writes.at(-1)).toEqual({
      put: [STORE_KEYS.workspace, STORE_KEYS.phoneCopy],
      remove: [],
    });
    expect(backend.values.get(STORE_KEYS.workspace).data.transactions).toHaveLength(2);
    expect(window.localStorage.setItem).not.toHaveBeenCalledWith(LS_KEY, expect.anything());

    view.unmount();
    const reloaded = await mountWithStore(backend, <PhoneCopyBanner />);
    expect(reloaded.ctx.current.readOnly).toBe(true);
    expect(reloaded.ctx.current.phoneCopy).toMatchObject({ fileCreatedAt: 1, source: 'Mac' });
    expect(reloaded.ctx.current.data.transactions).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(/Read-only on this phone/);
    act(() => reloaded.ctx.current.addAccount('Sneaky Account', 'RON'));
    expect(reloaded.ctx.current.data.accounts.map((a) => a.id)).toEqual(['acc-new']);
  });

  it('a quota abort keeps the old workspace, no record, and the app editable', async () => {
    memoryLocalStorage();
    const backend = createFakeBackend({ [STORE_KEYS.workspace]: OLD_WORKSPACE });
    const { ctx } = await mountWithStore(backend);
    const before = structuredClone(backend.values.get(STORE_KEYS.workspace));
    backend.failWrite = () => quotaError();

    let failure;
    await act(async () => {
      failure = await ctx.current
        .replaceWorkspaceFromSnapshot(NEW_DATA, { fileCreatedAt: 1, source: 'Mac' })
        .catch((error) => error);
    });
    expect(failure).toBeInstanceOf(PhoneStorageFullError);
    expect(backend.values.get(STORE_KEYS.workspace)).toEqual(before);
    expect(backend.values.has(STORE_KEYS.phoneCopy)).toBe(false);
    expect(ctx.current.readOnly).toBe(false);
    expect(ctx.current.data.accounts.map((a) => a.id)).toEqual(['acc-fake']);
  });

  it('Remove phone copy clears workspace and record together', async () => {
    memoryLocalStorage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const backend = createFakeBackend({
      [STORE_KEYS.workspace]: OLD_WORKSPACE,
      [STORE_KEYS.phoneCopy]: RECORD,
    });
    const { ctx } = await mountWithStore(backend, <SettingsPage />);
    expect(ctx.current.readOnly).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Remove phone copy/ }));

    await waitFor(() => expect(ctx.current.readOnly).toBe(false));
    expect(backend.values.has(STORE_KEYS.phoneCopy)).toBe(false);
    expect(backend.values.get(STORE_KEYS.workspace).data.accounts).toEqual([]);
    expect(backend.writes.at(-1).remove).toEqual([STORE_KEYS.phoneCopy]);
  });
});

describe('formatRelativeDate', () => {
  it('words recent and old dates', () => {
    const now = new Date(2026, 5, 15, 12).getTime();
    const daysAgo = (days) => new Date(2026, 5, 15 - days, 9).getTime();
    expect(formatRelativeDate(daysAgo(0), now)).toBe('today');
    expect(formatRelativeDate(daysAgo(1), now)).toBe('yesterday');
    expect(formatRelativeDate(daysAgo(5), now)).toBe('5 days ago');
    expect(formatRelativeDate(daysAgo(21), now)).toBe('3 weeks ago');
  });
});
