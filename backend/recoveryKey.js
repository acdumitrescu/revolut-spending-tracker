import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import { openEncryptedStore } from './encryptedStore.js';
import { stateDigest } from './encryptedBackups.js';

export function encodeRecoveryKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid recovery key');
  const hex = key.toString('hex');
  const checksum = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return `SSB1-${hex}-${checksum}`;
}

export function decodeRecoveryKey(input) {
  const match = /^SSB1-([a-f0-9]{64})-([a-f0-9]{8})$/.exec(input.trim());
  if (!match) throw new Error('Invalid recovery key format');
  const key = Buffer.from(match[1], 'hex');
  const checksum = createHash('sha256').update(key).digest().subarray(0, 4);
  if (!timingSafeEqual(checksum, Buffer.from(match[2], 'hex'))) {
    key.fill(0);
    throw new Error('Recovery key checksum mismatch');
  }
  return key;
}

// Caller supplies a disposable private copy, never the live database.
export async function verifyRecoveryBackup(filename, key) {
  const db = await openEncryptedStore({ filename, key });
  try {
    if (!(await db.integrity())) throw new Error('Backup integrity failed');
    const state = (await db.read()).data;
    const receipt = await db.getDocument('backup-receipt');
    if (!state || !receipt || receipt.digest !== stateDigest(state)) throw new Error('Backup reconciliation failed');
    return { verified: true, digest: receipt.digest };
  } finally { await db.close(); }
}
