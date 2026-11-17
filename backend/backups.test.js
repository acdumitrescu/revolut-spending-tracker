// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writePortableBackup } from './backups.js';

const createdDirectories = [];

function sampleState() {
  return {
    schemaVersion: 1,
    exportedAt: null,
    data: {
      transactions: [],
      accounts: [],
      customVendors: {},
      portfolioHoldings: [],
      budgets: {},
      goals: [],
      lastUpdated: 123,
    },
  };
}

async function createBackupDirectory() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ssb-backup-test-'));
  const backupDir = path.join(root, 'automatic');
  createdDirectories.push({ root, backupDir });
  return backupDir;
}

afterEach(async () => {
  while (createdDirectories.length) {
    const { root, backupDir } = createdDirectories.pop();
    try {
      const files = await fs.readdir(backupDir);
      await Promise.all(files.map((file) => fs.unlink(path.join(backupDir, file))));
      await fs.rmdir(backupDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await fs.rmdir(root);
  }
});

describe('private portable backups', () => {
  it('writes a restorable manual backup with private permissions', async () => {
    const backupDir = await createBackupDirectory();
    const now = new Date('2026-09-26T18:30:00.000Z');
    const result = await writePortableBackup({
      backupDir,
      data: sampleState(),
      reason: 'manual',
      maxPayloadBytes: 1024 * 1024,
      now,
    });

    const filePath = path.join(backupDir, result.filename);
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const directoryMode = (await fs.stat(backupDir)).mode & 0o777;
    const fileMode = (await fs.stat(filePath)).mode & 0o777;

    expect(result).toMatchObject({
      createdAt: now.toISOString(),
      reason: 'manual',
      importBatchId: null,
    });
    expect(parsed).toMatchObject({ schemaVersion: 1, exportedAt: now.getTime() });
    expect(parsed.data.transactions).toEqual([]);
    expect(directoryMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });

  it('is idempotent for the same import batch', async () => {
    const backupDir = await createBackupDirectory();
    const first = await writePortableBackup({
      backupDir,
      data: sampleState(),
      reason: 'import',
      importBatchId: 'batch-123',
      maxPayloadBytes: 1024 * 1024,
      now: new Date('2026-09-26T18:30:00.000Z'),
    });
    const second = await writePortableBackup({
      backupDir,
      data: sampleState(),
      reason: 'import',
      importBatchId: 'batch-123',
      maxPayloadBytes: 1024 * 1024,
      now: new Date('2026-09-26T18:31:00.000Z'),
    });

    expect(second.filename).toBe(first.filename);
    await expect(fs.readdir(backupDir)).resolves.toEqual([first.filename]);
  });

  it('rejects unversioned state and unsafe import batch identifiers', async () => {
    const backupDir = await createBackupDirectory();

    await expect(
      writePortableBackup({
        backupDir,
        data: { data: { transactions: [], accounts: [] } },
        reason: 'manual',
        maxPayloadBytes: 1024 * 1024,
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      writePortableBackup({
        backupDir,
        data: sampleState(),
        reason: 'import',
        importBatchId: '../../private-data',
        maxPayloadBytes: 1024 * 1024,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('backupPath', () => {
  it('keeps backup files inside the backup folder', async () => {
    const { backupPath } = await import('./encryptedBackups.js');
    expect(backupPath('/tmp/ssb-backups', 'manual-1-a.ssbdb')).toBe(
      '/tmp/ssb-backups/manual-1-a.ssbdb',
    );
    for (const name of ['../escape.ssbdb', 'nested/file.ssbdb', '..', '']) {
      expect(() => backupPath('/tmp/ssb-backups', name)).toThrow(/Invalid backup filename/);
    }
  });
});
