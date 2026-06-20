import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileVendorKnowledgeFromSourcePayloads } from '../src/lib/vendorKnowledgeCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const sourceFiles = [
  'data/vendor-knowledge/sources/nsi-base.snapshot.json',
  'data/vendor-knowledge/sources/ro-expanded.snapshot.json',
  'data/vendor-knowledge/sources/wikidata-ro.snapshot.json',
  'data/vendor-knowledge/overrides/ro-manual.json',
];

const outputFile = path.join(repoRoot, 'src/lib/vendorKnowledge.compiled.json');

async function readSourcePayload(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

async function buildVendorKnowledge() {
  const payloads = await Promise.all(sourceFiles.map(readSourcePayload));
  const compiled = compileVendorKnowledgeFromSourcePayloads(payloads);
  await fs.writeFile(outputFile, `${JSON.stringify(compiled, null, 2)}\n`, 'utf8');
  return compiled;
}

const compiled = await buildVendorKnowledge();
console.log(`Compiled ${compiled.records.length} vendor knowledge records to ${path.relative(repoRoot, outputFile)}`);
