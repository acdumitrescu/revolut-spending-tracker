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
const privateSyncEnabled =
  deploymentProfile === 'private-sync' && parseBoolean(readEnv('VITE_PRIVATE_SYNC_ENABLED'), true);
const privateSyncAutoAuth =
  privateSyncEnabled && parseBoolean(readEnv('VITE_PRIVATE_SYNC_AUTO_AUTH'), false);
// Dev server only (import.meta.env.DEV is false in production builds): lets a local testing
// session unlock itself from private-data/dev-sync/auto-login.testing.
const devAutoLoginUser = import.meta.env.DEV ? readEnv('VITE_DEV_AUTO_LOGIN_USER') : '';
const devAutoLoginPassword = import.meta.env.DEV ? readEnv('VITE_DEV_AUTO_LOGIN_PASSWORD') : '';

export const runtimeConfig = {
  deploymentProfile,
  privateSyncEnabled,
  privateSyncAutoAuth,
  localUsers: privateSyncEnabled && parseBoolean(readEnv('VITE_LOCAL_USERS'), false),
  devAutoLogin:
    privateSyncEnabled && devAutoLoginUser && devAutoLoginPassword
      ? { name: devAutoLoginUser, password: devAutoLoginPassword }
      : null,
  encryptedStorage: privateSyncEnabled && parseBoolean(readEnv('VITE_ENCRYPTED_STORAGE'), false),
  privateBackupEnabled:
    privateSyncEnabled && parseBoolean(readEnv('VITE_PRIVATE_BACKUP_ENABLED'), false),
  apiBasePath: readEnv('VITE_API_BASE_PATH') || '/api',
  fxRefreshEnabled: parseBoolean(readEnv('VITE_FX_REFRESH_ENABLED'), true),
  fxRefreshRetries: parsePositiveInt(readEnv('VITE_FX_REFRESH_RETRIES'), 2),
  fxRefreshRetryDelayMs: parsePositiveInt(readEnv('VITE_FX_REFRESH_RETRY_DELAY_MS'), 450),
};

export function isPrivateSyncDeployment() {
  return runtimeConfig.privateSyncEnabled;
}
