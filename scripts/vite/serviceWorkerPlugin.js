/* global process */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

// Emits sw.js for the client-only build so the app opens offline once installed on a phone.
// Private-sync and desktop builds get no service worker: they talk to a local backend and must
// never be served stale. Registration is gated the same way in src/lib/registerServiceWorker.js.

const NEVER_PRECACHED = [
  /^sw\.js$/,
  /^_redirects$/,
  /\.map$/,
  /^demo-revolut\.csv$/,
  // The lazily loaded spreadsheet export is large; it is cached on first use instead.
  /^assets\/exceljs[.-]/,
];

/** Same rule as src/lib/runtimeConfig.js: explicit profile, else the old server-sync flag. */
export function resolveDeploymentProfile(env = {}) {
  const raw = env.VITE_DEPLOYMENT_PROFILE;
  if (raw === 'client-only' || raw === 'private-sync') return raw;
  return env.VITE_ENABLE_SERVER_SYNC === 'true' ? 'private-sync' : 'client-only';
}

export function shouldEmitServiceWorker({ mode, env }) {
  return mode !== 'desktop' && resolveDeploymentProfile(env) === 'client-only';
}

/** Pure: output file paths (relative to the output root) -> sorted URL list to precache. */
export function buildPrecacheList(files) {
  const urls = new Set();
  for (const raw of files) {
    const file = raw.split(path.sep).join('/').replace(/^\/+/, '');
    if (NEVER_PRECACHED.some((pattern) => pattern.test(file))) continue;
    urls.add(file === 'index.html' ? '/' : `/${file}`);
  }
  return [...urls].sort();
}

/** Pure: a stable cache name; changes whenever the file list or any listed file's bytes change. */
export function buildCacheName(precache, digests = []) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(precache));
  for (const digest of digests) hash.update(digest);
  return `ssb-${hash.digest('hex').slice(0, 12)}`;
}

/** Pure: the service worker source. */
export function renderServiceWorker({ cacheName, precache }) {
  return `// Generated at build time by scripts/vite/serviceWorkerPlugin.js. Do not edit.
const CACHE_PREFIX = 'ssb-';
const CACHE_NAME = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache, null, 2)};
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function store(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response);
}

async function navigate(event) {
  const network = fetch(event.request).then((response) => {
    if (response.ok) event.waitUntil(store('/', response.clone()));
    return response;
  });
  network.catch(() => {});
  const fallback = async () => {
    const cache = await caches.open(CACHE_NAME);
    return cache.match('/');
  };
  try {
    const timeout = new Promise((_, reject) => setTimeout(reject, NAVIGATION_TIMEOUT_MS));
    const response = await Promise.race([network, timeout]);
    return response.ok ? response : (await fallback()) || response;
  } catch {
    return (await fallback()) || network;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await store(request, response.clone());
  return response;
}

async function networkThenCache(request) {
  try {
    const response = await fetch(request);
    await store(request, response.clone());
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Same-origin only. API calls and third-party hosts (FX rates) are never touched.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkThenCache(request));
  }
});
`;
}

function listFiles(root, dir = root) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(root, full) : [path.relative(root, full)];
  });
}

export default function serviceWorkerPlugin() {
  let config;
  let emit = false;
  return {
    name: 'ssb-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
      const env = {
        ...loadEnv(resolved.mode, resolved.envDir || resolved.root, 'VITE_'),
        ...Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key.startsWith('VITE_')),
        ),
      };
      emit = shouldEmitServiceWorker({ mode: resolved.mode, env });
    },
    closeBundle: {
      order: 'post',
      handler() {
        if (!emit) return;
        const outDir = path.resolve(config.root, config.build.outDir);
        const precache = buildPrecacheList(listFiles(outDir));
        // Unhashed files (manifest, icons) can change without their name changing.
        const digests = precache
          .filter((url) => !url.startsWith('/assets/'))
          .map((url) =>
            createHash('sha256')
              .update(readFileSync(path.join(outDir, url === '/' ? 'index.html' : url.slice(1))))
              .digest('hex'),
          );
        const cacheName = buildCacheName(precache, digests);
        writeFileSync(path.join(outDir, 'sw.js'), renderServiceWorker({ cacheName, precache }));
      },
    },
  };
}
