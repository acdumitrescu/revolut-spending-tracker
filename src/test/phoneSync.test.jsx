// Send to iPhone (Mac) and Receive from Mac (phone). Synthetic data only; small PBKDF2 counts.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { config } = vi.hoisted(() => ({ config: {} }));
vi.mock('../lib/runtimeConfig', () => ({
  runtimeConfig: config,
  isPrivateSyncDeployment: () => config.privateSyncEnabled,
}));
vi.mock('../lib/workspaceExports', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadBinaryFile: vi.fn(),
}));

import { ToastProvider } from '../components/Toast';
import ReceiveFromMac, { SNAPSHOT_ACCEPT } from '../components/ReceiveFromMac';
import SendToIphone from '../components/SendToIphone';
import { AppProvider } from '../lib/AppContext';
import { PHONE_COPY_KEY } from '../lib/phoneCopy';
import { createSnapshot, readSnapshot, SNAPSHOT_MAGIC } from '../lib/snapshotFile';
import { downloadBinaryFile } from '../lib/workspaceExports';
import {
  CLIENT_ONLY_CONFIG,
  LS_KEY,
  applyConfig,
  createProbe,
  memoryLocalStorage,
  syntheticTransaction,
  syntheticWorkspace,
} from './fixtures/appContextHarness';

const PASSWORD = 'correct-horse-battery';
const ITERATIONS = 100_000;
const MAC_WORKSPACE = syntheticWorkspace({
  accounts: [
    { id: 'acc-mac', name: 'Mac Checking', currency: 'RON', balances: { '2026-02': 5 }, notes: {} },
    {
      id: 'acc-mac-2',
      name: 'Mac Savings',
      currency: 'RON',
      balances: { '2026-02': 9 },
      notes: {},
    },
  ],
  transactions: [
    syntheticTransaction({ date: '2026-02-01', ym: '2026-02', desc: 'Synthetic Bakery' }),
    syntheticTransaction({ date: '2026-02-03', ym: '2026-02', desc: 'Synthetic Bus' }),
    syntheticTransaction({ date: '2026-02-09', ym: '2026-02', desc: 'Synthetic Cafe' }),
  ],
});
const PHONE_WORKSPACE = syntheticWorkspace();

let newerFile;
let olderFile;

function fileOf(bytes, name = 'SimpleSafeBanking-2026-02-10.ssbsnap') {
  return new File([bytes], name, { type: 'application/octet-stream' });
}

beforeAll(async () => {
  newerFile = await createSnapshot({
    appState: MAC_WORKSPACE,
    password: PASSWORD,
    now: Date.UTC(2026, 1, 10),
    source: 'Mac',
    iterations: ITERATIONS,
  });
  olderFile = await createSnapshot({
    appState: MAC_WORKSPACE,
    password: PASSWORD,
    now: Date.UTC(2026, 0, 1),
    source: 'Mac',
    iterations: ITERATIONS,
  });
});

beforeEach(() => {
  applyConfig(config, CLIENT_ONLY_CONFIG);
  vi.mocked(downloadBinaryFile).mockClear();
});

function mount(children) {
  const { ctx, Probe } = createProbe();
  render(
    <ToastProvider>
      <MemoryRouter>
        <AppProvider>
          <Probe />
          {children}
        </AppProvider>
      </MemoryRouter>
    </ToastProvider>,
  );
  return ctx;
}

const pick = (file) =>
  fireEvent.change(screen.getByLabelText('Choose snapshot file from the Mac'), {
    target: { files: [file] },
  });

async function openWithPassword(password) {
  fireEvent.change(await screen.findByLabelText('Password from the Mac'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open file' }));
}

function row(name) {
  return within(screen.getByRole('row', { name: new RegExp(`^${name}`) }));
}

describe('Send to iPhone', () => {
  it('creates a .ssbsnap file that the shown password opens, and says what to do next', async () => {
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(MAC_WORKSPACE) });
    const ctx = mount(<SendToIphone kdfIterations={ITERATIONS} />);
    const password = screen.getByLabelText('Password for the iPhone').value;
    expect(password).toMatch(/^[a-z]{4}(-[a-z]{4}){4}$/);

    fireEvent.click(screen.getByRole('button', { name: 'Create sync file' }));

    await screen.findByText(
      /Saved\. AirDrop it to your iPhone, then open SSB there and tap Receive from Mac\./,
    );
    expect(downloadBinaryFile).toHaveBeenCalledTimes(1);
    const [bytes, filename] = vi.mocked(downloadBinaryFile).mock.calls[0];
    expect(filename).toMatch(/^SimpleSafeBanking-\d{4}-\d{2}-\d{2}\.ssbsnap$/);
    expect([...bytes.slice(0, SNAPSHOT_MAGIC.length)]).toEqual(SNAPSHOT_MAGIC);
    const { appState, meta } = await readSnapshot(bytes, password);
    expect(meta.source).toBe('Mac');
    expect(appState.data.transactions).toHaveLength(3);
    // The password is never put into the workspace or storage.
    expect(JSON.stringify(ctx.current.persistedState)).not.toContain(password);
    expect(JSON.stringify(window.localStorage.setItem.mock.calls)).not.toContain(password);
  });

  it('offers a new password and shows a too-short password readably', async () => {
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(MAC_WORKSPACE) });
    mount(<SendToIphone kdfIterations={ITERATIONS} />);
    const input = screen.getByLabelText('Password for the iPhone');
    const first = input.value;
    fireEvent.click(screen.getByRole('button', { name: /New password/ }));
    expect(input.value).not.toBe(first);

    fireEvent.change(input, { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create sync file' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 10 characters/);
    expect(downloadBinaryFile).not.toHaveBeenCalled();
  });
});

describe('Receive from Mac', () => {
  it('accepts .ssbsnap and generic files, and asks for the password without autocorrect', async () => {
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(PHONE_WORKSPACE) });
    mount(<ReceiveFromMac />);
    expect(screen.getByLabelText('Choose snapshot file from the Mac')).toHaveAttribute(
      'accept',
      SNAPSHOT_ACCEPT,
    );
    pick(fileOf(newerFile));
    const field = await screen.findByLabelText('Password from the Mac');
    expect(field).toHaveAttribute('autocapitalize', 'off');
    expect(field).toHaveAttribute('autocorrect', 'off');
    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(field).toHaveAttribute('autocomplete', 'off');
  });

  it('previews both sides, replaces on confirm, and records the sync', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(PHONE_WORKSPACE) });
    const ctx = mount(<ReceiveFromMac />);

    pick(fileOf(newerFile));
    await openWithPassword(PASSWORD);

    expect(await screen.findByText('What will change')).toBeInTheDocument();
    expect(screen.getByText('Now on this phone')).toBeInTheDocument();
    expect(screen.getByText('From the file')).toBeInTheDocument();
    expect(
      row('Transactions')
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['0', '3']);
    expect(
      row('Accounts')
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1', '2']);
    expect(
      row('First transaction')
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['—', '2026-02-01']);
    expect(
      row('Last transaction')
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['—', '2026-02-09']);
    expect(
      row('Source')
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['—', 'Mac']);
    // Nothing replaced yet.
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
    expect(ctx.current.data.transactions).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Replace phone copy' }));

    await waitFor(() => expect(ctx.current.readOnly).toBe(true));
    expect(ctx.current.data.transactions).toHaveLength(3);
    const record = JSON.parse(values.get(PHONE_COPY_KEY));
    expect(record).toMatchObject({ fileCreatedAt: Date.UTC(2026, 1, 10), source: 'Mac' });
    expect(Number.isFinite(record.syncedAt)).toBe(true);
    expect(JSON.parse(values.get(LS_KEY)).data.transactions).toHaveLength(3);
  });

  it('Cancel leaves the phone untouched', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(PHONE_WORKSPACE) });
    const ctx = mount(<ReceiveFromMac />);
    pick(fileOf(newerFile));
    await openWithPassword(PASSWORD);
    await screen.findByText('What will change');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('What will change')).not.toBeInTheDocument();
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
    expect(ctx.current.readOnly).toBe(false);
  });

  it('says the password is wrong and does not replace anything', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(PHONE_WORKSPACE) });
    mount(<ReceiveFromMac />);
    pick(fileOf(newerFile));
    await openWithPassword('not-the-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(/password is wrong/i);
    expect(screen.queryByText('What will change')).not.toBeInTheDocument();
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
  });

  it('says so when the file is not a snapshot', async () => {
    memoryLocalStorage({ [LS_KEY]: JSON.stringify(PHONE_WORKSPACE) });
    mount(<ReceiveFromMac />);
    pick(fileOf(new TextEncoder().encode('{"just":"a json file"}'), 'backup.json'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /not a SimpleSafeBanking snapshot file/,
    );
    expect(screen.queryByLabelText('Password from the Mac')).not.toBeInTheDocument();
  });

  it('warns when the file is older than the last sync on the phone', async () => {
    memoryLocalStorage({
      [LS_KEY]: JSON.stringify(PHONE_WORKSPACE),
      [PHONE_COPY_KEY]: JSON.stringify({
        syncedAt: Date.UTC(2026, 1, 11),
        fileCreatedAt: Date.UTC(2026, 1, 10),
        source: 'Mac',
      }),
    });
    mount(<ReceiveFromMac />);
    pick(fileOf(olderFile));
    await openWithPassword(PASSWORD);
    expect(
      await screen.findByText(/older than the copy already on this phone/),
    ).toBeInTheDocument();
    // A read-only phone can still receive: the replace button is there.
    expect(screen.getByRole('button', { name: 'Replace phone copy' })).toBeEnabled();
  });

  it('does not warn for a newer file', async () => {
    memoryLocalStorage({
      [LS_KEY]: JSON.stringify(PHONE_WORKSPACE),
      [PHONE_COPY_KEY]: JSON.stringify({
        syncedAt: Date.UTC(2026, 0, 2),
        fileCreatedAt: Date.UTC(2026, 0, 1),
        source: 'Mac',
      }),
    });
    mount(<ReceiveFromMac />);
    pick(fileOf(newerFile));
    await openWithPassword(PASSWORD);
    await screen.findByText('What will change');
    expect(screen.queryByText(/older than the copy/)).not.toBeInTheDocument();
  });

  it('on a full phone storage says nothing was replaced and keeps the old data', async () => {
    const values = memoryLocalStorage({ [LS_KEY]: JSON.stringify(PHONE_WORKSPACE) });
    const ctx = mount(<ReceiveFromMac />);
    pick(fileOf(newerFile));
    await openWithPassword(PASSWORD);
    await screen.findByText('What will change');

    const setItem = window.localStorage.setItem.getMockImplementation();
    window.localStorage.setItem.mockImplementation((key, value) => {
      if (key === LS_KEY) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      return setItem(key, value);
    });
    const before = values.get(LS_KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Replace phone copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This workspace is too large for this phone's storage in the current version. Nothing was replaced.",
    );
    expect(values.get(LS_KEY)).toBe(before);
    expect(values.has(PHONE_COPY_KEY)).toBe(false);
    expect(ctx.current.readOnly).toBe(false);
    expect(ctx.current.data.accounts.map((a) => a.id)).toEqual(['acc-fake']);
  });
});
