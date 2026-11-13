import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateDataDir = path.join(repoRoot, 'private-data', 'dev-sync');
const markerFile = path.join(privateDataDir, 'auto-unlock.enabled');
const SERVICE = 'SimpleSafeBanking auto-unlock';

// Opt-in "remember me" for the local-user login screen on the loopback dev launcher.
// The marker file holds only the user name (already visible on the login screen); the
// password lives in the macOS Keychain, never in a file. Off unless `on` is run.
export function readAutoUnlock() {
  if (process.platform !== 'darwin' || !existsSync(markerFile)) return null;
  const name = readFileSync(markerFile, 'utf8').trim();
  if (!name) return null;
  const result = spawnSync(
    '/usr/bin/security',
    ['find-generic-password', '-s', SERVICE, '-a', name, '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const password = result.status === 0 ? result.stdout.replace(/\n$/, '') : '';
  return password ? { name, password } : null;
}

function deleteSecret(name) {
  spawnSync('/usr/bin/security', ['delete-generic-password', '-s', SERVICE, '-a', name], {
    stdio: 'ignore',
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, userName] = process.argv.slice(2);
  const current = existsSync(markerFile) ? readFileSync(markerFile, 'utf8').trim() : '';
  if (command === 'on') {
    if (!userName) {
      console.error('Usage: npm run auto-unlock -- on "<user name>"');
      process.exit(1);
    }
    if (current && current !== userName) deleteSecret(current);
    // `security` prompts for the password on the terminal, so it never appears in argv.
    console.log(
      `Enter the local-user password for "${userName}" to store it in your macOS Keychain.`,
    );
    const result = spawnSync(
      '/usr/bin/security',
      ['add-generic-password', '-U', '-s', SERVICE, '-a', userName, '-w'],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) {
      console.error('Could not store the password; auto-unlock stays off.');
      process.exit(1);
    }
    mkdirSync(privateDataDir, { recursive: true });
    writeFileSync(markerFile, `${userName}\n`, { mode: 0o600 });
    console.log(
      'Auto-unlock is ON. The next `ssb start` signs in automatically. A wrong or changed password just shows the login screen.',
    );
  } else if (command === 'off') {
    if (current) deleteSecret(current);
    rmSync(markerFile, { force: true });
    console.log(
      'Auto-unlock is OFF. The password was removed from the Keychain; the login screen will ask each time.',
    );
  } else if (command === 'status') {
    console.log(current ? `Auto-unlock is ON for "${current}".` : 'Auto-unlock is OFF.');
  } else {
    console.error('Usage: npm run auto-unlock -- on "<user name>" | off | status');
    process.exit(1);
  }
}
