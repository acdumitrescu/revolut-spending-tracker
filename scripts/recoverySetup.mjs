import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readDatabaseKey } from '../backend/keychain.js';
import { encodeRecoveryKey, decodeRecoveryKey, verifyRecoveryBackup } from '../backend/recoveryKey.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function run(command, args, input, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', capture ? 'pipe' : 'ignore', 'ignore'] });
    const chunks = [];
    let length = 0;
    child.stdin.on('error', () => {});
    child.stdout?.on('data', chunk => {
      chunks.push(chunk); length += chunk.length;
      if (length > 128) child.kill();
    });
    child.on('error', () => reject(new Error('Recovery helper could not start')));
    child.on('close', code => {
      const output = Buffer.concat(chunks);
      chunks.forEach(chunk => chunk.fill(0));
      if (code !== 0 || length > 128) { output.fill(0); reject(new Error('Recovery setup cancelled or failed; no verification recorded')); }
      else resolve(output);
    });
    child.stdin.end(input);
  });
}

let key;
let recovered;
let temporary;
try {
  const userRegistry = await fs.readFile(path.join(root, 'private-data/dev-sync/users/users.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (userRegistry?.users?.length) throw new Error('Local users are active. Unlock the intended user and use Download recovery copy in SSB. Legacy recovery verification remains available with --verify.');
  if (process.platform !== 'darwin') throw new Error('Recovery setup requires macOS');
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-recovery-'));
  const binary = path.join(temporary, 'recovery-window');
  await run('/usr/bin/swiftc', [path.join(root, 'scripts/recovery-window.swift'), '-module-cache-path', path.join(root, 'private-data/runtime/module-cache'), '-o', binary]);
  await fs.chmod(binary, 0o700);
  const backupDir = path.join(root, 'backups/automatic');
  const candidates = await Promise.all((await fs.readdir(backupDir)).filter(name => name.endsWith('.ssbdb') && !name.startsWith('.')).map(async name => ({name, stat: await fs.lstat(path.join(backupDir, name))})));
  const latest = candidates.filter(item => item.stat.isFile() && !item.stat.isSymbolicLink()).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0];
  if (!latest) throw new Error('Create an encrypted backup in the app before recovery setup');
  const copy = path.join(temporary, 'backup.ssbdb');
  await fs.copyFile(path.join(backupDir, latest.name), copy, fs.constants.COPYFILE_EXCL);
  await fs.chmod(copy, 0o600);
  key = await readDatabaseKey(path.join(root, 'private-data/runtime/ssb-keychain'));
  await verifyRecoveryBackup(copy, key);
  const answer = await run(binary, [], encodeRecoveryKey(key), true);
  try { recovered = decodeRecoveryKey(answer.toString('utf8')); } finally { answer.fill(0); }
  const result = await verifyRecoveryBackup(copy, recovered);
  await fs.writeFile(path.join(root, 'private-data/dev-sync/recovery-verification.json'), JSON.stringify({ ...result, checkedAt: new Date().toISOString(), backup: latest.name, method: 'password-manager-paste-back', offDeviceAvailabilityVerified: false }, null, 2), {mode: 0o600});
  console.log('Saved-key paste-back and encrypted backup verified. Check this entry on another trusted device, and keep an off-device encrypted backup. Original recovery files were preserved.');
  await run('/usr/bin/osascript', ['-e', 'display dialog "The pasted recovery key successfully opened and verified an encrypted backup. Check the saved entry on another trusted device and keep an off-device encrypted backup. Original recovery files remain untouched." with title "SSB recovery verified" buttons {"OK"} default button "OK"']);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  key?.fill(0); recovered?.fill(0);
  // Remove only our own known temporary files; never recurse through user data.
  if (temporary) {
    for (const name of ['backup.ssbdb', 'backup.ssbdb-journal', 'recovery-window']) await fs.unlink(path.join(temporary, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(temporary);
  }
}
