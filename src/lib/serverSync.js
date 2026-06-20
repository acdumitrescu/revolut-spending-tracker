import { runtimeConfig } from './runtimeConfig';

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

async function parseJsonResponse(response, fallbackMessage) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const message = typeof body?.error === 'string' && body.error.trim()
      ? body.error
      : fallbackMessage;
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
    signal,
  });
  const body = await parseJsonResponse(response, `Server returned ${response.status}`);
  return normalizeSnapshot(body);
}

export async function saveServerSnapshot(data, version, signal) {
  const response = await fetch(`${runtimeConfig.apiBasePath}/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data, version }),
    credentials: 'same-origin',
    signal,
  });

  const body = await parseJsonResponse(response, `Server returned ${response.status}`);
  return normalizeSnapshot(body);
}

export function isVersionConflict(error) {
  return Boolean(error?.status === 409 && error?.body);
}

export function getConflictSnapshot(error) {
  return normalizeSnapshot(error?.body);
}
