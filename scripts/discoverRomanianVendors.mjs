import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compiledKnowledge from '../src/lib/vendorKnowledge.compiled.json' with { type: 'json' };
import { normalizeVendorKey } from '../src/lib/vendorKnowledgeCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(
  repoRoot,
  'private-data',
  'vendor-knowledge',
  'overpass-ro-discovery.json'
);

const OVERPASS_ENDPOINT = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const QUERY = `
[out:json][timeout:90];
(
  nwr["shop"~"supermarket|convenience|mobile_phone|electronics|doityourself|beauty"]["brand"](45.3,20.1,48.4,29.9);
  nwr["amenity"~"pharmacy|fuel"]["brand"](45.3,20.1,48.4,29.9);
  nwr["office"="company"]["brand"](45.3,20.1,48.4,29.9);
);
out tags;
`;

const knownAliases = new Set(
  compiledKnowledge.records.flatMap((record) => record.searchKeys || [])
);

function summarizeElements(elements) {
  const counts = new Map();

  for (const element of elements) {
    const brand = element?.tags?.brand || element?.tags?.operator || element?.tags?.name;
    const normalized = normalizeVendorKey(brand);
    if (!normalized) continue;
    if (knownAliases.has(normalized)) continue;

    const existing = counts.get(normalized) || {
      normalizedBrand: normalized,
      sampleBrand: brand,
      hits: 0,
    };
    existing.hits += 1;
    counts.set(normalized, existing);
  }

  return [...counts.values()]
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 200);
}

async function main() {
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: QUERY,
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with ${response.status}`);
  }

  const payload = await response.json();
  const report = {
    generatedAt: new Date().toISOString(),
    endpoint: OVERPASS_ENDPOINT,
    candidateCount: Array.isArray(payload?.elements) ? payload.elements.length : 0,
    unknownBrands: summarizeElements(payload?.elements || []),
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote Overpass discovery report to ${path.relative(repoRoot, outputFile)}`);
}

await main();
