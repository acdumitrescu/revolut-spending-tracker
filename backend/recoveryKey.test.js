// @vitest-environment node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { protectRecoveryKey, unlockRecoveryKey } from './passwordRecovery.js';
import { describe, it, expect } from 'vitest';
import { encodeRecoveryKey, decodeRecoveryKey, verifyRecoveryBackup } from './recoveryKey.js';
import { createEncryptedBackup } from './encryptedBackups.js';
import { PersistedAppStateSchema } from './appStateSchema.js';

describe('password manager recovery', () => {
  it('round trips exact keys and rejects damaged or unversioned text', () => {
    const key = randomBytes(32);
    const text = encodeRecoveryKey(key);
    expect(decodeRecoveryKey(` ${text}\n`)).toEqual(key);
    expect(() => decodeRecoveryKey(text.slice(0, -1) + (text.endsWith('0') ? '1' : '0'))).toThrow('checksum');
    expect(() => decodeRecoveryKey(key.toString('hex'))).toThrow('format');
    expect(() => decodeRecoveryKey(text.replace('SSB1', 'SSB2'))).toThrow('format');
    key.fill(0);
  });
  it('verifies an actual encrypted backup with a recovered key and rejects another key', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-recovery-test-'));
    const key = randomBytes(32);
    try {
      const data = PersistedAppStateSchema.parse({schemaVersion: 1, data: {transactions: [], customVendors: {}, lastUpdated: 1, accounts: [{id: 'demo', name: 'Synthetic', currency: 'RON', balances: {}}]}});
      const receipt = await createEncryptedBackup({backupDir: dir, key, data, reason: 'recovery'});
      const filename = path.join(dir, receipt.filename);
      const before = await fs.readFile(filename);
      const password = Buffer.from('Synthetic recovery integration password');
      const protectedFile = path.join(dir, 'recovery-key.ssbkey');
      await fs.writeFile(protectedFile, JSON.stringify(await protectRecoveryKey(key, password)), {mode: 0o600});
      const recovered = await unlockRecoveryKey(JSON.parse(await fs.readFile(protectedFile, 'utf8')), password);
      expect(await verifyRecoveryBackup(filename, recovered)).toEqual({verified: true, digest: receipt.digest});
      recovered.fill(0);
      await expect(verifyRecoveryBackup(filename, randomBytes(32))).rejects.toThrow('authenticated');
      expect(await fs.readFile(filename)).toEqual(before);
    } finally {
      key.fill(0);
      for (const name of await fs.readdir(dir)) await fs.unlink(path.join(dir, name));
      await fs.rmdir(dir);
    }
  });
});
