/* global Buffer, process */
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveAppStateFile, resolveVendorObservationsFile } from './storagePath.js';

const PORT = Number.parseInt(process.env.PORT || '3177', 10);
const HOST = process.env.HOST || '0.0.0.0';
const APP_STATE_FILE = resolveAppStateFile(process.env.APP_STATE_FILE);
const VENDOR_OBSERVATIONS_FILE = resolveVendorObservationsFile(process.env.VENDOR_OBSERVATIONS_FILE);
const MAX_PAYLOAD_BYTES = Number.parseInt(process.env.APP_STATE_MAX_BYTES || String(5 * 1024 * 1024), 10);
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: `${Math.ceil(MAX_PAYLOAD_BYTES / (1024 * 1024))}mb` }));

let writeQueue = Promise.resolve();

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
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readStateFile() {
  try {
    const raw = await fs.readFile(APP_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      data: parsed?.data && typeof parsed.data === 'object' ? parsed.data : null,
      version: Number.isInteger(parsed?.version) && parsed.version >= 0 ? parsed.version : 0,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return getEmptyState();
    }
    throw error;
  }
}

async function writeStateFile(nextState) {
  await ensureParentDirectory(APP_STATE_FILE);
  const tempFile = `${APP_STATE_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, APP_STATE_FILE);
}

async function readVendorObservationsFile() {
  try {
    const raw = await fs.readFile(VENDOR_OBSERVATIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      observations: parsed?.observations && typeof parsed.observations === 'object' ? parsed.observations : {},
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return getEmptyObservations();
    }
    throw error;
  }
}

async function writeVendorObservationsFile(nextState) {
  await ensureParentDirectory(VENDOR_OBSERVATIONS_FILE);
  const tempFile = `${VENDOR_OBSERVATIONS_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, VENDOR_OBSERVATIONS_FILE);
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
      ? [...new Set(candidate.sourceEvidence.map((value) => String(value || '').trim()).filter(Boolean))]
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
  return [...merged.values()]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
}

function mergeObservation(existing, incoming) {
  const rawSamples = [...new Set([...(existing?.rawSamples || []), String(incoming.rawDescription || '').trim()].filter(Boolean))].slice(0, 6);
  return {
    normalizedDescription: incoming.normalizedDescription,
    rawSamples,
    count: Number(existing?.count || 0) + Number(incoming.count || 0),
    totalAmountAbs: Number(existing?.totalAmountAbs || 0) + Number(incoming.amountAbs || 0),
    firstSeenAt: existing?.firstSeenAt && existing.firstSeenAt < incoming.firstSeenAt ? existing.firstSeenAt : incoming.firstSeenAt,
    lastSeenAt: existing?.lastSeenAt && existing.lastSeenAt > incoming.lastSeenAt ? existing.lastSeenAt : incoming.lastSeenAt,
    status: existing?.status || 'pending',
    suggestedCandidates: mergeSuggestedCandidates(existing?.suggestedCandidates, incoming.suggestedCandidates),
    resolution: existing?.resolution || null,
  };
}

function toObservationList(state) {
  return Object.values(state.observations || {}).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.totalAmountAbs || 0) - (a.totalAmountAbs || 0);
  });
}

function isAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.length === 0) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return next();
  }

  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) {
    return res.status(403).json({
      error: 'Origin not allowed for private sync writes',
    });
  }

  return next();
});

app.get('/healthz', async (_req, res) => {
  try {
    const state = await readStateFile();
    res.json({
      ok: true,
      version: state.version,
      updatedAt: state.updatedAt,
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(500).json({ ok: false });
  }
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

app.post('/api/data', async (req, res) => {
  try {
    validateIncomingState(req.body?.data);
    const requestedVersion = Number.isInteger(req.body?.version) && req.body.version >= 0
      ? req.body.version
      : 0;

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

app.post('/api/vendor-observations/collect', async (req, res) => {
  try {
    validateIncomingObservations(req.body?.observations);

    const saved = await withSerializedWrite(async () => {
      const current = await readVendorObservationsFile();
      const observations = { ...(current.observations || {}) };

      for (const incoming of req.body.observations) {
        const normalizedDescription = String(incoming?.normalizedDescription || '').trim();
        if (!normalizedDescription) continue;
        observations[normalizedDescription] = mergeObservation(observations[normalizedDescription], incoming);
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
            resolution: req.body?.resolution && typeof req.body.resolution === 'object'
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

app.listen(PORT, HOST, () => {
  console.log(`SSB API listening on ${HOST}:${PORT}`);
});
