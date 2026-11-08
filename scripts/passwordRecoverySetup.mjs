import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { readDatabaseKey } from '../backend/keychain.js';
import { verifyRecoveryBackup } from '../backend/recoveryKey.js';
import { protectRecoveryKey, unlockRecoveryKey } from '../backend/passwordRecovery.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', capture ? 'pipe' : 'ignore', 'ignore']});
    const chunks = [];
    let length = 0;
    child.stdout?.on('data', chunk => { chunks.push(chunk); length += chunk.length; if (length > 256) child.kill(); });
    child.on('error', () => reject(new Error('Recovery window could not start')));
    child.on('close', code => {
      const result = Buffer.concat(chunks);
      chunks.forEach(chunk => chunk.fill(0));
      if (code !== 0 || length > 256) { result.fill(0); reject(new Error('Recovery cancelled or helper failed. No live data was changed.')); }
      else resolve(result);
    });
  });
}
async function regularFile(filename, maxSize = Infinity) {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxSize) throw new Error('Invalid recovery input file');
}

let temporary, key, password, recovered;
try {
  const args = process.argv.slice(2);
  const verifyOnly = args.length === 2 && args[0] === '--verify';
  if (args.length && !verifyOnly) throw new Error('Use no arguments to create, or --verify RECOVERY_FOLDER');
  const userRegistry = await fs.readFile(path.join(root, 'private-data/dev-sync/users/users.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!verifyOnly && userRegistry?.users?.length) throw new Error('Local users are active. Unlock the intended user and use Download recovery copy in SSB. Legacy recovery verification remains available with --verify.');
  if (process.platform !== 'darwin') throw new Error('This recovery window requires macOS');
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-password-recovery-'));
  const binary = path.join(temporary, 'password-window');
  await run('/usr/bin/swiftc', [path.join(root, 'scripts/recovery-password-window.swift'), '-module-cache-path', path.join(root, 'private-data/runtime/module-cache'), '-o', binary]);
  await fs.chmod(binary, 0o700);
  let folder, source, backupName;
  if (verifyOnly) {
    folder = path.resolve(args[1]);
    source = path.join(folder, 'backup.ssbdb');
    await regularFile(path.join(folder, 'recovery-key.ssbkey'), 4096);
  } else {
    const backupDir = path.join(root, 'backups/automatic');
    const candidates = await Promise.all((await fs.readdir(backupDir)).filter(name => name.endsWith('.ssbdb') && !name.startsWith('.')).map(async name => ({name, stat: await fs.lstat(path.join(backupDir, name))})));
    const latest = candidates.filter(item => item.stat.isFile() && !item.stat.isSymbolicLink()).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
    if (!latest) throw new Error('Create an encrypted backup in the app first');
    backupName = latest.name;
    source = path.join(backupDir, backupName);
  }
  await regularFile(source);
  const copy = path.join(temporary, 'backup.ssbdb');
  await fs.copyFile(source, copy, fs.constants.COPYFILE_EXCL);
  await fs.chmod(copy, 0o600);
  if (!verifyOnly) {
    key = await readDatabaseKey(path.join(root, 'private-data/runtime/ssb-keychain'));
    await verifyRecoveryBackup(copy, key);
  }
  password = await run(binary, [verifyOnly ? 'verify' : 'create'], true);
  if (!verifyOnly) {
    const envelope = await protectRecoveryKey(key, password);
    const parent = path.join(root, 'backups/recovery');
    await fs.mkdir(parent, {recursive: true, mode: 0o700});
    folder = path.join(parent, `recovery-${new Date().toISOString().slice(0, 10)}-${randomUUID()}`);
    await fs.mkdir(folder, {mode: 0o700});
    await fs.writeFile(path.join(folder, 'recovery-key.ssbkey'), JSON.stringify(envelope, null, 2), {flag: 'wx', mode: 0o600});
    await fs.copyFile(copy, path.join(folder, 'backup.ssbdb'), fs.constants.COPYFILE_EXCL);
    await fs.chmod(path.join(folder, 'backup.ssbdb'), 0o600);
    // Verify the files actually written, not just the in-memory envelope.
    await fs.copyFile(path.join(folder, 'backup.ssbdb'), copy);
  }
  const envelope = JSON.parse(await fs.readFile(path.join(folder, 'recovery-key.ssbkey'), 'utf8'));
  recovered = await unlockRecoveryKey(envelope, password);
  password.fill(0);
  key?.fill(0);
  const result = await verifyRecoveryBackup(copy, recovered);
  if (!verifyOnly) {
    await fs.writeFile(path.join(folder, 'verification.json'), JSON.stringify({...result, verifiedAt: new Date().toISOString(), sourceBackup: backupName, method: 'password-protected-key-and-backup', offDeviceAvailabilityVerified: false}, null, 2), {flag: 'wx', mode: 0o600});
    await fs.writeFile(path.join(folder, 'README.txt'), 'SSB password-protected recovery copy\n\nKeep this entire folder on a separate trusted device or offline drive. Keep the recovery password separately in Apple Passwords.\n\nrecovery-key.ssbkey: password-encrypted SQLCipher key (scrypt N=131072,r=8,p=1; AES-256-GCM).\nbackup.ssbdb: encrypted database snapshot, not an ongoing backup.\nverification.json: snapshot verification time and source backup.\n\nVerify from an installed SSB personal checkout:\nnpm run recovery:password -- --verify "/path/to/this/folder"\nThis prompts locally, needs no original Keychain key, and does not change the live app.\n\nKeep original recovery copies until off-device storage and password availability are confirmed. A fresh app backup and a new recovery folder are needed to protect later edits.\n', {flag: 'wx', mode: 0o600});
  }
  console.log(`Recovery copy verified without using Keychain for decryption: ${folder}`);
  if (!verifyOnly) await run('/usr/bin/open', [folder]);
  await run('/usr/bin/osascript', ['-e', 'display dialog "The password-protected key successfully unlocked and verified the encrypted backup. Keep the recovery folder off this Mac and save your password separately in Apple Passwords. Original recovery files remain untouched." with title "SSB recovery verified" buttons {"OK"} default button "OK"']);
} catch (error) {
  // Do not print input, subprocess diagnostics, crypto internals or secret bytes.
  console.error(error instanceof SyntaxError ? 'Invalid recovery file' : error.message);
  process.exitCode = 1;
} finally {
  key?.fill(0); password?.fill(0); recovered?.fill(0);
  if (temporary) {
    for (const name of ['backup.ssbdb', 'backup.ssbdb-journal', 'password-window']) await fs.unlink(path.join(temporary, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(temporary);
  }
}
