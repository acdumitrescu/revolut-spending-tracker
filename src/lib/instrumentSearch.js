import bvbCatalog from './bvbInstruments.json';
import { globalEtfs, globalInstruments } from './globalInstruments';

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const localInstruments = [
  ...bvbCatalog.instruments,
  ...globalInstruments,
  ...globalEtfs,
];

export function searchLocalInstruments(query, limit = 8) {
  const normalizedQuery = normalizeSearch(query);
  if (normalizedQuery.length < 2) return [];

  return localInstruments
    .map((instrument) => {
      const ticker = normalizeSearch(instrument.ticker);
      const name = normalizeSearch(instrument.name);
      const score = ticker === normalizedQuery ? 0
        : ticker.startsWith(normalizedQuery) ? 1
          : name.startsWith(normalizedQuery) ? 2
            : name.includes(normalizedQuery) ? 3
              : Number.POSITIVE_INFINITY;
      return { instrument, score };
    })
    .filter((result) => Number.isFinite(result.score))
    .sort((left, right) => left.score - right.score || left.instrument.name.localeCompare(right.instrument.name))
    .slice(0, limit)
    .map((result) => result.instrument);
}

export function getLocalInstrumentCatalogSummary() {
  return {
    bvb: bvbCatalog.instruments.length,
    globalStocks: globalInstruments.length,
    globalEtfs: globalEtfs.length,
    total: localInstruments.length,
    generatedAt: bvbCatalog.generatedAt,
  };
}
