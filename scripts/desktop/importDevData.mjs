#!/usr/bin/env node
// One-time copy of local-users data from the dev workspace into the desktop app
// folder (docs/adr/0004-desktop-data-location.md). Copies only; never deletes.
//
//   npm run desktop:import-dev-data -- [--dry-run] [--source <users dir>] [--dest <data root>]
//
// Defaults: --source private-data/dev-sync/users
//           --dest   $SSB_DESKTOP_DATA_DIR or ~/Library/Application Support/SimpleSafeBanking
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const dryRun = flag('--dry-run');
const source = path.resolve(option('--source') || path.join(root, 'private-data', 'dev-sync', 'users'));
const destRoot = path.resolve(option('--dest') || process.env.SSB_DESKTOP_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'SimpleSafeBanking'));
const destUsers = path.join(destRoot, 'users');
const archiveDir = path.join(root, 'backups', 'desktop-import');

function fail(message) {
  console.error(`\nImport refused: ${message}\nNothing was changed.`);
  process.exit(1);
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Relative path -> sha256 for every regular file; refuses symlinks. */
async function manifest(dir) {
  const result = new Map();
  async function walk(current) {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) fail(`symlink found at ${full}`);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.set(path.relative(dir, full), await sha256(full));
    }
  }
  await walk(dir);
  return result;
}

async function tightenModes(dir) {
  await fsp.chmod(dir, 0o700);
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await tightenModes(full);
    else await fsp.chmod(full, 0o600);
  }
}

function running(pattern) {
  return spawnSync('/usr/bin/pgrep', ['-f', pattern], { encoding: 'utf8' }).stdout.trim() !== '';
}

async function devBackendUp() {
  try {
    return (await fetch('http://127.0.0.1:3177/healthz', { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

// 1. Preconditions
const registryFile = path.join(source, 'users.json');
if (!fs.existsSync(registryFile)) {
  fail(`no user registry at ${registryFile}. A legacy single-user workspace must first be migrated by opening the dev app (npm run local) and creating the first user.`);
}
let registry;
try {
  registry = JSON.parse(await fsp.readFile(registryFile, 'utf8'));
} catch {
  fail(`${registryFile} is not valid JSON`);
}
if (registry.version !== 1 || !Array.isArray(registry.users) || registry.users.length === 0) fail('the user registry is empty or has an unknown format');
for (const user of registry.users) {
  if (!/^[a-f0-9-]{36}$/.test(user.id) || !fs.existsSync(path.join(source, user.id, 'workspace.ssbdb'))) fail(`user ${user.id} has no workspace database`);
}
if (fs.existsSync(path.join(destUsers, 'users.json'))) fail(`the desktop app already has users at ${destUsers}. This import never overwrites. Move that folder away first if you really mean to replace it.`);
if (running('SimpleSafeBanking.app/Contents/MacOS/') || running('target/(debug|release)/simplesafebanking-desktop')) fail('the desktop app is running. Quit it first.');
if (!option('--source') && (await devBackendUp())) fail('the dev backend is running on :3177. Stop it first (Ctrl+C in its terminal or scripts/ssb-local.sh stop) so the copy is consistent.');

const sourceManifest = await manifest(source);
console.log(`Source: ${source}`);
console.log(`  ${registry.users.length} user(s): ${registry.users.map((u) => u.name).join(', ')}`);
console.log(`  ${sourceManifest.size} files`);
console.log(`Destination: ${destUsers}`);
if (dryRun) {
  console.log('\nDry run: no files were written.');
  process.exit(0);
}

// 2. Archive the source first (files are already encrypted; keys are password-wrapped).
await fsp.mkdir(archiveDir, { recursive: true, mode: 0o700 });
await fsp.chmod(archiveDir, 0o700); // owner-only before the archive exists, whatever the umask
const archive = path.join(archiveDir, `dev-sync-users-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
const tar = spawnSync('/usr/bin/tar', ['-czf', archive, '-C', path.dirname(source), path.basename(source)], { stdio: 'inherit' });
if (tar.status !== 0) fail('could not archive the source folder');
await fsp.chmod(archive, 0o600);
console.log(`\nArchived source to ${path.relative(root, archive)}`);

// 3. Copy into a staging folder, verify, then rename into place atomically.
await fsp.mkdir(destRoot, { recursive: true, mode: 0o700 });
const staging = path.join(destRoot, `.import-${randomUUID()}`);
try {
  await fsp.cp(source, staging, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
  await tightenModes(staging);
  const copied = await manifest(staging);
  const mismatched = [...sourceManifest].filter(([file, digest]) => copied.get(file) !== digest);
  if (mismatched.length || copied.size !== sourceManifest.size) throw new Error(`verification failed for: ${mismatched.map(([f]) => f).join(', ') || 'file count'}`);
  if (fs.existsSync(destUsers)) {
    const leftovers = await fsp.readdir(destUsers);
    if (leftovers.length) throw new Error(`${destUsers} exists and is not empty`);
    await fsp.rmdir(destUsers);
  }
  await fsp.rename(staging, destUsers);
} catch (error) {
  await fsp.rm(staging, { recursive: true, force: true });
  fail(error.message);
}

console.log(`Copied and verified ${sourceManifest.size} files (sha256) into ${destUsers}`);
console.log('The source was not modified. Open the desktop app and unlock with your usual password.');
