import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LockKeyhole, RefreshCw, Save, ShieldAlert, Trash2, UnlockKeyhole } from 'lucide-react';
import { useAppContext } from '../lib/AppContext';
import { NEWER_SCHEMA_VERSION_MESSAGE } from '../lib/migrations';
import { BASE_CURRENCY } from '../lib/fx';
import { SUPPORTED_DISPLAY_CURRENCIES } from '../lib/utils';
import { useToast } from '../components/Toast';
import { PageHeader, StatusPill } from '../components/ui';
import { formatRelativeDate, formatShortDate, phoneCopyBannerText } from '../lib/phoneCopy';
import { RECEIVE_FROM_MAC_PATH } from '../components/PhoneCopyBanner';

const RUNTIME_ISSUE_TEXT = {
  'newer-local-state': NEWER_SCHEMA_VERSION_MESSAGE,
  'newer-remote-state': NEWER_SCHEMA_VERSION_MESSAGE,
};

function formatMegabytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function persistedText(persisted) {
  if (persisted === true) return 'Yes, the browser has promised to keep it';
  if (persisted === false)
    return 'Not promised. The browser may clear it when the device runs low on storage';
  return 'Not reported by this browser';
}

/** Client-only: where the workspace is kept on this device and whether the browser will keep it. */
function DeviceStorageSection({ storageInfo, readStorageStatus, phoneCopy }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let cancelled = false;
    readStorageStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [readStorageStatus, storageInfo.persistGranted]);

  const where =
    storageInfo.backend === 'indexeddb'
      ? 'This device · IndexedDB'
      : 'This device · browser storage (localStorage fallback)';
  let usage = status ? 'Not reported by this browser' : 'Checking…';
  if (status?.usage !== null && status?.usage !== undefined) {
    usage = `About ${formatMegabytes(status.usage)} used`;
    if (status.quota) usage += ` of ${formatMegabytes(status.quota)} available`;
  }
  return (
    <section className="settings-section" aria-label="Storage on this device">
      <div className="settings-section-heading">
        <h2>Storage on this device</h2>
        <p>
          The workspace stays in this browser on this device. It is a copy: keep the Mac (or a
          backup file) as the source of truth.
        </p>
      </div>
      <div className="settings-control-grid">
        <div className="settings-readout">
          <span>Stored in</span>
          <strong>{where}</strong>
        </div>
        <div className="settings-readout">
          <span>Kept by the browser</span>
          <strong>{status ? persistedText(status.persisted) : 'Checking…'}</strong>
        </div>
        <div className="settings-readout">
          <span>Space used</span>
          <strong>{usage}</strong>
        </div>
        <div className="settings-readout">
          <span>Last sync from the Mac</span>
          <strong>
            {phoneCopy
              ? `${formatShortDate(phoneCopy.syncedAt)} (${formatRelativeDate(phoneCopy.syncedAt)})`
              : 'Never'}
          </strong>
        </div>
      </div>
      {storageInfo.backend !== 'indexeddb' && storageInfo.fallbackReason && (
        <p className="section-note">
          {storageInfo.fallbackReason} The browser&apos;s smaller storage is used instead, so a
          large workspace may not fit.
        </p>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const {
    data,
    currencySummary,
    fxStatus,
    runtimeConfig,
    runtimeIssues,
    syncStatus,
    unlockPrivateSync,
    lockPrivateSync,
    setDisplayCurrency,
    setThemeMode,
    setFxRates,
    refreshFxRates,
    clearData,
    phoneCopy,
    removePhoneCopy,
    storageInfo,
    readStorageStatus,
    flushWorkspace,
  } = useAppContext();
  const toast = useToast();
  const [manualRates, setManualRates] = useState({
    EUR: String(data.fxRates.EUR),
    USD: String(data.fxRates.USD),
  });
  const [syncToken, setSyncToken] = useState('');
  const currencies = useMemo(
    () => currencySummary.currencies.join(', ') || BASE_CURRENCY,
    [currencySummary.currencies],
  );

  const saveRates = async () => {
    const rates = { EUR: Number(manualRates.EUR), USD: Number(manualRates.USD) };
    if (Object.values(rates).some((rate) => !Number.isFinite(rate) || rate <= 0)) {
      toast.error('Enter valid positive EUR and USD rates.');
      return;
    }
    setFxRates(rates, 'manual');
    try {
      await flushWorkspace?.();
    } catch (error) {
      toast.error(error.message);
      return;
    }
    toast.success('FX rates saved locally.');
  };

  const refreshRates = async () => {
    try {
      const refreshed = await refreshFxRates();
      setManualRates({ EUR: String(refreshed.fxRates.EUR), USD: String(refreshed.fxRates.USD) });
      toast.success('Latest FX rates loaded.');
    } catch {
      toast.warning('FX refresh is unavailable. Saved values remain active.');
    }
  };

  const clearAllData = () => {
    if (!window.confirm('Permanently delete all locally stored SimpleSafeBanking data?')) return;
    clearData();
    toast.warning('All local data has been cleared.');
  };

  const removeCopy = async () => {
    if (
      !window.confirm(
        'Remove the phone copy? This clears the workspace on this phone. The Mac is not affected, and you can receive the data again later.',
      )
    )
      return;
    try {
      await removePhoneCopy();
    } catch {
      toast.error('The phone copy could not be removed. Nothing was changed.');
      return;
    }
    toast.warning('Phone copy removed. This phone is empty and editable again.');
  };

  const unlockSync = () => {
    if (syncToken.trim().length < 32) {
      toast.error('Enter a private sync token with at least 32 characters.');
      return;
    }
    unlockPrivateSync(syncToken);
    setSyncToken('');
    toast.info('Checking private sync access...');
  };

  const lockSync = () => {
    lockPrivateSync();
    setSyncToken('');
    toast.warning('Private sync locked for this browser tab.');
  };

  return (
    <div className="page-stack settings-page">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Control display, currency conversion, private sync visibility, and local data."
        actions={
          <StatusPill tone={syncStatus.enabled ? 'info' : 'success'}>
            {syncStatus.message}
          </StatusPill>
        }
      />

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>Appearance and display</h2>
          <p>Display changes never rewrite the source transaction currency.</p>
        </div>
        <div className="settings-control-grid">
          <label className="field-stack">
            <span>Display currency</span>
            <select
              className="input"
              value={data.displayCurrency}
              onChange={(event) => setDisplayCurrency(event.target.value)}
            >
              {SUPPORTED_DISPLAY_CURRENCIES.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          </label>
          <label className="field-stack">
            <span>Theme</span>
            <select
              className="input"
              value={data.themeMode}
              onChange={(event) => setThemeMode(event.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <div className="settings-readout">
            <span>Base currency</span>
            <strong>{BASE_CURRENCY}</strong>
          </div>
          <div className="settings-readout">
            <span>Detected currencies</span>
            <strong>{currencies}</strong>
          </div>
        </div>
      </section>

      {!runtimeConfig.privateSyncEnabled && (
        <section className="settings-section" aria-label="Phone copy">
          <div className="settings-section-heading">
            <h2>Copy from Mac</h2>
            <p>
              {phoneCopy
                ? phoneCopyBannerText(phoneCopy)
                : 'Receive a read-only copy of the Mac workspace on this phone.'}
            </p>
          </div>
          <div className="settings-inline-actions">
            <Link className="btn btn-primary" to={RECEIVE_FROM_MAC_PATH}>
              Receive from Mac
            </Link>
            {phoneCopy && (
              <button className="btn btn-ghost-danger" type="button" onClick={removeCopy}>
                <Trash2 size={15} /> Remove phone copy
              </button>
            )}
          </div>
        </section>
      )}

      {!runtimeConfig.privateSyncEnabled && storageInfo && (
        <DeviceStorageSection
          storageInfo={storageInfo}
          readStorageStatus={readStorageStatus}
          phoneCopy={phoneCopy}
        />
      )}

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>Exchange rates</h2>
          <p>
            Latest saved rates are used for display conversion, not historical transaction-day
            rates.
          </p>
        </div>
        <div className="settings-control-grid fx-controls">
          <label className="field-stack">
            <span>RON per EUR</span>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={manualRates.EUR}
              onChange={(event) =>
                setManualRates((current) => ({ ...current, EUR: event.target.value }))
              }
            />
          </label>
          <label className="field-stack">
            <span>RON per USD</span>
            <input
              className="input"
              type="number"
              step="0.0001"
              value={manualRates.USD}
              onChange={(event) =>
                setManualRates((current) => ({ ...current, USD: event.target.value }))
              }
            />
          </label>
          <div className="settings-readout">
            <span>Source</span>
            <strong>{data.fxSource}</strong>
          </div>
          <div className="settings-readout">
            <span>Status</span>
            <strong>{fxStatus.message}</strong>
          </div>
        </div>
        <div className="settings-inline-actions">
          <button className="btn" type="button" onClick={refreshRates}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="btn btn-primary" type="button" onClick={saveRates}>
            <Save size={15} /> Save rates
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-heading">
          <h2>Privacy and storage</h2>
          <p>
            {runtimeConfig.deploymentProfile === 'private-sync'
              ? 'Saved automatically in this browser and copied to your single-tenant private server.'
              : 'Saved automatically in this browser on this device; no public account is created.'}
          </p>
        </div>
        {runtimeIssues.length > 0 && (
          <div className="runtime-warning">
            <ShieldAlert size={17} />{' '}
            {runtimeIssues.map((issue) => RUNTIME_ISSUE_TEXT[issue] || issue).join(', ')}
          </div>
        )}
        {runtimeConfig.privateSyncEnabled && (
          <div className="sync-access-panel">
            {runtimeConfig.privateSyncAutoAuth ? (
              <>
                <div className="settings-readout">
                  <span>Private sync access</span>
                  <strong>Automatic local sync</strong>
                </div>
                <p className="section-note">
                  Authenticated by the trusted localhost development proxy. The token is never sent
                  to browser storage, URLs, app data, or backups.
                </p>
              </>
            ) : (
              <>
                <label className="field-stack">
                  <span>Private sync token</span>
                  <input
                    className="input"
                    type="password"
                    autoComplete="off"
                    value={syncToken}
                    onChange={(event) => setSyncToken(event.target.value)}
                    placeholder={
                      syncStatus.phase === 'auth-required'
                        ? 'Required to unlock sync'
                        : 'Enter a replacement token'
                    }
                  />
                </label>
                <div className="settings-inline-actions">
                  <button className="btn btn-primary" type="button" onClick={unlockSync}>
                    <UnlockKeyhole size={15} /> Unlock
                  </button>
                  <button className="btn" type="button" onClick={lockSync}>
                    <LockKeyhole size={15} /> Lock
                  </button>
                </div>
                <p className="section-note">
                  The token is kept only for this browser tab and is never included in app data or
                  backups.
                </p>
              </>
            )}
          </div>
        )}
        <div className="settings-control-grid">
          <div className="settings-readout">
            <span>Storage mode</span>
            <strong>
              {runtimeConfig.deploymentProfile === 'private-sync'
                ? 'Browser + private sync'
                : 'Browser only'}
            </strong>
          </div>
          <div className="settings-readout">
            <span>Saved workspace</span>
            <strong>Transactions, mappings, edits, accounts, credit records, budgets, goals</strong>
          </div>
          <div className="settings-readout">
            <span>Category precedence</span>
            <strong>Manual edit → vendor mapping → imported/automatic</strong>
          </div>
          <div className="settings-readout">
            <span>Portability</span>
            <strong>Versioned JSON backup</strong>
          </div>
        </div>
        <p className="section-note" style={{ marginTop: '12px' }}>
          Browser storage can be erased by browser cleanup or private browsing. Private sync is not
          a public account service and must stay on localhost or behind your own authenticated
          access gate.
        </p>
        {!phoneCopy && (
          <div className="danger-zone">
            <div>
              <strong>Clear local data</strong>
              <span>This cannot be undone unless you have a private JSON backup.</span>
            </div>
            <button className="btn btn-ghost-danger" type="button" onClick={clearAllData}>
              <Trash2 size={15} /> Clear data
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
