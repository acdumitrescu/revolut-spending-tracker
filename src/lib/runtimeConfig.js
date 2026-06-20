const DEPLOYMENT_PROFILES = ['client-only', 'private-sync'];

function readEnv(name) {
  return import.meta.env?.[name];
}

function normalizeDeploymentProfile(rawProfile) {
  if (DEPLOYMENT_PROFILES.includes(rawProfile)) return rawProfile;
  if (readEnv('VITE_ENABLE_SERVER_SYNC') === 'true') return 'private-sync';
  return 'client-only';
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return value === 'true';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const deploymentProfile = normalizeDeploymentProfile(readEnv('VITE_DEPLOYMENT_PROFILE'));
const privateSyncEnabled = deploymentProfile === 'private-sync' && parseBoolean(readEnv('VITE_PRIVATE_SYNC_ENABLED'), true);

export const runtimeConfig = {
  deploymentProfile,
  privateSyncEnabled,
  apiBasePath: readEnv('VITE_API_BASE_PATH') || '/api',
  fxRefreshEnabled: parseBoolean(readEnv('VITE_FX_REFRESH_ENABLED'), true),
  fxRefreshRetries: parsePositiveInt(readEnv('VITE_FX_REFRESH_RETRIES'), 2),
  fxRefreshRetryDelayMs: parsePositiveInt(readEnv('VITE_FX_REFRESH_RETRY_DELAY_MS'), 450),
};

export function isPrivateSyncDeployment() {
  return runtimeConfig.privateSyncEnabled;
}
