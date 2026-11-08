import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const assetsDir = path.resolve('dist/assets');
const DEFAULT_LIMIT_BYTES = 300 * 1024;
const LAZY_EXPORT_LIMIT_BYTES = 1000 * 1024;
const failures = [];

for (const fileName of await readdir(assetsDir)) {
  if (!fileName.endsWith('.js')) continue;
  const bytes = (await stat(path.join(assetsDir, fileName))).size;
  const limit = fileName.startsWith('exceljs.') ? LAZY_EXPORT_LIMIT_BYTES : DEFAULT_LIMIT_BYTES;
  if (bytes > limit) failures.push(`${fileName}: ${(bytes / 1024).toFixed(1)} KiB exceeds ${(limit / 1024).toFixed(0)} KiB`);
}

if (failures.length) {
  console.error(`Bundle budget failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Bundle budget passed.');
}
