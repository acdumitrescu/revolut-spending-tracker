#!/usr/bin/env node
// `tauri dev` beforeDevCommand. Reuses an already-running personal dev server
// (npm run local / ssb start) instead of failing on its ports; otherwise starts
// one with the saved token. Tauri stops this process when the dev window closes.
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const devUrl = 'http://127.0.0.1:5173/app';

async function reachable() {
  try {
    return (await fetch(devUrl, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

if (await reachable()) {
  console.log(`[desktop:dev] Reusing the personal dev server already running at ${devUrl}. Stop it there, not here.`);
  setInterval(() => {}, 1 << 30); // stay alive until Tauri stops us
} else {
  console.log('[desktop:dev] Starting the personal dev server (scripts/startPersonalDev.mjs --use-saved-token).');
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'startPersonalDev.mjs'), '--use-saved-token'], { cwd: root, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 0));
}
