import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import fs from 'node:fs/promises';

export async function readDatabaseKey(helperPath) {
  if (process.platform !== 'darwin') throw new Error('macOS Keychain is required for automatic database unlock');
  const info = await fs.lstat(helperPath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o022)) throw new Error('Unsafe Keychain helper executable');
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, ['read'], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin' } });
    const chunks = [];
    let length = 0;
    let timer;
    const fail = () => { for (const chunk of chunks) chunk.fill(0); reject(new Error('Database key unavailable; no plaintext fallback')); };
    child.stdout.on('data', (chunk) => { length += chunk.length; chunks.push(chunk); if (length > 32) child.kill(); });
    child.stderr.resume(); // Keychain diagnostics must not enter server logs.
    child.on('error', () => { clearTimeout(timer); fail(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || length !== 32) return fail();
      const key = Buffer.concat(chunks);
      for (const chunk of chunks) chunk.fill(0);
      resolve(key);
    });
    timer = setTimeout(() => child.kill(), 30_000);
  });
}
