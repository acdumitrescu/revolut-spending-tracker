import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(backendDir, '..');

export const DEFAULT_APP_STATE_FILE = path.join(
  repoRoot,
  'private-data',
  'private-sync',
  'app-state.json'
);

export const DEFAULT_VENDOR_OBSERVATIONS_FILE = path.join(
  repoRoot,
  'private-data',
  'private-sync',
  'vendor-observations.json'
);

export function resolveAppStateFile(customPath) {
  if (typeof customPath === 'string' && customPath.trim()) {
    return customPath;
  }

  return DEFAULT_APP_STATE_FILE;
}

export function resolveVendorObservationsFile(customPath) {
  if (typeof customPath === 'string' && customPath.trim()) {
    return customPath;
  }

  return DEFAULT_VENDOR_OBSERVATIONS_FILE;
}
