import { getLocalUserToken } from './localUserSession';
import { runtimeConfig } from './runtimeConfig';
import { PersistedAppStateSchema } from './validation';

const SYNC_ACCESS_TOKEN_KEY = 'simple_safe_banking_sync_token';
let lastServerEnvelope = null;

export function getSyncAccessToken() {
  try {
    return String(window.sessionStorage.getItem(SYNC_ACCESS_TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setSyncAccessToken(token) {
  const normalized = String(token || '').trim();
  if (!normalized) {
    clearSyncAccessToken();
    return;
  }
  window.sessionStorage.setItem(SYNC_ACCESS_TOKEN_KEY, normalized);
}

export function clearSyncAccessToken() {
  try {
    window.sessionStorage.removeItem(SYNC_ACCESS_TOKEN_KEY);
  } catch {
    // Sync remains locked if session storage is unavailable.
  }
}

export function hasSyncAccessToken() {
  return Boolean(getSyncAccessToken());
}

export function hasPrivateSyncAccess() {
  return runtimeConfig.privateSyncAutoAuth || hasSyncAccessToken();
}

export function getSyncAuthorizationHeaders(headers = {}) {
  if (runtimeConfig.localUsers) headers = { ...headers, 'X-SSB-Session': getLocalUserToken() };
  if (runtimeConfig.privateSyncAutoAuth) return { ...headers, 'X-SSB-Client': 'private-ui' };
  const token = getSyncAccessToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeSnapshot(body) {
  const remoteData = body && typeof body === 'object' ? body.data : null;
  const remoteLogicalUpdatedAt = parseTimestamp(remoteData?.lastUpdated);
  const remoteServerUpdatedAt = parseTimestamp(body?.updatedAt);

  return {
    data: remoteData && typeof remoteData === 'object' ? remoteData : null,
    version: Number.isInteger(body?.version) && body.version >= 0 ? body.version : 0,
    remoteLogicalUpdatedAt: remoteLogicalUpdatedAt || remoteServerUpdatedAt,
    remoteServerUpdatedAt,
  };
}

function hasUserData(state) {
  const data = state?.data?.data || state?.data || state;
  return Boolean(
    data?.subscriptions?.length ||
    data?.carListings?.length ||
    data?.transactions?.length ||
    data?.accounts?.length ||
    data?.moneyFlow?.incomes?.length ||
    data?.moneyFlow?.transfers?.length ||
    data?.moneyFlow?.brd?.rows?.length ||
    data?.creditRecords?.length ||
    data?.portfolioHoldings?.length ||
    data?.goals?.length ||
    Object.keys(data?.budgets || {}).length ||
    Object.keys(data?.customVendors || {}).length,
  );
}

export function shouldLoadRemoteAtBootstrap(remoteState, localState, serverTime = 0) {
  if (!remoteState) return false;
  if (hasUserData(remoteState)) return true;
  if (hasUserData(localState)) return false;
  return serverTime >= (localState?.data?.lastUpdated || 0);
}

async function parseJsonResponse(response, fallbackMessage) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    if (response.status === 401 && runtimeConfig.localUsers)
      window.dispatchEvent(new Event('ssb-user-expired'));
    const message =
      typeof body?.error === 'string' && body.error.trim() ? body.error : fallbackMessage;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function getRemoteLogicalUpdatedAt(snapshot) {
  return snapshot?.remoteLogicalUpdatedAt || 0;
}

export async function loadServerSnapshot(signal) {
  const response = await fetch(`${runtimeConfig.apiBasePath}/data`, {
    credentials: 'same-origin',
    headers: getSyncAuthorizationHeaders(),
    signal,
  });
  const body = await parseJsonResponse(response, `Server returned ${response.status}`);
  if (runtimeConfig.encryptedStorage) lastServerEnvelope = body.data;
  return normalizeSnapshot(body);
}

export async function saveServerSnapshot(data, version, signal) {
  const encrypted = runtimeConfig.encryptedStorage;
  if (encrypted && !lastServerEnvelope)
    throw new Error('Encrypted workspace must load before saving');
  const changes = encrypted
    ? Object.entries(data.data)
        .filter(
          ([field, value]) =>
            JSON.stringify(value) !== JSON.stringify(lastServerEnvelope.data[field]),
        )
        .map(([field, value]) => ({ field, value }))
    : null;
  const response = await fetch(`${runtimeConfig.apiBasePath}/${encrypted ? 'changes' : 'data'}`, {
    method: 'POST',
    headers: getSyncAuthorizationHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(encrypted ? { changes, version } : { data, version }),
    credentials: 'same-origin',
    signal,
  });

  const body = await parseJsonResponse(response, `Server returned ${response.status}`);
  if (encrypted) lastServerEnvelope = body.data;
  return normalizeSnapshot(body);
}

export async function createPrivateBackup(data, reason, importBatchId) {
  const response = await fetch(`${runtimeConfig.apiBasePath}/backups`, {
    method: 'POST',
    headers: getSyncAuthorizationHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data, reason, importBatchId }),
    credentials: 'same-origin',
  });
  return parseJsonResponse(response, `Server returned ${response.status}`);
}

export async function listEncryptedBackups() {
  return parseJsonResponse(
    await fetch(`${runtimeConfig.apiBasePath}/encrypted-backups`, {
      headers: getSyncAuthorizationHeaders(),
      credentials: 'same-origin',
    }),
    'Unable to list encrypted backups',
  );
}
export async function loadEncryptedBackup(filename) {
  return parseJsonResponse(
    await fetch(`${runtimeConfig.apiBasePath}/encrypted-backups/${encodeURIComponent(filename)}`, {
      headers: getSyncAuthorizationHeaders(),
      credentials: 'same-origin',
    }),
    'Unable to read encrypted backup',
  );
}

export function isVersionConflict(error) {
  return Boolean(error?.status === 409 && error?.body);
}

export function getConflictSnapshot(error) {
  const snapshot = normalizeSnapshot(error?.body);
  if (runtimeConfig.encryptedStorage && PersistedAppStateSchema.safeParse(snapshot.data).success) {
    lastServerEnvelope = snapshot.data;
  }
  return snapshot;
}
