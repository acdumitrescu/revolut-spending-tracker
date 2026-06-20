import { runtimeConfig } from './runtimeConfig';

function observationsUrl(path = '') {
  return `${runtimeConfig.apiBasePath}/vendor-observations${path}`;
}

export function vendorObservationsEnabled() {
  return runtimeConfig.privateSyncEnabled;
}

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Vendor observations request failed');
  }
  return body;
}

export async function loadVendorObservations(signal) {
  if (!vendorObservationsEnabled()) {
    return { enabled: false, observations: [] };
  }

  const response = await fetch(observationsUrl(), {
    method: 'GET',
    signal,
  });
  return readJson(response);
}

export async function recordVendorObservations(observations, signal) {
  if (!vendorObservationsEnabled() || !Array.isArray(observations) || observations.length === 0) {
    return { enabled: vendorObservationsEnabled(), stored: 0 };
  }

  const response = await fetch(observationsUrl('/collect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observations }),
    signal,
  });
  return readJson(response);
}

export async function resolveVendorObservation(resolution, signal) {
  if (!vendorObservationsEnabled()) {
    return { enabled: false };
  }

  const response = await fetch(observationsUrl('/resolve'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resolution),
    signal,
  });
  return readJson(response);
}
