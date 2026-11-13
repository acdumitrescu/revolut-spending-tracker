import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin') throw new Error('This helper requires macOS');
const directory = path.join(root, 'private-data', 'runtime');
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const output = path.join(directory, 'ssb-keychain');
const next = path.join(directory, 'ssb-keychain.next');
await new Promise((resolve, reject) => {
  const child = spawn(
    '/usr/bin/swiftc',
    [
      path.join(root, 'scripts', 'keychain-helper.swift'),
      '-module-cache-path',
      path.join(directory, 'module-cache'),
      '-o',
      next,
    ],
    { stdio: 'inherit' },
  );
  child.on('error', reject);
  child.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error('Keychain helper compilation failed')),
  );
});
await fs.chmod(next, 0o700);
await fs.rename(next, output);
console.log('Application-local Keychain helper compiled. No Keychain item was created or changed.');
