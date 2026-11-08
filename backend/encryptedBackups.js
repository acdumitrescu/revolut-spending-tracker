import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { openEncryptedStore } from './encryptedStore.js';
import { validateState } from './validateState.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
export const stateDigest = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export async function createEncryptedBackup({ backupDir, key, data, reason, importBatchId, observations = null }) {
  if (!backupDir || !['manual','import','recovery'].includes(reason)) throw Object.assign(new Error('Invalid encrypted backup request'), { status: 400 });
  if (reason === 'import' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(importBatchId || '')) throw Object.assign(new Error('Invalid import batch ID'), { status: 400 });
  const envelope = validateState(data);
  const digest = stateDigest(envelope);
  const filename = reason === 'import' ? `import-${importBatchId}.ssbdb` : `${reason}-${Date.now()}-${randomUUID()}.ssbdb`;
  await fs.mkdir(backupDir, { recursive:true,mode:0o700 });
  const destination = path.join(backupDir, filename);
  try {
    await fs.lstat(destination);
    const existing = await openEncryptedStore({ filename:destination,key });
    try {
      const receipt = await existing.getDocument('backup-receipt');
      if (!receipt || receipt.digest !== digest) throw Object.assign(new Error('Backup batch already exists with different content'), {status:409});
      if (!isDeepStrictEqual((await existing.read()).data, envelope)) throw new Error('Existing backup verification failed');
      return receipt;
    } finally { await existing.close(); }
  } catch(error) { if(error.code !== 'ENOENT') throw error; }
  const temporary = path.join(backupDir, `.${randomUUID()}.pending.ssbdb`);
  const receipt = { filename,createdAt:new Date().toISOString(),reason,importBatchId:importBatchId || null,digest,encrypted:true };
  const backup = await openEncryptedStore({filename:temporary,key,create:true});
  try {
    await backup.write(envelope,0);
    await backup.putDocument('backup-receipt',receipt);
    if (observations) await backup.putDocument('vendor-observations',observations);
    await backup.integrity();
    if (!isDeepStrictEqual((await backup.read()).data,envelope)) throw new Error('Encrypted backup verification failed');
  } finally { await backup.close(); }
  const file = await fs.open(temporary,'r'); try { await file.sync(); } finally { await file.close(); }
  // Atomic no-clobber publication; partial candidates are never a valid receipt.
  await fs.link(temporary,destination);
  await fs.unlink(temporary);
  const directory = await fs.open(backupDir,'r'); try { await directory.sync(); } finally { await directory.close(); }
  return receipt;
}
