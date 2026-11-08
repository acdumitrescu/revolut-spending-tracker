import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { openEncryptedStore } from './encryptedStore.js';
import { validateState } from './validateState.js';

// Creates a separate candidate only. Never rewrites, deletes or enables the
// live store. Callers must pause live writes before eventual cutover.
export async function stageMigration({ sourceFile, destinationFile, key }) {
  const original = await fs.readFile(sourceFile);
  const source = JSON.parse(original.toString('utf8'));
  const envelope = source.data?.schemaVersion ? source.data : source.schemaVersion ? source : { schemaVersion: 1, data: source.data };
  const expected = validateState(envelope);
  const db = await openEncryptedStore({ filename: destinationFile, key, create: true });
  try {
    await db.write(expected, 0);
    await db.integrity();
    const restored = await db.read();
    if (!isDeepStrictEqual(restored.data, expected)) throw new Error('Migration reconciliation failed');
    const after = await fs.readFile(sourceFile);
    if (!original.equals(after)) throw new Error('Source changed during migration; candidate must not be activated');
    return { status: 'staged-not-active', reconciled: true, sourceVersion: source.version ?? null,
      counts: { transactions: expected.data.transactions.length, accounts: expected.data.accounts.length,
        creditRecords: expected.data.creditRecords.length, purchases: expected.data.creditRecords.reduce((sum, row) => sum + (row.purchases?.length || 0), 0),
        goals: expected.data.goals.length, portfolioHoldings: expected.data.portfolioHoldings.length, importHistory: expected.data.importMeta.history.length } };
  } finally { await db.close(); }
}
