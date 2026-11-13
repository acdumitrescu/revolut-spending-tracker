import { categorizeTransactionRecord } from './csvParser';
import { normalizeText, normalizeVendorKey } from './vendorKnowledge';

const MATCH_METADATA_KEYS = [
  'matchedVendor',
  'matchedAlias',
  'matchedVendorId',
  'matchedRegion',
  'matchSource',
  'matchStrategy',
  'confidence',
];

const PROTECTED_SYSTEM_CATEGORIES = new Set(['Cash', 'Income', 'Refunds', 'Savings', 'Transfers']);

function classificationMetadata(classification) {
  return Object.fromEntries(MATCH_METADATA_KEYS.map((key) => [key, classification[key]]));
}

function normalizeSubcategory(category, subcategory) {
  const value = String(subcategory || '').trim();
  return value && value !== category ? value : '';
}

function getLegacyAutomaticClassification(transaction) {
  return categorizeTransactionRecord(transaction, {});
}

function getLegacyManualCategory(transaction) {
  if (transaction.baseCat || transaction.manualCat) return null;
  if (!transaction.matchSource || ['none', 'custom', 'system'].includes(transaction.matchSource))
    return null;

  const automatic = getLegacyAutomaticClassification(transaction);
  const storedSubcategory = normalizeSubcategory(transaction.cat, transaction.sub);
  const automaticSubcategory = normalizeSubcategory(automatic.category, automatic.subcategory);
  if (transaction.cat === automatic.category && storedSubcategory === automaticSubcategory)
    return null;

  return {
    cat: transaction.cat,
    sub: storedSubcategory,
    baseCat: automatic.category,
    baseSub: automaticSubcategory,
  };
}

function getBaseCategory(transaction, legacyManualCategory) {
  if (transaction.baseCat) {
    return {
      cat: transaction.baseCat,
      sub: normalizeSubcategory(transaction.baseCat, transaction.baseSub),
    };
  }

  if (transaction.matchSource === 'custom') {
    const fallback = getLegacyAutomaticClassification(transaction);
    return {
      cat: fallback.category,
      sub: normalizeSubcategory(fallback.category, fallback.subcategory),
    };
  }

  if (legacyManualCategory) {
    return {
      cat: legacyManualCategory.baseCat,
      sub: legacyManualCategory.baseSub,
    };
  }

  return {
    cat: transaction.cat,
    sub: normalizeSubcategory(transaction.cat, transaction.sub),
  };
}

function isProtectedSystemTransaction(transaction, baseCategory) {
  if (transaction.matchSource === 'system') return true;
  if (Number(transaction.amt) > 0) return true;

  const normalizedType = normalizeText(transaction.type);
  if (
    normalizedType.includes('transfer') ||
    normalizedType.includes('top up') ||
    normalizedType.includes('cash')
  ) {
    return true;
  }

  return (
    PROTECTED_SYSTEM_CATEGORIES.has(baseCategory.cat) &&
    ['Cash', 'Savings', 'Transfers'].includes(baseCategory.cat)
  );
}

export function compileCustomVendorMappings(customVendors = {}) {
  return Object.entries(customVendors)
    .map(([vendor, mapping]) => {
      if (!Array.isArray(mapping)) return null;
      const normalizedVendor = normalizeVendorKey(vendor);
      if (!normalizedVendor) return null;

      return {
        vendor,
        normalizedVendor,
        boundaryNeedle: ` ${normalizedVendor} `,
        category: String(mapping[0] || '').trim(),
        subcategory: String(mapping[1] || '').trim(),
      };
    })
    .filter((mapping) => mapping?.category)
    .sort(
      (a, b) =>
        b.normalizedVendor.length - a.normalizedVendor.length ||
        a.normalizedVendor.localeCompare(b.normalizedVendor),
    );
}

function matchCustomVendor(transaction, compiledMappings) {
  if (compiledMappings.length === 0) return null;

  const normalizedDescription = normalizeVendorKey(transaction.desc);
  if (!normalizedDescription) return null;
  const boundaryDescription = ` ${normalizedDescription} `;

  for (const mapping of compiledMappings) {
    const isExact = normalizedDescription === mapping.normalizedVendor;
    const isBoundaryMatch =
      (mapping.normalizedVendor.length >= 4 || mapping.normalizedVendor.includes(' ')) &&
      boundaryDescription.includes(mapping.boundaryNeedle);

    if (!isExact && !isBoundaryMatch) continue;

    return {
      category: mapping.category,
      subcategory: mapping.subcategory,
      matchedVendor: mapping.vendor,
      matchedAlias: mapping.vendor,
      matchedVendorId: undefined,
      matchedRegion: undefined,
      matchSource: 'custom',
      matchStrategy: 'custom',
      confidence: 'high',
    };
  }

  return null;
}

function resolveWithCompiledMappings(transaction, compiledMappings) {
  const legacyManualCategory = getLegacyManualCategory(transaction);
  const baseCategory = getBaseCategory(transaction, legacyManualCategory);
  const manualCategory = transaction.manualCat
    ? {
        cat: transaction.manualCat,
        sub: normalizeSubcategory(transaction.manualCat, transaction.manualSub),
      }
    : legacyManualCategory;

  // Currency exchanges imported before they were recognised are stored as Other/Income; they are transfers.
  const isExchange = !manualCategory && /^exchange$/i.test(String(transaction.type || '').trim());
  if (isExchange) {
    return {
      ...transaction,
      baseCat: 'Transfers',
      baseSub: 'Transfers',
      cat: 'Transfers',
      sub: 'Transfers',
      categorySource: 'automatic',
    };
  }

  if (manualCategory) {
    return {
      ...transaction,
      baseCat: baseCategory.cat,
      baseSub: baseCategory.sub,
      cat: manualCategory.cat,
      sub: manualCategory.sub,
      categorySource: 'manual',
    };
  }

  if (isProtectedSystemTransaction(transaction, baseCategory)) {
    return {
      ...transaction,
      baseCat: baseCategory.cat,
      baseSub: baseCategory.sub,
      cat: baseCategory.cat,
      sub: baseCategory.sub,
      categorySource: 'automatic',
    };
  }

  const customClassification = matchCustomVendor(transaction, compiledMappings);
  if (customClassification) {
    return {
      ...transaction,
      ...classificationMetadata(customClassification),
      baseCat: baseCategory.cat,
      baseSub: baseCategory.sub,
      cat: customClassification.category,
      sub: normalizeSubcategory(customClassification.category, customClassification.subcategory),
      categorySource: 'custom',
    };
  }

  const baseClassification =
    transaction.matchSource === 'custom' ? getLegacyAutomaticClassification(transaction) : null;

  return {
    ...transaction,
    ...(baseClassification ? classificationMetadata(baseClassification) : {}),
    baseCat: baseCategory.cat,
    baseSub: baseCategory.sub,
    cat: baseCategory.cat,
    sub: baseCategory.sub,
    categorySource:
      transaction.matchSource &&
      transaction.matchSource !== 'none' &&
      transaction.matchSource !== 'custom'
        ? 'automatic'
        : 'imported',
  };
}

export function resolveTransactionCategory(transaction, customVendors = {}) {
  return resolveWithCompiledMappings(transaction, compileCustomVendorMappings(customVendors));
}

export function resolveTransactionCategories(transactions, customVendors = {}) {
  const compiledMappings = compileCustomVendorMappings(customVendors);
  return transactions.map((transaction) =>
    resolveWithCompiledMappings(transaction, compiledMappings),
  );
}
