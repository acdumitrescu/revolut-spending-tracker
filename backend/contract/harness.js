// Black-box harness for the backend contract (docs/backend-contract.md).
// It only spawns a process and speaks HTTP, so the same suite can validate a
// future non-Node backend: set SSB_CONTRACT_BACKEND_CMD="path/to/binary [args]".
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Every spawned backend is tracked and SIGKILLed when the test worker exits, so a
// failing or timed-out test can never leave an orphaned server behind.
const liveChildren = new Set();
process.once('exit', () => {
  for (const child of liveChildren) {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
});

export const STRONG_PASSWORD = 'contract-test-password-0123456789';

export function backendCommand() {
  const custom = String(process.env.SSB_CONTRACT_BACKEND_CMD || '').trim();
  if (custom) {
    const [program, ...args] = custom.split(/\s+/);
    return { program, args };
  }
  return { program: process.execPath, args: [path.join(repoRoot, 'backend', 'server.js')] };
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function makeDataRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-contract-'));
  await fs.chmod(root, 0o700);
  return root;
}

/** Local-users environment: encrypted local-users mode on loopback. */
export function localUsersEnv({ port, token, dataRoot, extra = {} }) {
  const origin = `http://127.0.0.1:${port}`;
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    HOST: '127.0.0.1',
    PORT: String(port),
    SSB_SYNC_TOKEN: token,
    ALLOWED_ORIGINS: origin,
    SSB_STORAGE: 'sqlcipher',
    SSB_LOCAL_USERS: 'true',
    SSB_DATABASE_FILE: path.join(dataRoot, 'workspace.ssbdb'),
    SSB_BACKUP_DIR: path.join(dataRoot, 'backups'),
    ...extra,
  };
}

export async function startBackend({ dataRoot, extraEnv = {}, stdin = 'ignore' } = {}) {
  const port = await freePort();
  const token = randomBytes(32).toString('hex');
  const { program, args } = backendCommand();
  const child = spawn(program, args, {
    cwd: repoRoot,
    env: localUsersEnv({ port, token, dataRoot, extra: extraEnv }),
    stdio: [stdin, 'pipe', 'pipe'],
  });
  liveChildren.add(child);
  child.on('exit', () => liveChildren.delete(child));
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  );

  const backend = {
    port,
    token,
    origin: `http://127.0.0.1:${port}`,
    child,
    exited,
    output: () => output,
    request: (options) => request({ port, token, origin: `http://127.0.0.1:${port}`, ...options }),
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const result = await withTimeout(exited, 10_000, 'backend did not exit after SIGTERM');
      return result;
    },
  };

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`backend exited during startup (${child.exitCode}):\n${output}`);
    try {
      const response = await request({ port, path: '/healthz', auth: false });
      if (response.status === 200) return backend;
    } catch {
      /* still starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill('SIGKILL');
  throw new Error(`backend did not become healthy within 15s:\n${output}`);
}

/**
 * Minimal HTTP client with full header control (fetch forbids overriding Host).
 * Defaults model the real UI: bearer token, same-origin Origin on writes.
 */
export function request({
  port,
  token,
  origin,
  method = 'GET',
  path: urlPath,
  body,
  rawBody,
  session,
  auth = true,
  headers = {},
}) {
  // `rawBody` sends bytes as-is (declared as JSON), so tests can send malformed JSON.
  const payload =
    rawBody !== undefined
      ? Buffer.from(rawBody)
      : body === undefined
        ? undefined
        : Buffer.from(JSON.stringify(body));
  const finalHeaders = {
    Host: `127.0.0.1:${port}`,
    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...(method !== 'GET' && origin ? { Origin: origin } : {}),
    ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
    ...(session ? { 'x-ssb-session': session } : {}),
    ...headers,
  };
  for (const [name, value] of Object.entries(finalHeaders))
    if (value === undefined) delete finalHeaders[name];
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: finalHeaders },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode, headers: res.headers, text, json });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

export function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}
