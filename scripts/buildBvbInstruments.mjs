import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const sharesUrl = 'https://www.bvb.ro/financialinstruments/markets/shares';
const outputFile = path.join(repoRoot, 'src/lib/bvbInstruments.json');

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInstruments(html, market) {
  const pattern = /FinancialInstrumentsDetails\.aspx\?s=([^"]+)"><b>([^<]+)<\/b><\/a><p[^>]*>([^<]*)<\/p>\s*<\/td><td>([\s\S]*?)<\/td>/g;
  const seen = new Set();
  const instruments = [];

  for (const match of html.matchAll(pattern)) {
    const ticker = decodeHtml(match[2]).toUpperCase();
    const name = decodeHtml(match[4]);
    if (!ticker || !name || seen.has(ticker)) continue;
    seen.add(ticker);
    instruments.push({
      ticker,
      quoteSymbol: `${ticker}.RO`,
      name,
      exchange: 'BVB',
      market,
      currency: 'RON',
      assetClass: 'Stock',
    });
  }

  return instruments;
}

function getFormFields(html) {
  const form = new URLSearchParams();
  for (const match of html.matchAll(/<input[^>]+type="hidden"[^>]*>/g)) {
    const name = match[0].match(/name="([^"]+)/)?.[1];
    const value = match[0].match(/value="([^"]*)/)?.[1] || '';
    if (name) form.set(name, value);
  }
  return form;
}

async function loadAeroShares(mainHtml) {
  const form = getFormFields(mainHtml);
  const aeroButton = [...mainHtml.matchAll(/<input[^>]+type="submit"[^>]+value="AeRO"[^>]*>/g)][0]?.[0];
  const buttonName = aeroButton?.match(/name="([^"]+)/)?.[1];
  if (!buttonName) throw new Error('BVB AeRO selector was not found');
  form.set(buttonName, 'AeRO');

  const response = await fetch(sharesUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!response.ok) throw new Error(`BVB AeRO request failed: HTTP ${response.status}`);
  return response.text();
}

const mainResponse = await fetch(sharesUrl);
if (!mainResponse.ok) throw new Error(`BVB shares request failed: HTTP ${mainResponse.status}`);
const mainHtml = await mainResponse.text();
const aeroHtml = await loadAeroShares(mainHtml);
const instruments = [
  ...parseInstruments(mainHtml, 'Regulated'),
  ...parseInstruments(aeroHtml, 'AeRO'),
].sort((left, right) => left.ticker.localeCompare(right.ticker));

await fs.writeFile(outputFile, `${JSON.stringify({
  source: 'Bucharest Stock Exchange shares market pages',
  generatedAt: new Date().toISOString(),
  instruments,
}, null, 2)}\n`);

console.log(`Wrote ${instruments.length} BVB share instruments to ${path.relative(repoRoot, outputFile)}`);
