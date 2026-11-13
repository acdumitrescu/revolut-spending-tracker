// End-to-end stack: builds the UI in encrypted local-users mode and serves it from the
// real backend on a throwaway data folder. Started by Playwright (playwright.config.js).
// Synthetic data only: the folder is created fresh under the OS temp dir and deleted on exit.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { E2E_PORT, E2E_SYNC_TOKEN } from '../../e2e/config.js';

const root = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(root, 'dist-e2e');

const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEPLOYMENT_PROFILE: 'private-sync',
    VITE_PRIVATE_SYNC_ENABLED: 'true',
    // A trusted local proxy adds the token (here: Playwright's extraHTTPHeaders).
    VITE_PRIVATE_SYNC_AUTO_AUTH: 'true',
    VITE_ENCRYPTED_STORAGE: 'true',
    VITE_LOCAL_USERS: 'true',
    VITE_PRIVATE_BACKUP_ENABLED: 'true',
    VITE_API_BASE_PATH: '/api',
    // No network in tests.
    VITE_FX_REFRESH_ENABLED: 'false',
  },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const dataRoot = mkdtempSync(path.join(os.tmpdir(), 'ssb-e2e-'));
const origin = `http://127.0.0.1:${E2E_PORT}`;
const backend = spawn(process.execPath, [path.join(root, 'backend/server.js')], {
  cwd: root,
  stdio: ['pipe', 'inherit', 'inherit'],
  env: {
    PATH: process.env.PATH,
    HOME: dataRoot,
    TZ: 'UTC',
    HOST: '127.0.0.1',
    PORT: String(E2E_PORT),
    SSB_SYNC_TOKEN: E2E_SYNC_TOKEN,
    ALLOWED_ORIGINS: origin,
    SSB_STORAGE: 'sqlcipher',
    SSB_LOCAL_USERS: 'true',
    SSB_DATABASE_FILE: path.join(dataRoot, 'workspace.ssbdb'),
    SSB_BACKUP_DIR: path.join(dataRoot, 'backups'),
    SSB_STATIC_DIR: outDir,
    SSB_EXIT_ON_STDIN_CLOSE: 'true',
  },
});

const cleanup = () => rmSync(dataRoot, { recursive: true, force: true });
backend.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => backend.kill('SIGTERM'));
}
