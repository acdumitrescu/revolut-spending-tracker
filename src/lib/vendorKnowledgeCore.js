import Fuse from 'fuse.js';

const COMPILED_SCHEMA_VERSION = 2;
const SOURCE_PRIORITY = {
  nsi: 100,
  wikidata: 200,
  osm: 300,
  manual: 1000,
};

const APPROVED_FUZZY_TAGS = new Set([
  'grocery',
  'fuel',
  'telecom',
  'pharmacy',
  'courier',
  'delivery',
  'marketplace',
  'home',
  'electronics',
  'travel',
]);

const LOW_CONFIDENCE_TAGS = new Set(['delivery', 'grocery', 'fuel', 'telecom', 'pharmacy', 'courier']);
const RISKY_SHORT_ALIAS_TAGS = new Set(['fuel', 'telecom', 'transport', 'taxi', 'delivery']);
const LEGAL_SUFFIX_PATTERN = /\b(srl|sa|sas|inc|corp|co|company|ltd|llc|gmbh|bv|plc|pte|kg|sro)\b/g;
const PAYMENT_NOISE_PATTERN = /\b(pos|terminal|payment|purchase|card|visa|mastercard|debit|credit|tranzactie|transaction)\b/g;
const CATEGORY_NORMALIZATION = new Map([
  ['Telecom', 'Utilities'],
]);
const FUZZY_SCORE_THRESHOLD = 0.12;
const FUZZY_SCORE_GAP_THRESHOLD = 0.03;
const SUGGESTION_SCORE_THRESHOLD = 0.24;

export function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizeVendorKey(value) {
  return normalizeText(value)
    .replace(LEGAL_SUFFIX_PATTERN, ' ')
    .replace(PAYMENT_NOISE_PATTERN, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueSorted(values) {
  return [...new Set((values || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function mergeScore(record) {
  const sourceScore = SOURCE_PRIORITY[record.sourceType] || 0;
  return (sourceScore * 10000) + (record.priority || 0);
}

function prefersShortBoundary(alias) {
  return alias.length >= 4 || alias.includes(' ');
}

function normalizeCategory(category) {
  const rawCategory = String(category || 'Other').trim() || 'Other';
  return CATEGORY_NORMALIZATION.get(rawCategory) || rawCategory;
}

function compareAliasEntries(a, b) {
  const aliasLengthDiff = b.alias.length - a.alias.length;
  if (aliasLengthDiff !== 0) return aliasLengthDiff;
  const priorityDiff = (b.record.priority || 0) - (a.record.priority || 0);
  if (priorityDiff !== 0) return priorityDiff;
  return a.record.id.localeCompare(b.record.id);
}

function compareRecordsForMatch(a, b) {
  const priorityDiff = (b.priority || 0) - (a.priority || 0);
  if (priorityDiff !== 0) return priorityDiff;
  const regionDiff = (b.regions?.includes('RO') ? 1 : 0) - (a.regions?.includes('RO') ? 1 : 0);
  if (regionDiff !== 0) return regionDiff;
  return a.id.localeCompare(b.id);
}

function isRiskyShortAlias(alias, record) {
  return alias.length < 4
    && !alias.includes(' ')
    && record.tags?.some((tag) => RISKY_SHORT_ALIAS_TAGS.has(tag));
}

function sanitizeRecord(rawRecord, sourceType) {
  const canonicalName = String(rawRecord.canonicalName || '').trim();
  const aliases = uniqueSorted(
    [canonicalName, ...(rawRecord.aliases || [])]
      .map((alias) => String(alias || '').trim())
      .filter(Boolean)
  );
  const normalizedAliases = uniqueSorted(aliases.map(normalizeVendorKey).filter(Boolean));
  const familyAliases = uniqueSorted((rawRecord.familyAliases || []).map(normalizeVendorKey).filter(Boolean));
  const fallbackKeywords = uniqueSorted((rawRecord.fallbackKeywords || []).map(normalizeVendorKey).filter(Boolean));

  return {
    id: String(rawRecord.id || '').trim(),
    canonicalName,
    aliases,
    normalizedAliases,
    countryCodes: uniqueSorted((rawRecord.countryCodes || []).map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)),
    regions: uniqueSorted((rawRecord.regions || ['Global']).map((region) => String(region || '').trim()).filter(Boolean)),
    category: normalizeCategory(rawRecord.category),
    subcategory: String(rawRecord.subcategory || 'Other').trim(),
    sourceType,
    sourceEvidence: [sourceType],
    priority: Number.isFinite(rawRecord.priority) ? rawRecord.priority : 0,
    confidenceHint: rawRecord.confidenceHint || 'medium',
    tags: uniqueSorted((rawRecord.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean)),
    family: rawRecord.family ? String(rawRecord.family).trim() : null,
    familyAliases,
    fallbackKeywords,
    searchKeys: uniqueSorted([...normalizedAliases, ...familyAliases, ...fallbackKeywords]),
  };
}

export function compileVendorKnowledgeFromSourcePayloads(sourcePayloads) {
  const mergedById = new Map();

  for (const payload of sourcePayloads) {
    const sourceType = payload?.sourceType || 'manual';
    const records = Array.isArray(payload?.records) ? payload.records : [];

    for (const rawRecord of records) {
      const record = sanitizeRecord(rawRecord, sourceType);
      if (!record.id || !record.canonicalName || record.normalizedAliases.length === 0) continue;

      const existing = mergedById.get(record.id);
      if (!existing) {
        mergedById.set(record.id, record);
        continue;
      }

      const winner = mergeScore(record) >= mergeScore(existing) ? record : existing;
      const loser = winner === record ? existing : record;
      mergedById.set(record.id, {
        ...winner,
        aliases: uniqueSorted([...winner.aliases, ...loser.aliases]),
        normalizedAliases: uniqueSorted([...winner.normalizedAliases, ...loser.normalizedAliases]),
        countryCodes: uniqueSorted([...winner.countryCodes, ...loser.countryCodes]),
        regions: uniqueSorted([...winner.regions, ...loser.regions]),
        tags: uniqueSorted([...winner.tags, ...loser.tags]),
        familyAliases: uniqueSorted([...winner.familyAliases, ...loser.familyAliases]),
        fallbackKeywords: uniqueSorted([...winner.fallbackKeywords, ...loser.fallbackKeywords]),
        searchKeys: uniqueSorted([...winner.searchKeys, ...loser.searchKeys]),
        sourceEvidence: uniqueSorted([...winner.sourceEvidence, ...loser.sourceEvidence]),
      });
    }
  }

  const records = [...mergedById.values()].sort(compareRecordsForMatch);

  return {
    schemaVersion: COMPILED_SCHEMA_VERSION,
    records,
  };
}

function createBoundaryHaystack(normalizedDescription) {
  return ` ${normalizedDescription} `;
}

function hasTokenBoundary(normalizedDescription, normalizedVendor) {
  if (!normalizedDescription || !normalizedVendor) return false;
  return createBoundaryHaystack(normalizedDescription).includes(` ${normalizedVendor} `);
}

export function vendorMatchType(normalizedDescription, vendor) {
  const normalizedVendor = normalizeVendorKey(vendor);
  if (!normalizedVendor) return 'none';
  if (normalizedDescription === normalizedVendor) return 'exact';

  if (!prefersShortBoundary(normalizedVendor)) {
    return 'none';
  }

  return hasTokenBoundary(normalizedDescription, normalizedVendor)
    ? 'contains'
    : 'none';
}

function buildFuzzyDocs(record) {
  return record.searchKeys
    .filter((alias) => !isRiskyShortAlias(alias, record))
    .map((alias) => ({
      record,
      alias,
      canonicalKey: normalizeVendorKey(record.canonicalName),
      searchText: uniqueSorted([alias, normalizeVendorKey(record.canonicalName), ...record.familyAliases]).join(' '),
    }));
}

function buildRuntimeIndexes(knowledge) {
  const exactAliasMap = new Map();
  const boundaryAliases = [];
  const familyAliases = [];
  const fallbackAliases = [];
  const fuzzyDocs = [];

  for (const record of knowledge.records || []) {
    for (const alias of record.normalizedAliases || []) {
      if (isRiskyShortAlias(alias, record)) {
        continue;
      }

      const current = exactAliasMap.get(alias);
      if (!current || compareRecordsForMatch(record, current) < 0) {
        exactAliasMap.set(alias, record);
      }

      boundaryAliases.push({ alias, record });
    }

    for (const alias of record.familyAliases || []) {
      familyAliases.push({ alias, record });
    }

    const lowRisk = record.tags?.some((tag) => LOW_CONFIDENCE_TAGS.has(tag));
    if (lowRisk) {
      for (const alias of record.fallbackKeywords || []) {
        fallbackAliases.push({ alias, record });
      }
    }

    fuzzyDocs.push(...buildFuzzyDocs(record));
  }

  boundaryAliases.sort(compareAliasEntries);
  familyAliases.sort(compareAliasEntries);
  fallbackAliases.sort(compareAliasEntries);

  const fuzzyFuse = new Fuse(fuzzyDocs, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.3,
    minMatchCharLength: 2,
    keys: [
      { name: 'alias', weight: 0.78 },
      { name: 'canonicalKey', weight: 0.12 },
      { name: 'searchText', weight: 0.1 },
    ],
  });

  return { exactAliasMap, boundaryAliases, familyAliases, fallbackAliases, fuzzyFuse };
}

function toMatchResult(record, matchedAlias, matchSource, confidence, matchStrategy) {
  return {
    category: record.category,
    subcategory: record.subcategory,
    matchedVendor: record.canonicalName,
    matchedAlias,
    matchedVendorId: record.id,
    matchedRegion: record.regions?.includes('RO') ? 'RO' : (record.regions?.[0] || 'Global'),
    matchSource,
    matchStrategy,
    confidence,
  };
}

function sortCustomVendorMappings(vendors) {
  return Object.entries(vendors).sort((a, b) => normalizeVendorKey(b[0]).length - normalizeVendorKey(a[0]).length);
}

function getNextDistinctFuzzyResult(results, recordId) {
  return results.find((entry) => entry?.item?.record?.id !== recordId) || null;
}

function canUseFuzzyCandidate(result, results, normalizedDescription) {
  if (!result?.item || typeof result.score !== 'number') return false;
  if (normalizedDescription.length < 4) return false;
  if (result.score > FUZZY_SCORE_THRESHOLD) return false;

  const nextResult = getNextDistinctFuzzyResult(results.slice(1), result.item.record.id);
  if (nextResult?.item && typeof nextResult.score === 'number') {
    if ((nextResult.score - result.score) < FUZZY_SCORE_GAP_THRESHOLD) return false;
  }

  const { alias, record } = result.item;
  if (!record.tags?.some((tag) => APPROVED_FUZZY_TAGS.has(tag))) return false;

  if (alias.length < 4 && !hasTokenBoundary(normalizedDescription, alias)) return false;

  return true;
}

function buildSuggestions(results, limit = 3) {
  const unique = [];
  const seen = new Set();

  for (const result of results) {
    if (!result?.item || typeof result.score !== 'number' || result.score > SUGGESTION_SCORE_THRESHOLD) continue;
    const key = `${result.item.record.id}:${result.item.alias}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      canonicalName: result.item.record.canonicalName,
      category: result.item.record.category,
      subcategory: result.item.record.subcategory,
      alias: result.item.alias,
      score: Number(result.score.toFixed(4)),
      sourceEvidence: result.item.record.sourceEvidence,
    });
    if (unique.length >= limit) break;
  }

  return unique;
}

export function createVendorMatcher(knowledge) {
  const runtimeIndexes = buildRuntimeIndexes(knowledge);

  function suggestCandidates(description, limit = 3) {
    const normalizedDescription = normalizeVendorKey(description);
    if (!normalizedDescription) return [];
    return buildSuggestions(runtimeIndexes.fuzzyFuse.search(normalizedDescription), limit);
  }

  function classifyVendor(description, amount, customVendors = {}) {
    if (amount > 0) {
      return {
        category: 'Income',
        subcategory: 'Income',
        matchedVendor: 'Income',
        matchedAlias: undefined,
        matchedVendorId: undefined,
        matchedRegion: undefined,
        matchSource: 'system',
        matchStrategy: 'system',
        confidence: 'high',
      };
    }

    const normalizedDescription = normalizeVendorKey(description);

    for (const [vendor, [category, subcategory]] of sortCustomVendorMappings(customVendors)) {
      const matchType = vendorMatchType(normalizedDescription, vendor);
      if (matchType !== 'none') {
        return {
          category,
          subcategory,
          matchedVendor: vendor,
          matchedAlias: vendor,
          matchedVendorId: undefined,
          matchedRegion: undefined,
          matchSource: 'custom',
          matchStrategy: 'custom',
          confidence: 'high',
        };
      }
    }

    const exactRecord = runtimeIndexes.exactAliasMap.get(normalizedDescription);
    if (exactRecord) {
      return toMatchResult(exactRecord, normalizedDescription, 'built-in-exact', 'high', 'exact');
    }

    for (const entry of runtimeIndexes.boundaryAliases) {
      if (vendorMatchType(normalizedDescription, entry.alias) === 'contains') {
        return toMatchResult(
          entry.record,
          entry.alias,
          'built-in-contains',
          entry.record.confidenceHint === 'high' ? 'medium' : entry.record.confidenceHint,
          'boundary'
        );
      }
    }

    for (const entry of runtimeIndexes.familyAliases) {
      if (vendorMatchType(normalizedDescription, entry.alias) !== 'none') {
        return toMatchResult(entry.record, entry.alias, 'family', 'medium', 'family');
      }
    }

    for (const entry of runtimeIndexes.fallbackAliases) {
      if (vendorMatchType(normalizedDescription, entry.alias) !== 'none') {
        return toMatchResult(entry.record, entry.alias, 'keyword', 'low', 'keyword');
      }
    }

    const fuzzyResults = runtimeIndexes.fuzzyFuse.search(normalizedDescription);
    if (canUseFuzzyCandidate(fuzzyResults[0], fuzzyResults, normalizedDescription)) {
      const accepted = fuzzyResults[0].item;
      return toMatchResult(accepted.record, accepted.alias, 'fuzzy', 'medium', 'fuzzy');
    }

    return {
      category: 'Other',
      subcategory: '',
      matchedVendor: undefined,
      matchedAlias: undefined,
      matchedVendorId: undefined,
      matchedRegion: undefined,
      matchSource: 'none',
      matchStrategy: 'none',
      confidence: 'none',
      candidateSuggestions: suggestCandidates(description),
    };
  }

  return {
    knowledge,
    classifyVendor,
    suggestCandidates,
  };
}
