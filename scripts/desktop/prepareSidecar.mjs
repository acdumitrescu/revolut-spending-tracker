#!/usr/bin/env node
// Stage everything the Tauri bundle needs (docs/desktop/building.md):
//   src-tauri/binaries/node-<triple>     pinned Node runtime (sha256-verified)
//   src-tauri/resources/staged/backend   backend sources + production node_modules,
//                                         installed under the *bundled* Node so the
//                                         SQLCipher native module matches its ABI
//   src-tauri/resources/staged/dist      the desktop web build (dist-desktop/)
//
// --placeholders  only create stand-ins when missing, so `cargo check/test` work
//                 in a fresh checkout without downloading anything.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pin = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'node-version.json'), 'utf8'));
const triple = hostTriple();
const platform = pin.platforms[triple];
const tauriDir = path.join(root, 'src-tauri');
const sidecarFile = path.join(tauriDir, 'binaries', `node-${triple}`);
const stagedDir = path.join(tauriDir, 'resources', 'staged');
const stagedBackend = path.join(stagedDir, 'backend');
const stagedDist = path.join(stagedDir, 'dist');
const cacheDir = path.join(root, 'desktop', 'cache');
const placeholderMarker = 'ssb-desktop-placeholder';
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

function hostTriple() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin';
  throw new Error(`Unsupported desktop build host: ${process.platform}/${process.arch}`);
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.signal})`);
  return result;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function placeholders() {
  if (!fs.existsSync(sidecarFile)) {
    await fsp.mkdir(path.dirname(sidecarFile), { recursive: true });
    await fsp.writeFile(sidecarFile, `#!/bin/sh\n# ${placeholderMarker}\necho "Placeholder runtime. Run: npm run desktop:prepare" >&2\nexit 1\n`, { mode: 0o755 });
    console.log(`created placeholder ${path.relative(root, sidecarFile)}`);
  }
  for (const dir of [stagedBackend, stagedDist]) {
    if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(path.join(dir, 'PLACEHOLDER.txt'), `${placeholderMarker}: run npm run desktop:prepare\n`);
      console.log(`created placeholder ${path.relative(root, dir)}/`);
    }
  }
}

/** Environment for build-time child processes: no inherited tokens or credentials. */
function minimalEnv(extra = {}) {
  const env = { npm_config_update_notifier: 'false', ...extra };
  for (const key of ['HOME', 'TMPDIR', 'LANG', 'USER']) if (process.env[key]) env[key] = process.env[key];
  env.PATH = `${extra.PATH ? `${extra.PATH}:` : ''}/usr/bin:/bin:/usr/sbin:/sbin:${path.dirname(process.execPath)}`;
  return env;
}

/** The pin must also match what nodejs.org publishes (guards against a wrong or tampered pin). */
async function crossCheckPublishedChecksum() {
  const url = `https://nodejs.org/dist/v${pin.version}/SHASUMS256.txt`;
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`cannot fetch ${url}: HTTP ${response.status}`);
  const line = (await response.text()).split('\n').find((l) => l.trim().endsWith(`  ${platform.archive}`));
  const published = line?.trim().split(/\s+/)[0];
  if (published !== platform.sha256) throw new Error(`pinned sha256 for ${platform.archive} does not match nodejs.org SHASUMS256.txt (published ${published ?? 'none'})`);
  console.log('pinned sha256 matches nodejs.org SHASUMS256.txt');
}

async function stageNode() {
  step(`Node ${pin.version} for ${triple}`);
  if (!platform) throw new Error(`desktop/node-version.json has no entry for ${triple}`);
  await fsp.mkdir(cacheDir, { recursive: true });
  const archive = path.join(cacheDir, platform.archive);
  if (!fs.existsSync(archive)) {
    const url = `https://nodejs.org/dist/v${pin.version}/${platform.archive}`;
    console.log(`downloading ${url}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_ARCHIVE_BYTES) throw new Error(`refusing a ${declared} byte download (limit ${MAX_ARCHIVE_BYTES})`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_ARCHIVE_BYTES) throw new Error(`refusing a ${body.length} byte download (limit ${MAX_ARCHIVE_BYTES})`);
    const partial = `${archive}.partial`;
    await fsp.writeFile(partial, body);
    await fsp.rename(partial, archive);
    await crossCheckPublishedChecksum();
  }
  const digest = await sha256(archive);
  if (digest !== platform.sha256) {
    await fsp.rm(archive, { force: true });
    throw new Error(`checksum mismatch for ${platform.archive}: got ${digest}, pinned ${platform.sha256}. Deleted the archive.`);
  }
  console.log('sha256 verified');

  const extractRoot = path.join(cacheDir, platform.archive.replace(/\.tar\.gz$/, ''));
  const nodeBin = path.join(extractRoot, 'bin', 'node');
  if (!fs.existsSync(nodeBin)) run('/usr/bin/tar', ['-xzf', archive, '-C', cacheDir, '--no-same-owner']);
  const version = spawnSync(nodeBin, ['--version'], { encoding: 'utf8' }).stdout.trim();
  if (version !== `v${pin.version}`) throw new Error(`extracted node reports ${version}, expected v${pin.version}`);

  await fsp.mkdir(path.dirname(sidecarFile), { recursive: true });
  await fsp.copyFile(nodeBin, sidecarFile);
  await fsp.chmod(sidecarFile, 0o755);
  console.log(`staged ${path.relative(root, sidecarFile)}`);
  return path.dirname(nodeBin);
}

/** Backend runtime files = the Dockerfile's COPY list (single source of truth). */
function backendRuntimeFiles() {
  const dockerfile = fs.readFileSync(path.join(root, 'backend', 'Dockerfile'), 'utf8');
  const line = dockerfile.split('\n').find((l) => /^COPY\s+server\.js\b/.test(l));
  if (!line) throw new Error('backend/Dockerfile has no "COPY server.js ..." line to read the file list from');
  const files = line.trim().split(/\s+/).slice(1, -1);
  return ['package.json', 'package-lock.json', ...files];
}

async function stageBackend(nodeBinDir) {
  step('backend (production dependencies under the bundled Node)');
  await fsp.rm(stagedBackend, { recursive: true, force: true });
  await fsp.mkdir(stagedBackend, { recursive: true });
  for (const file of backendRuntimeFiles()) {
    await fsp.copyFile(path.join(root, 'backend', file), path.join(stagedBackend, file));
  }
  // Lifecycle scripts (the SQLCipher native build) run with a minimal environment.
  const env = minimalEnv({ PATH: nodeBinDir });
  run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund', '--no-bin-links'], { cwd: stagedBackend, env });
  if (process.env.SSB_SKIP_AUDIT === '1') console.log('skipping npm audit (SSB_SKIP_AUDIT=1)');
  else run('npm', ['audit', '--omit=dev', '--audit-level=high'], { cwd: stagedBackend, env });
  await pruneBuildArtifacts();
  // Verified after pruning, so the check covers exactly what ships.
  const nodeBin = path.join(nodeBinDir, 'node');
  run(nodeBin, ['-e', "require('@journeyapps/sqlcipher'); console.log('sqlcipher native module loads under bundled Node', process.version)"], { cwd: stagedBackend, env });
  const syntax = spawnSync(nodeBin, ['--check', 'server.js'], { cwd: stagedBackend, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`staged server.js failed --check:\n${syntax.stderr}`);
}

/** Drop compile-time leftovers (C sources, object files, headers): ~17 MB. */
async function pruneBuildArtifacts() {
  const modules = path.join(stagedBackend, 'node_modules');
  const sqlcipher = path.join(modules, '@journeyapps', 'sqlcipher');
  const keep = path.join(sqlcipher, 'build', 'Release', 'node_sqlite3.node');
  if (!fs.existsSync(keep)) throw new Error('SQLCipher native module missing after install');
  const saved = await fsp.readFile(keep);
  for (const dir of ['deps', 'src', 'build']) await fsp.rm(path.join(sqlcipher, dir), { recursive: true, force: true });
  await fsp.mkdir(path.dirname(keep), { recursive: true });
  await fsp.writeFile(keep, saved, { mode: 0o755 });
  await fsp.rm(path.join(modules, 'node-addon-api'), { recursive: true, force: true });
  console.log('pruned native build leftovers');
}

async function stageDist() {
  step('desktop web build');
  const source = path.join(root, 'dist-desktop');
  if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('dist-desktop/index.html missing. Run: npm run build:desktop-web');
  await fsp.rm(stagedDist, { recursive: true, force: true });
  await fsp.cp(source, stagedDist, { recursive: true });
}

async function privacyGuard() {
  step('privacy guard on staged files');
  const offenders = [];
  const forbidden = /(^|\/)(private-data|personal-data|backups|exports|imports|tmp-data|XTB)(\/|$)|\.ssbdb$|\.ssbuser$|app-state\.json$|session-token$/;
  async function walk(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(stagedDir, full);
      if (forbidden.test(rel)) offenders.push(rel);
      if (entry.isDirectory()) await walk(full);
    }
  }
  await walk(stagedDir);
  if (offenders.length) throw new Error(`staged resources contain private-looking paths:\n${offenders.join('\n')}`);
  console.log('no private data in staged resources');
}

try {
  if (process.argv.includes('--placeholders')) {
    await placeholders();
  } else {
    const nodeBinDir = await stageNode();
    await stageBackend(nodeBinDir);
    await stageDist();
    await privacyGuard();
    console.log('\nSidecar and resources staged. Next: npx tauri build --bundles app');
  }
} catch (error) {
  console.error(`\nprepareSidecar failed: ${error.message}`);
  process.exit(1);
}
