/* global Buffer, process */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateState } from './validateState.js';

const BACKUP_REASONS = new Set(['import', 'manual']);

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validatePortableState(data, maxPayloadBytes) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError('Request body must include a data object');
  }
  if (
    data.schemaVersion !== 1 ||
    !data.data ||
    typeof data.data !== 'object' ||
    Array.isArray(data.data)
  ) {
    throw httpError('Backup data must be a versioned SimpleSafeBanking app state');
  }
  if (!Array.isArray(data.data.transactions) || !Array.isArray(data.data.accounts)) {
    throw httpError('Backup data is missing required app collections');
  }
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > maxPayloadBytes) {
    throw httpError(`Payload exceeds ${maxPayloadBytes} bytes`, 413);
  }
  validateState(data);
}

function safeBatchId(value) {
  const batchId = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(batchId)) {
    throw httpError('Import backups require a valid importBatchId');
  }
  return batchId;
}

function timestampForFilename(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function readExistingImportBackup(filePath, metadata) {
  try {
    await fs.access(filePath);
    const stats = await fs.stat(filePath);
    return { ...metadata, createdAt: stats.birthtime.toISOString() };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

export async function writePortableBackup({
  backupDir,
  data,
  reason,
  importBatchId,
  maxPayloadBytes,
  now = new Date(),
}) {
  const configuredDir = String(backupDir || '').trim();
  if (!configuredDir) throw httpError('Automatic server backups are not configured', 503);
  if (!BACKUP_REASONS.has(reason)) throw httpError('Backup reason must be import or manual');
  validatePortableState(data, maxPayloadBytes);

  const batchId = reason === 'import' ? safeBatchId(importBatchId) : null;
  const filename =
    reason === 'import'
      ? `simple_safe_banking_backup_import_${batchId}.json`
      : `simple_safe_banking_backup_manual_${timestampForFilename(now)}_${randomUUID().slice(0, 8)}.json`;
  const targetPath = path.join(configuredDir, filename);
  const metadata = { filename, createdAt: now.toISOString(), reason, importBatchId: batchId };

  await fs.mkdir(configuredDir, { recursive: true, mode: 0o700 });
  await fs.chmod(configuredDir, 0o700);

  if (reason === 'import') {
    const existing = await readExistingImportBackup(targetPath, metadata);
    if (existing) return existing;
  }

  const payload = { ...data, exportedAt: now.getTime() };
  const tempPath = path.join(configuredDir, `.${filename}.${process.pid}.tmp`);
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await fs.rename(tempPath, targetPath);
    await fs.chmod(targetPath, 0o600);
  } catch (error) {
    try {
      await fs.unlink(tempPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }

  return metadata;
}
