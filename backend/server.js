/* global Buffer, process */
import express from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createLocalUsers } from './localUsers.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAppStateFile, resolveVendorObservationsFile } from './storagePath.js';
import { isSafeSyncToken } from './syncToken.js';
import { fetchYahooQuotes, searchYahooInstruments } from './yahooQuotes.js';
import { writePortableBackup } from './backups.js';
import { validateState } from './validateState.js';
import { hostGuard, requestBoundary, securityHeaders } from './requestBoundary.js';
import { readDatabaseKey } from './keychain.js';
import { openEncryptedStore } from './encryptedStore.js';
import { createEncryptedBackup } from './encryptedBackups.js';
import { applyWorkspaceChanges } from './workspaceChanges.js';

const PORT = Number.parseInt(process.env.PORT || '3177', 10);
// Loopback by default. The Docker image sets HOST=0.0.0.0 explicitly (backend/Dockerfile).
const HOST = process.env.HOST || '127.0.0.1';
const APP_STATE_FILE = resolveAppStateFile(process.env.APP_STATE_FILE);
const VENDOR_OBSERVATIONS_FILE = resolveVendorObservationsFile(
  process.env.VENDOR_OBSERVATIONS_FILE,
);
const APP_STATE_BACKUP_FILE = `${APP_STATE_FILE}.bak`;
const VENDOR_OBSERVATIONS_BACKUP_FILE = `${VENDOR_OBSERVATIONS_FILE}.bak`;
const MAX_PAYLOAD_BYTES = Number.parseInt(
  process.env.APP_STATE_MAX_BYTES || String(5 * 1024 * 1024),
  10,
);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
const encryptedMode = process.env.SSB_STORAGE === 'sqlcipher';
const usersMode = encryptedMode && process.env.SSB_LOCAL_USERS === 'true';
const userContext = new AsyncLocalStorage();
let databaseKey;
let encryptedStore;
if (encryptedMode && !usersMode) {
  if (!process.env.SSB_DATABASE_FILE || !process.env.SSB_KEYCHAIN_HELPER)
    throw new Error('Encrypted storage configuration missing');
  databaseKey = await readDatabaseKey(process.env.SSB_KEYCHAIN_HELPER);
  encryptedStore = await openEncryptedStore({
    filename: process.env.SSB_DATABASE_FILE,
    key: databaseKey,
  });
  if (!(await encryptedStore.read()).data)
    throw new Error('Encrypted store not initialized; refusing empty fallback');
}

let writeQueue = Promise.resolve();

function getConfiguredSyncToken() {
  return String(process.env.SSB_SYNC_TOKEN || '').trim();
}

function hasValidConfiguredSyncToken() {
  return isSafeSyncToken(getConfiguredSyncToken());
}

function tokensMatch(providedToken, expectedToken) {
  const provided = crypto.createHash('sha256').update(providedToken).digest();
  const expected = crypto.createHash('sha256').update(expectedToken).digest();
  return crypto.timingSafeEqual(provided, expected);
}

function authenticatePrivateApi(req, res, next) {
  const expectedToken = getConfiguredSyncToken();
  const authorization = String(req.headers.authorization || '');
  const providedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!hasValidConfiguredSyncToken()) {
    return res.status(503).json({
      error: 'Private sync authentication is not configured safely',
    });
  }

  if (!providedToken || !tokensMatch(providedToken, expectedToken)) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({
      error: 'Private sync authentication required',
    });
  }

  return next();
}

const ALLOWED_HOSTS = String(process.env.SSB_ALLOWED_HOSTS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
app.use(securityHeaders());
app.use(hostGuard({ allowedHosts: ALLOWED_HOSTS }));
app.use('/api', authenticatePrivateApi);
app.use('/api', (req, res, next) =>
  requestBoundary({
    allowedHosts: ALLOWED_HOSTS,
    allowedOrigins: ALLOWED_ORIGINS.length
      ? ALLOWED_ORIGINS
      : ['http://127.0.0.1:3176', 'http://localhost:3176'],
  })(req, res, next),
);
app.use('/api/users/restore', express.json({ limit: '30mb' }));
app.use(express.json({ limit: `${Math.ceil(MAX_PAYLOAD_BYTES / (1024 * 1024))}mb` }));

const users = usersMode
  ? await createLocalUsers({
      autoLockDisabled:
        process.env.SSB_TRUSTED_DEV_PROXY === 'true' &&
        process.env.SSB_DEV_DISABLE_AUTO_LOCK === 'true' &&
        HOST === '127.0.0.1',
      allowWeakTestPasswords: process.env.SSB_ALLOW_WEAK_TEST_PASSWORDS === 'true',
      root:
        process.env.SSB_USERS_DIR ||
        path.join(path.dirname(process.env.SSB_DATABASE_FILE), 'users'),
      readLegacy: (await fs
        .stat(process.env.SSB_DATABASE_FILE)
        .then(() => true)
        .catch((error) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        }))
        ? async () => {
            // Existing database is only unlocked during first-user migration.
            const key = await readDatabaseKey(process.env.SSB_KEYCHAIN_HELPER);
            let store;
            try {
              store = await openEncryptedStore({ filename: process.env.SSB_DATABASE_FILE, key });
              await store.integrity();
              const data = (await store.read()).data;
              if (!data) throw new Error('Existing workspace is empty; refusing migration');
              const observations = await store.getDocument('vendor-observations');
              await createEncryptedBackup({
                backupDir: process.env.SSB_BACKUP_DIR,
                key,
                data,
                reason: 'recovery',
                observations,
              });
              return { data, observations };
            } finally {
              if (store) await store.close();
              key.fill(0);
            }
          }
        : null,
    })
  : null;
const getStore = () => (usersMode ? userContext.getStore()?.store : encryptedStore);
const getKey = () => (usersMode ? userContext.getStore()?.key : databaseKey);
const getBackupDir = () =>
  usersMode ? userContext.getStore()?.backupDir : process.env.SSB_BACKUP_DIR;

if (users) {
  const userAction = (work) => async (req, res) => {
    try {
      res.json(await work(req));
    } catch (error) {
      res.status(error.status || 500).json({
        error: error.status
          ? error.message
          : 'Local user operation failed. Your existing data has not been replaced.',
      });
    } finally {
      if (req.body?.password) req.body.password = '';
    }
  };
  app.get(
    '/api/users',
    userAction(() => users.list()),
  );
  app.post(
    '/api/users',
    userAction((req) => users.create(req.body)),
  );
  app.post(
    '/api/users/unlock',
    userAction((req) => users.unlock(req.body)),
  );
  app.post(
    '/api/users/restore',
    userAction((req) => users.restore(req.body)),
  );
  app.post(
    '/api/users/lock',
    userAction(async (req) => {
      await users.revoke(String(req.headers['x-ssb-session'] || ''));
      return { locked: true };
    }),
  );

  // Bind each handler for its entire async lifetime, including an aborted client.
  // A user ID in a URL, header, or payload can never switch the database.
  for (const method of ['get', 'post']) {
    const register = app[method].bind(app);
    app[method] = (route, ...handlers) => {
      if (!route.startsWith('/api/')) return register(route, ...handlers);
      return register(
        route,
        ...handlers.map((handler) => async (req, res, next) => {
          let lease;
          try {
            lease = await users.acquire(String(req.headers['x-ssb-session'] || ''));
            await userContext.run(lease.session, () => handler(req, res, next));
          } catch (error) {
            if (!res.headersSent)
              res
                .status(error.status || 500)
                .json({ error: error.status === 401 ? error.message : 'User request failed' });
          } finally {
            if (lease) await lease.release();
          }
        }),
      );
    };
  }
  app.get('/api/users/session', async (_req, res) => {
    const { id, name } = userContext.getStore().user;
    res.json({ user: { id, name } });
  });
  app.post('/api/users/recovery', async (_req, res) => {
    res.json(await withSerializedWrite(() => users.exportRecovery(userContext.getStore())));
  });
}

function getEmptyState() {
  return {
    data: null,
    version: 0,
    updatedAt: null,
  };
}

function getEmptyObservations() {
  return {
    schemaVersion: 1,
    updatedAt: null,
    observations: {},
  };
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

async function readStateFileAt(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    data: parsed?.data && typeof parsed.data === 'object' ? parsed.data : null,
    version: Number.isInteger(parsed?.version) && parsed.version >= 0 ? parsed.version : 0,
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
  };
}

async function restoreReadableBackup(primaryFile, backupFile, readBackup, label) {
  try {
    const recovered = await readBackup(backupFile);
    await fs.copyFile(backupFile, primaryFile);
    await fs.chmod(primaryFile, 0o600);
    console.warn(`${label} recovered from the last-known-good backup.`);
    return { ...recovered, recoveredFromBackup: true };
  } catch {
    return null;
  }
}

async function readStateFile() {
  if (getStore()) return getStore().read();
  try {
    return await readStateFileAt(APP_STATE_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') return getEmptyState();
    const recovered = await restoreReadableBackup(
      APP_STATE_FILE,
      APP_STATE_BACKUP_FILE,
      readStateFileAt,
      'Private app state',
    );
    if (recovered) return recovered;
    throw error;
  }
}

async function writeStateFile(nextState) {
  if (getStore()) return getStore().write(nextState.data, nextState.version - 1);
  await ensureParentDirectory(APP_STATE_FILE);
  const tempFile = `${APP_STATE_FILE}.tmp`;
  try {
    await fs.copyFile(APP_STATE_FILE, APP_STATE_BACKUP_FILE);
    await fs.chmod(APP_STATE_BACKUP_FILE, 0o600);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(tempFile, `${JSON.stringify(nextState, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(tempFile, APP_STATE_FILE);
  await fs.chmod(APP_STATE_FILE, 0o600);
}

async function readVendorObservationsFileAt(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    schemaVersion: 1,
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    observations:
      parsed?.observations && typeof parsed.observations === 'object' ? parsed.observations : {},
  };
}

async function readVendorObservationsFile() {
  if (getStore())
    return (await getStore().getDocument('vendor-observations')) || getEmptyObservations();
  try {
    return await readVendorObservationsFileAt(VENDOR_OBSERVATIONS_FILE);
  } catch (error) {
    if (error.code === 'ENOENT') return getEmptyObservations();
    const recovered = await restoreReadableBackup(
      VENDOR_OBSERVATIONS_FILE,
      VENDOR_OBSERVATIONS_BACKUP_FILE,
      readVendorObservationsFileAt,
      'Private vendor observations',
    );
    if (recovered) return recovered;
    throw error;
  }
}

async function writeVendorObservationsFile(nextState) {
  if (getStore()) return getStore().putDocument('vendor-observations', nextState);
  await ensureParentDirectory(VENDOR_OBSERVATIONS_FILE);
  const tempFile = `${VENDOR_OBSERVATIONS_FILE}.tmp`;
  try {
    await fs.copyFile(VENDOR_OBSERVATIONS_FILE, VENDOR_OBSERVATIONS_BACKUP_FILE);
    await fs.chmod(VENDOR_OBSERVATIONS_BACKUP_FILE, 0o600);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(tempFile, `${JSON.stringify(nextState, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.rename(tempFile, VENDOR_OBSERVATIONS_FILE);
  await fs.chmod(VENDOR_OBSERVATIONS_FILE, 0o600);
}

function withSerializedWrite(work) {
  const run = writeQueue.then(work, work);
  writeQueue = run.catch(() => {});
  return run;
}

function validateIncomingState(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const error = new Error('Request body must include a data object');
    error.status = 400;
    throw error;
  }

  const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (size > MAX_PAYLOAD_BYTES) {
    const error = new Error(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
    error.status = 413;
    throw error;
  }
  validateState(data);
}

function validateIncomingObservations(observations) {
  if (!Array.isArray(observations)) {
    const error = new Error('Request body must include an observations array');
    error.status = 400;
    throw error;
  }
}

function normalizeCandidate(candidate) {
  return {
    canonicalName: String(candidate?.canonicalName || '').trim(),
    category: String(candidate?.category || '').trim(),
    subcategory: String(candidate?.subcategory || '').trim(),
    alias: String(candidate?.alias || '').trim(),
    score: Number.isFinite(candidate?.score) ? candidate.score : 1,
    sourceEvidence: Array.isArray(candidate?.sourceEvidence)
      ? [
          ...new Set(
            candidate.sourceEvidence.map((value) => String(value || '').trim()).filter(Boolean),
          ),
        ]
      : [],
  };
}

function mergeSuggestedCandidates(existing = [], incoming = []) {
  const merged = new Map();
  for (const candidate of [...existing, ...incoming].map(normalizeCandidate)) {
    if (!candidate.canonicalName || !candidate.alias) continue;
    const key = `${candidate.canonicalName}:${candidate.alias}`;
    const current = merged.get(key);
    if (!current || candidate.score < current.score) {
      merged.set(key, candidate);
    }
  }
  return [...merged.values()].sort((a, b) => a.score - b.score).slice(0, 5);
}

function mergeObservation(existing, incoming) {
  const rawSamples = [
    ...new Set(
      [...(existing?.rawSamples || []), String(incoming.rawDescription || '').trim()].filter(
        Boolean,
      ),
    ),
  ].slice(0, 6);
  return {
    normalizedDescription: incoming.normalizedDescription,
    rawSamples,
    count: Number(existing?.count || 0) + Number(incoming.count || 0),
    totalAmountAbs: Number(existing?.totalAmountAbs || 0) + Number(incoming.amountAbs || 0),
    firstSeenAt:
      existing?.firstSeenAt && existing.firstSeenAt < incoming.firstSeenAt
        ? existing.firstSeenAt
        : incoming.firstSeenAt,
    lastSeenAt:
      existing?.lastSeenAt && existing.lastSeenAt > incoming.lastSeenAt
        ? existing.lastSeenAt
        : incoming.lastSeenAt,
    status: existing?.status || 'pending',
    suggestedCandidates: mergeSuggestedCandidates(
      existing?.suggestedCandidates,
      incoming.suggestedCandidates,
    ),
    resolution: existing?.resolution || null,
  };
}

function toObservationList(state) {
  return Object.values(state.observations || {}).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.totalAmountAbs || 0) - (a.totalAmountAbs || 0);
  });
}

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/data', async (_req, res) => {
  try {
    const state = await readStateFile();
    res.json(state);
  } catch (error) {
    console.error('GET /api/data failed:', error.message);
    res.status(500).json({ error: 'Unable to load saved app state' });
  }
});

app.get('/api/vendor-observations', async (_req, res) => {
  try {
    const state = await readVendorObservationsFile();
    res.json({
      enabled: true,
      updatedAt: state.updatedAt,
      observations: toObservationList(state),
    });
  } catch (error) {
    console.error('GET /api/vendor-observations failed:', error.message);
    res.status(500).json({ error: 'Unable to load vendor observations' });
  }
});

app.get('/api/quotes', async (req, res) => {
  try {
    const symbols = String(req.query.symbols || '').split(',');
    res.json(await fetchYahooQuotes(symbols));
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    if (status >= 500) {
      console.error('GET /api/quotes failed:', error.message);
    }
    res.status(status).json({
      error: status >= 500 ? 'Unable to retrieve market quotes' : error.message,
    });
  }
});

app.get('/api/instruments/search', async (req, res) => {
  try {
    const instruments = await searchYahooInstruments(req.query.q);
    res.json({ instruments, source: 'yahoo-unofficial' });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    if (status >= 500) console.error('GET /api/instruments/search failed:', error.message);
    res.status(status).json({
      error: status >= 500 ? 'Unable to search market instruments' : error.message,
    });
  }
});

app.post('/api/data', async (req, res) => {
  if (encryptedMode)
    return res
      .status(405)
      .json({ error: 'Encrypted workspaces require validated change commands' });
  try {
    validateIncomingState(req.body?.data);
    const requestedVersion =
      Number.isInteger(req.body?.version) && req.body.version >= 0 ? req.body.version : 0;

    const savedState = await withSerializedWrite(async () => {
      const current = await readStateFile();

      if (requestedVersion !== current.version) {
        const error = new Error('Version conflict');
        error.status = 409;
        error.body = current;
        throw error;
      }

      const nextState = {
        data: req.body.data,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await writeStateFile(nextState);
      return nextState;
    });

    res.json(savedState);
  } catch (error) {
    if (error.status === 409 && error.body) {
      return res.status(409).json({
        error: 'Version conflict',
        ...error.body,
      });
    }

    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) {
      console.error('POST /api/data failed:', error.message);
    }
    return res.status(status).json({
      error: status >= 500 ? 'Unable to save app state' : error.message,
    });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    if (getStore()) {
      const receipt = await withSerializedWrite(async () =>
        createEncryptedBackup({
          backupDir: getBackupDir(),
          key: getKey(),
          data: req.body?.data,
          reason: req.body?.reason,
          importBatchId: req.body?.importBatchId,
          observations: await readVendorObservationsFile(),
        }),
      );
      return res.json(receipt);
    }
    const backup = await withSerializedWrite(() =>
      writePortableBackup({
        backupDir: getBackupDir(),
        data: req.body?.data,
        reason: req.body?.reason,
        importBatchId: req.body?.importBatchId,
        maxPayloadBytes: MAX_PAYLOAD_BYTES,
      }),
    );
    res.json(backup);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('POST /api/backups failed:', error.message);
    res.status(status).json({
      error: status >= 500 ? 'Unable to create private backup' : error.message,
    });
  }
});

app.post('/api/changes', async (req, res) => {
  if (!getStore()) return res.status(404).json({ error: 'Encrypted storage is not active' });
  try {
    const saved = await withSerializedWrite(async () => {
      const current = await getStore().read();
      const next = applyWorkspaceChanges(current, req.body);
      return getStore().write(next, current.version);
    });
    res.json(saved);
  } catch (error) {
    if (error.status === 409)
      return res
        .status(409)
        .json({ error: 'Version conflict', ...(error.body || (await getStore().read())) });
    res.status(error.status === 400 ? 400 : 500).json({
      error:
        error.status === 400 ? 'Invalid workspace changes' : 'Unable to commit encrypted workspace',
    });
  }
});

app.get('/api/encrypted-backups', async (_req, res) => {
  if (!getStore()) return res.status(404).json({ error: 'Encrypted storage is not active' });
  try {
    const names = await fs.readdir(getBackupDir());
    res.json({
      filenames: names
        .filter((name) => /^(manual|import|recovery)-[A-Za-z0-9_-]+\.ssbdb$/.test(name))
        .sort()
        .reverse(),
    });
  } catch {
    res.status(500).json({ error: 'Unable to list encrypted backups' });
  }
});

app.get('/api/encrypted-backups/:filename', async (req, res) => {
  if (!getStore()) return res.status(404).json({ error: 'Encrypted storage is not active' });
  if (!/^(manual|import|recovery)-[A-Za-z0-9_-]+\.ssbdb$/.test(req.params.filename))
    return res.status(400).json({ error: 'Invalid backup filename' });
  let backup;
  try {
    backup = await openEncryptedStore({
      filename: path.join(getBackupDir(), req.params.filename),
      key: getKey(),
    });
    await backup.integrity();
    res.json({ data: validateState((await backup.read()).data) });
  } catch {
    res.status(400).json({ error: 'Backup could not be authenticated or validated' });
  } finally {
    if (backup) await backup.close();
  }
});

app.post('/api/vendor-observations/collect', async (req, res) => {
  try {
    validateIncomingObservations(req.body?.observations);

    const saved = await withSerializedWrite(async () => {
      const current = await readVendorObservationsFile();
      const observations = { ...(current.observations || {}) };

      for (const incoming of req.body.observations) {
        const normalizedDescription = String(incoming?.normalizedDescription || '').trim();
        if (!normalizedDescription) continue;
        observations[normalizedDescription] = mergeObservation(
          observations[normalizedDescription],
          incoming,
        );
      }

      const nextState = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        observations,
      };
      await writeVendorObservationsFile(nextState);
      return nextState;
    });

    res.json({
      enabled: true,
      stored: req.body.observations.length,
      updatedAt: saved.updatedAt,
      observations: toObservationList(saved),
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) {
      console.error('POST /api/vendor-observations/collect failed:', error.message);
    }
    res.status(status).json({
      error: status >= 500 ? 'Unable to save vendor observations' : error.message,
    });
  }
});

app.post('/api/vendor-observations/resolve', async (req, res) => {
  try {
    const normalizedDescription = String(req.body?.normalizedDescription || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!normalizedDescription || !status) {
      const error = new Error('Request body must include normalizedDescription and status');
      error.status = 400;
      throw error;
    }

    const saved = await withSerializedWrite(async () => {
      const current = await readVendorObservationsFile();
      const existing = current.observations?.[normalizedDescription];
      if (!existing) {
        const error = new Error('Vendor observation not found');
        error.status = 404;
        throw error;
      }

      const nextState = {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        observations: {
          ...current.observations,
          [normalizedDescription]: {
            ...existing,
            status,
            resolution:
              req.body?.resolution && typeof req.body.resolution === 'object'
                ? req.body.resolution
                : existing.resolution || null,
          },
        },
      };

      await writeVendorObservationsFile(nextState);
      return nextState;
    });

    res.json({
      enabled: true,
      updatedAt: saved.updatedAt,
      observations: toObservationList(saved),
    });
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) {
      console.error('POST /api/vendor-observations/resolve failed:', error.message);
    }
    res.status(status).json({
      error: status >= 500 ? 'Unable to update vendor observation' : error.message,
    });
  }
});

// Optional: serve the built UI from the same origin as the API, so relative
// /api paths and the Host/Origin boundary work unchanged. Unset in Docker/dev.
const STATIC_DIR = process.env.SSB_STATIC_DIR ? path.resolve(process.env.SSB_STATIC_DIR) : '';
if (STATIC_DIR) {
  app.use(
    express.static(STATIC_DIR, {
      index: 'index.html',
      fallthrough: true,
      setHeaders(res, filePath) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Hashed assets are immutable; the entry document must always revalidate.
        res.setHeader(
          'Cache-Control',
          filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        );
      },
    }),
  );
  app.use((req, res, next) => {
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      req.path === '/api' ||
      req.path.startsWith('/api/')
    )
      return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

// Express/body-parser failures must not emit stack traces or request bodies.
app.use((error, _req, res, _next) => {
  void _next; // Four arguments are required for Express error middleware.
  const tooLarge = error.type === 'entity.too.large';
  res
    .status(tooLarge ? 413 : 400)
    .json({ error: tooLarge ? 'Request payload too large' : 'Invalid request body' });
});

export async function closePrivateStorage() {
  if (users) await users.close();
  if (encryptedStore) await encryptedStore.close();
  databaseKey?.fill(0);
}
export { app };

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  if (usersMode && HOST !== '127.0.0.1' && HOST !== 'localhost')
    throw new Error('Local users require a loopback-only host');
  if (!hasValidConfiguredSyncToken()) {
    console.error(
      'SSB_SYNC_TOKEN must be a unique secret of at least 32 characters for private sync.',
    );
    process.exitCode = 1;
  } else {
    const server = app.listen(PORT, HOST, () => {
      console.log(`SSB API listening on ${HOST}:${PORT}`);
    });
    installGracefulShutdown(server);
  }
}

// Contract: SIGTERM/SIGINT (and stdin EOF when SSB_EXIT_ON_STDIN_CLOSE=true) stop
// accepting connections, let in-flight requests finish, close every encrypted
// store and zero keys, then exit 0. Process supervisors rely on this.
function installGracefulShutdown(server) {
  let shuttingDown = false;
  const shutdown = async (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`SSB API stopping (${reason})`);
    const forceTimer = setTimeout(() => server.closeAllConnections(), 5_000);
    forceTimer.unref();
    try {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
      });
      await withSerializedWrite(() => closePrivateStorage());
      process.exit(0);
    } catch (error) {
      console.error('SSB API shutdown failed:', error.message);
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  if (process.env.SSB_EXIT_ON_STDIN_CLOSE === 'true') {
    process.stdin.on('end', () => void shutdown('stdin closed'));
    process.stdin.on('error', () => void shutdown('stdin error'));
    process.stdin.resume();
  }
}
