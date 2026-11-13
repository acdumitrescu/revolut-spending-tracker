import sqlite from '@journeyapps/sqlcipher';
import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateState } from './validateState.js';

const SCHEMA = `
CREATE TABLE metadata (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version>=0), updated_at TEXT, envelope TEXT NOT NULL) STRICT;
CREATE TABLE accounts (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL UNIQUE, currency TEXT NOT NULL CHECK(currency IN ('RON','EUR','USD')), payload TEXT NOT NULL) STRICT;
CREATE TABLE balances (account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT, month TEXT NOT NULL, amount_minor INTEGER NOT NULL, PRIMARY KEY(account_id,month)) STRICT;
CREATE TABLE credit_records (id TEXT PRIMARY KEY NOT NULL, position INTEGER NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('card','vendor','planned')), account_id TEXT UNIQUE REFERENCES accounts(id) ON DELETE RESTRICT, payload TEXT NOT NULL, CHECK((kind='card' AND account_id IS NOT NULL) OR (kind!='card' AND account_id IS NULL))) STRICT;
CREATE TABLE purchases (id TEXT NOT NULL, credit_id TEXT NOT NULL REFERENCES credit_records(id) ON DELETE RESTRICT, position INTEGER NOT NULL, total_minor INTEGER NOT NULL CHECK(total_minor>0), remaining_minor INTEGER NOT NULL CHECK(remaining_minor BETWEEN 0 AND total_minor), total_months INTEGER NOT NULL CHECK(total_months BETWEEN 1 AND 600), remaining_months INTEGER NOT NULL CHECK(remaining_months BETWEEN 0 AND total_months), status TEXT NOT NULL CHECK(status IN ('active','archived')), archived_at INTEGER, payload TEXT NOT NULL, PRIMARY KEY(credit_id,id), UNIQUE(credit_id,position), CHECK((status='active' AND archived_at IS NULL) OR (status='archived' AND archived_at IS NOT NULL AND archived_at>=0 AND remaining_minor=0 AND remaining_months=0))) STRICT;
CREATE TABLE transactions (position INTEGER PRIMARY KEY, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, payload TEXT NOT NULL) STRICT;
CREATE TABLE collections (kind TEXT NOT NULL CHECK(kind IN ('portfolioHoldings','goals','history')), position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(kind,position)) STRICT;
CREATE TABLE budgets (month TEXT NOT NULL, category TEXT NOT NULL, amount_minor INTEGER NOT NULL, PRIMARY KEY(month,category)) STRICT;
CREATE TABLE vendor_mappings (name TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL) STRICT;
CREATE TABLE documents (name TEXT PRIMARY KEY NOT NULL CHECK(name IN ('vendor-observations','backup-receipt','mutation-receipt')), payload TEXT NOT NULL) STRICT;
PRAGMA user_version=1;
`;

export function toMinorUnits(value) {
  const minor = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(minor) ||
    Math.abs(value * 100 - minor) > 0.000001
  ) {
    throw new Error(
      'Migration requires an explicit decision for out-of-range or fractional-cent amounts',
    );
  }
  return minor;
}

// No key file, env var, SQL console, trace logger or plaintext fallback.
export async function openEncryptedStore({ filename, key, create = false }) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error('A 32-byte database key is required');
  const directory = path.dirname(path.resolve(filename));
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const parent = await fs.lstat(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || parent.mode & 0o077)
    throw new Error('Database directory must be private (0700)');
  if (create) {
    const handle = await fs.open(filename, 'wx', 0o600);
    await handle.close();
  }
  const info = await fs.lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077)
    throw new Error('Database must be a private regular file (0600)');
  if (!create && info.size === 0)
    throw new Error('Refusing to initialize an empty existing database');
  let db;
  await new Promise((resolve, reject) => {
    db = new sqlite.Database(filename, sqlite.OPEN_READWRITE, (error) =>
      error ? reject(new Error('Unable to open encrypted database')) : resolve(),
    );
  });
  const run = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.run(sql, params, function (error) {
        if (error) reject(new Error('Encrypted database operation rejected'));
        else resolve({ changes: this.changes });
      }),
    );
  const all = (sql, params = []) =>
    new Promise((resolve, reject) =>
      db.all(sql, params, (error, rows) =>
        error ? reject(new Error('Encrypted database query rejected')) : resolve(rows),
      ),
    );
  const exec = (sql) =>
    new Promise((resolve, reject) =>
      db.exec(sql, (error) =>
        error ? reject(new Error('Encrypted database initialization rejected')) : resolve(),
      ),
    );
  const close = () =>
    new Promise((resolve, reject) =>
      db.close((error) => (error ? reject(new Error('Unable to close database')) : resolve())),
    );
  try {
    // SQLCipher PRAGMA does not support bound key parameters. Only validated
    // random bytes converted to hex reach this fixed, never logged statement.
    await run(`PRAGMA key = "x'${key.toString('hex')}'"`);
    const cipher = await all('PRAGMA cipher_version');
    if (!cipher[0]?.cipher_version) throw new Error('SQLCipher encryption is unavailable');
    await all('SELECT count(*) FROM sqlite_master'); // authenticates existing pages
    await exec(
      'PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA temp_store=MEMORY; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;',
    );
    // DELETE journal avoids a persistent plaintext SHM index in this initial
    // staging implementation. Production WAL tuning is a separate verified gate.
    await all('PRAGMA journal_mode=DELETE');
    if (create) await exec(`BEGIN IMMEDIATE; ${SCHEMA} COMMIT;`);
    const version = (await all('PRAGMA user_version'))[0].user_version;
    if (version !== 1) throw new Error('Unsupported encrypted database schema');
  } catch {
    await close();
    throw new Error(
      'Encrypted database could not be authenticated or initialized; no fallback was used',
    );
  }

  let queue = Promise.resolve();
  const exclusive = (operation) => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const read = async () => {
    const meta = (await all('SELECT * FROM metadata WHERE id=1'))[0];
    if (!meta) return { data: null, version: 0, updatedAt: null };
    const envelope = JSON.parse(meta.envelope);
    const data = envelope.data;
    data.accounts = (await all('SELECT payload FROM accounts ORDER BY position')).map((row) =>
      JSON.parse(row.payload),
    );
    data.transactions = (await all('SELECT payload FROM transactions ORDER BY position')).map(
      (row) => JSON.parse(row.payload),
    );
    data.creditRecords = (await all('SELECT payload FROM credit_records ORDER BY position')).map(
      (row) => JSON.parse(row.payload),
    );
    for (const credit of data.creditRecords.filter((row) => row.kind === 'card')) {
      credit.purchases = (
        await all('SELECT payload FROM purchases WHERE credit_id=? ORDER BY position', [credit.id])
      ).map((row) => JSON.parse(row.payload));
    }
    for (const kind of ['portfolioHoldings', 'goals', 'history']) {
      const values = (
        await all('SELECT payload FROM collections WHERE kind=? ORDER BY position', [kind])
      ).map((row) => JSON.parse(row.payload));
      if (kind === 'history') data.importMeta.history = values;
      else data[kind] = values;
    }
    data.customVendors = Object.fromEntries(
      (await all('SELECT name,payload FROM vendor_mappings')).map((row) => [
        row.name,
        JSON.parse(row.payload),
      ]),
    );
    // Preserve empty month keys using the envelope; populate exact values here.
    for (const row of await all('SELECT * FROM budgets'))
      data.budgets[row.month][row.category] = row.amount_minor / 100;
    return { data: envelope, version: meta.version, updatedAt: meta.updated_at };
  };
  return {
    getDocument: (name) =>
      exclusive(async () => {
        const row = (await all('SELECT payload FROM documents WHERE name=?', [name]))[0];
        return row ? JSON.parse(row.payload) : null;
      }),
    putDocument: (name, value) =>
      exclusive(() =>
        run('INSERT OR REPLACE INTO documents VALUES(?,?)', [name, JSON.stringify(value)]),
      ),
    read: () => exclusive(read),
    write: (input, expectedVersion) =>
      exclusive(async () => {
        const envelope = validateState(input);
        const data = envelope.data;
        if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
          throw new Error('Invalid expected revision');
        await run('BEGIN IMMEDIATE');
        try {
          const current = (await all('SELECT version FROM metadata WHERE id=1'))[0]?.version || 0;
          if (current !== expectedVersion)
            throw Object.assign(new Error('Version conflict'), { status: 409 });
          // Fixed SQL only. This compatibility import replaces rows atomically;
          // typed incremental mutations must be added before production cutover.
          await exec(
            'DELETE FROM purchases; DELETE FROM credit_records; DELETE FROM balances; DELETE FROM accounts; DELETE FROM transactions; DELETE FROM collections; DELETE FROM budgets; DELETE FROM vendor_mappings;',
          );
          for (const [i, account] of data.accounts.entries()) {
            await run('INSERT INTO accounts VALUES(?,?,?,?)', [
              account.id,
              i,
              account.currency,
              JSON.stringify(account),
            ]);
            for (const [month, amount] of Object.entries(account.balances))
              await run('INSERT INTO balances VALUES(?,?,?)', [
                account.id,
                month,
                toMinorUnits(amount),
              ]);
          }
          for (const [i, credit] of data.creditRecords.entries()) {
            const { purchases, ...record } = credit;
            await run('INSERT INTO credit_records VALUES(?,?,?,?,?)', [
              credit.id,
              i,
              credit.kind,
              credit.kind === 'card' ? credit.accountId : null,
              JSON.stringify(record),
            ]);
            for (const [j, item] of (purchases || []).entries()) {
              toMinorUnits(item.initialCost);
              toMinorUnits(item.instalmentAmount);
              await run('INSERT INTO purchases VALUES(?,?,?,?,?,?,?,?,?,?)', [
                item.id,
                credit.id,
                j,
                toMinorUnits(item.totalCost),
                toMinorUnits(item.remainingBalance),
                item.totalMonths,
                item.remainingMonths,
                item.status,
                item.archivedAt,
                JSON.stringify(item),
              ]);
            }
            for (const field of ['remainingBalance', 'monthlyPayment', 'amountFinanced'])
              if (credit[field] != null) toMinorUnits(credit[field]);
          }
          for (const [i, tx] of data.transactions.entries())
            await run('INSERT INTO transactions VALUES(?,?,?,?)', [
              i,
              toMinorUnits(tx.amt),
              tx.currency || data.baseCurrency,
              JSON.stringify(tx),
            ]);
          for (const kind of ['portfolioHoldings', 'goals', 'history']) {
            const values = kind === 'history' ? data.importMeta.history : data[kind];
            for (const [i, value] of values.entries()) {
              if (kind === 'goals') toMinorUnits(value.targetAmount);
              await run('INSERT INTO collections VALUES(?,?,?)', [kind, i, JSON.stringify(value)]);
            }
          }
          for (const [month, categories] of Object.entries(data.budgets))
            for (const [category, value] of Object.entries(categories))
              await run('INSERT INTO budgets VALUES(?,?,?)', [
                month,
                category,
                toMinorUnits(value),
              ]);
          for (const [name, value] of Object.entries(data.customVendors))
            await run('INSERT INTO vendor_mappings VALUES(?,?)', [name, JSON.stringify(value)]);
          const metadata = structuredClone(envelope);
          for (const collection of [
            'accounts',
            'transactions',
            'creditRecords',
            'portfolioHoldings',
            'goals',
            'customVendors',
          ])
            delete metadata.data[collection];
          metadata.data.importMeta.history = [];
          metadata.data.budgets = Object.fromEntries(
            Object.keys(data.budgets).map((month) => [month, {}]),
          );
          const updatedAt = new Date().toISOString();
          await run('INSERT OR REPLACE INTO metadata VALUES(1,?,?,?)', [
            current + 1,
            updatedAt,
            JSON.stringify(metadata),
          ]);
          await run('COMMIT');
          return { data: envelope, version: current + 1, updatedAt };
        } catch (error) {
          await run('ROLLBACK');
          throw error;
        }
      }),
    integrity: () =>
      exclusive(async () => {
        const integrity = await all('PRAGMA integrity_check');
        const foreignKeys = await all('PRAGMA foreign_key_check');
        if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || foreignKeys.length)
          throw new Error('Database integrity check failed');
        return true;
      }),
    close: () => exclusive(close),
  };
}
