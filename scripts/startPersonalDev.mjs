import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isSafeSyncToken } from '../backend/syncToken.js';
import { readAutoUnlock } from './autoUnlock.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiEntry = path.join(repoRoot, 'backend', 'server.js');
const viteEntry = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const privateDataDir = path.join(repoRoot, 'private-data', 'dev-sync');
const tokenFile = path.join(privateDataDir, 'session-token');
const useSavedToken = process.argv.includes('--use-saved-token');
const openBrowser = process.argv.includes('--open');
const databaseFile = path.join(privateDataDir, 'workspace.ssbdb');
const encrypted = existsSync(path.join(privateDataDir, 'encrypted-storage.enabled'));

// Opt-in testing convenience: private-data/dev-sync/auto-login.testing holds {"name","password"}
// and lets the dev UI unlock itself. Delete the file to get the normal password prompt back.
const autoLoginFile = path.join(privateDataDir, 'auto-login.testing');
let devAutoLogin = null;
// Opt-in Keychain auto-unlock (`npm run auto-unlock -- on "<name>"`); --no-auto-unlock forces the login screen once.
if (encrypted && !process.argv.includes('--no-auto-unlock')) devAutoLogin = readAutoUnlock();
if (encrypted && !devAutoLogin && existsSync(autoLoginFile)) {
  try {
    const parsed = JSON.parse(readFileSync(autoLoginFile, 'utf8'));
    if (parsed?.name && parsed?.password) devAutoLogin = { name: String(parsed.name), password: String(parsed.password) };
  } catch {
    console.error(`Ignoring unreadable ${autoLoginFile}.`);
  }
}

let syncToken = String(process.env.SSB_SYNC_TOKEN || '').trim();

if (useSavedToken) {
  try {
    syncToken = readFileSync(tokenFile, 'utf8').trim();
  } catch {
    console.error(`Saved sync token not found at ${tokenFile}.`);
    process.exit(1);
  }
}

if (!isSafeSyncToken(syncToken)) {
  console.error('SSB_SYNC_TOKEN must be a unique secret of at least 32 characters before starting personal development.');
  process.exit(1);
}

const apiEnvironment = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: '3177',
  APP_STATE_FILE: path.join(privateDataDir, 'app-state.json'),
  VENDOR_OBSERVATIONS_FILE: path.join(privateDataDir, 'vendor-observations.json'),
  ALLOWED_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
  SSB_BACKUP_DIR: path.join(repoRoot, 'backups', 'automatic'),
  SSB_SYNC_TOKEN: syncToken,
  SSB_TRUSTED_DEV_PROXY: 'true',
  SSB_DEV_DISABLE_AUTO_LOCK: 'true',
  SSB_ALLOW_WEAK_TEST_PASSWORDS: String(existsSync(path.join(privateDataDir, 'weak-passwords.testing'))),
  ...(encrypted ? { SSB_LOCAL_USERS: 'true', SSB_STORAGE: 'sqlcipher', SSB_DATABASE_FILE: databaseFile, SSB_KEYCHAIN_HELPER: path.join(repoRoot, 'private-data', 'runtime', 'ssb-keychain') } : {}),
};

const viteEnvironment = {
  ...process.env,
  VITE_DEPLOYMENT_PROFILE: 'private-sync',
  VITE_PRIVATE_SYNC_ENABLED: 'true',
  VITE_PRIVATE_SYNC_AUTO_AUTH: 'true',
  VITE_PRIVATE_BACKUP_ENABLED: 'true',
  VITE_ENCRYPTED_STORAGE: String(encrypted),
  VITE_LOCAL_USERS: String(encrypted),
  VITE_API_BASE_PATH: '/api',
  SSB_TRUSTED_DEV_PROXY: 'true',
  SSB_SYNC_TOKEN: syncToken,
  ...(devAutoLogin ? { VITE_DEV_AUTO_LOGIN_USER: devAutoLogin.name, VITE_DEV_AUTO_LOGIN_PASSWORD: devAutoLogin.password } : {}),
};

let apiProcess;
let viteProcess;
let stopping = false;

function stopChildren(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGTERM');
  if (apiProcess && !apiProcess.killed) apiProcess.kill('SIGTERM');
  process.exitCode = exitCode;
}

async function waitForApi() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:3177/healthz');
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Private persistence API did not become ready within 10 seconds.');
}

async function waitForFrontend() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:5173/app');
      if (response.ok) return;
    } catch {
      // The frontend is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Personal frontend did not become ready within 10 seconds.');
}

process.on('SIGINT', () => stopChildren(0));
process.on('SIGTERM', () => stopChildren(0));

apiProcess = spawn(process.execPath, [apiEntry], {
  cwd: repoRoot,
  env: apiEnvironment,
  stdio: 'inherit',
});

apiProcess.on('exit', (code, signal) => {
  if (!stopping) {
    console.error(`Private persistence API stopped unexpectedly (${signal || code}).`);
    stopChildren(code || 1);
  }
});

try {
  await waitForApi();
} catch (error) {
  console.error(error.message);
  stopChildren(1);
  process.exit();
}

viteProcess = spawn(process.execPath, [
  viteEntry,
  '--host', '127.0.0.1',
  '--port', '5173',
  '--strictPort',
], {
  cwd: repoRoot,
  env: viteEnvironment,
  stdio: 'inherit',
});

viteProcess.on('exit', (code, signal) => {
  if (!stopping) {
    if (code) console.error(`Personal frontend stopped (${signal || code}).`);
    stopChildren(code || 0);
  }
});

if (openBrowser) {
  try {
    await waitForFrontend();
    const browserProcess = spawn('open', ['http://127.0.0.1:5173/app'], {
      stdio: 'ignore',
      detached: true,
    });
    browserProcess.unref();
  } catch (error) {
    console.error(error.message);
    stopChildren(1);
  }
}
