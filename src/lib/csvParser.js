import Papa from 'papaparse';
import { ParsedCSVSchema } from './validation';
import { defaultVendorMatcher, normalizeText, normalizeVendorKey } from './vendorKnowledge';

const PROFILE_REGISTRY = [
  {
    id: 'normalized-csv',
    label: 'Normalized CSV',
    source: 'master',
    requiredGroups: [['date'], ['description'], ['amount'], ['category'], ['subcategory']],
    optionalGroups: [['flow'], ['type'], ['currency'], ['reference']],
    datePriority: ['date'],
    amountPriority: ['amount'],
    currencyPriority: ['currency'],
    descriptionPriority: ['description'],
    typePriority: ['type'],
    referencePriority: ['reference'],
  },
  {
    id: 'revolut-personal-raw',
    label: 'Revolut Personal CSV',
    source: 'revolut-personal',
    requiredGroups: [['description'], ['amount', 'amount_payment'], ['date_completed', 'date_started', 'date']],
    optionalGroups: [['type'], ['currency', 'currency_payment', 'currency_original'], ['reference']],
    datePriority: ['date_completed', 'date_started', 'date'],
    amountPriority: ['amount', 'amount_payment'],
    currencyPriority: ['currency', 'currency_payment', 'currency_original'],
    descriptionPriority: ['description'],
    typePriority: ['type'],
    referencePriority: ['reference'],
  },
  {
    id: 'revolut-business-transaction',
    label: 'Revolut Business Transaction Statement CSV',
    source: 'revolut-business-transaction',
    requiredGroups: [['description'], ['type'], ['amount', 'amount_payment', 'amount_original'], ['date_completed_local', 'date_completed_utc', 'date_completed', 'date_started_local', 'date_started_utc', 'date_started']],
    optionalGroups: [['currency_payment', 'currency_original', 'currency'], ['reference'], ['account']],
    datePriority: ['date_completed_local', 'date_completed_utc', 'date_completed', 'date_started_local', 'date_started_utc', 'date_started'],
    amountPriority: ['amount_payment', 'amount', 'amount_original'],
    currencyPriority: ['currency_payment', 'currency', 'currency_original'],
    descriptionPriority: ['description'],
    typePriority: ['type'],
    referencePriority: ['reference'],
  },
  {
    id: 'revolut-business-expense',
    label: 'Revolut Business Expense CSV',
    source: 'revolut-business-expense',
    requiredGroups: [['description'], ['amount_payment'], ['currency_payment'], ['type'], ['date_completed_local', 'date_completed_utc', 'date_completed', 'date_started_local', 'date_started_utc', 'date_started']],
    optionalGroups: [['amount_original'], ['currency_original'], ['reference'], ['category']],
    datePriority: ['date_completed_local', 'date_completed_utc', 'date_completed', 'date_started_local', 'date_started_utc', 'date_started'],
    amountPriority: ['amount_payment', 'amount_original'],
    currencyPriority: ['currency_payment', 'currency_original'],
    descriptionPriority: ['description'],
    typePriority: ['type'],
    referencePriority: ['reference'],
  },
];

const HEADER_ALIASES = {
  date: ['date'],
  date_started: ['started date'],
  date_completed: ['completed date'],
  date_started_utc: ['transaction started utc', 'started date utc', 'tranzactie initiata utc', 'transaccion iniciada utc', 'zacatek transakce utc'],
  date_completed_utc: ['transaction completed utc', 'completed date utc', 'tranzactie finalizata utc', 'transaccion completada utc', 'transakce byla dokoncena utc'],
  date_started_local: [
    'transaction started timezone set in your appearance settings',
    'transaction started local time',
    'tranzactie initiata fuse orar setat in setarile tale de aspect',
    'se ha iniciado la transaccion segun la zona horaria configurada en apariencia',
    'zacatek transakce casove pasmo je nastaveno v nastaveni vzhled'
  ],
  date_completed_local: [
    'transaction completed local time',
    'transaction completed timezone set in your appearance settings',
    'tranzactie finalizata se afiseaza ora setata in aspect din setarile tale',
    'transaccion completada zona horaria configurada en apariencia',
    'transakce byla dokoncena casove pasmo je nastaveno ve vasem nastaveni vzhled'
  ],
  description: ['description', 'transaction description', 'expense description', 'merchant', 'reference', 'descriere tranzactie', 'descriere cheltuiala', 'descripcion de la transaccion', 'descripcion de gasto', 'popis transakce', 'popis vydaju'],
  amount: ['amount'],
  amount_payment: ['amount payment currency', 'importe divisa de pago', 'suma moneda plata', 'castka mena platby'],
  amount_original: ['orig amount orig currency', 'original amount original currency', 'importe orig divisa orig', 'suma initiala moneda initiala', 'puv castka puv mena'],
  currency: ['currency'],
  currency_payment: ['payment currency', 'moneda de pago', 'moneda de plata', 'moneda plata', 'mena platby'],
  currency_original: ['base currency', 'original currency', 'moneda origen', 'moneda origine', 'moneda initiala', 'puvodni mena'],
  type: ['type', 'transaction type', 'tipul tranzactiei', 'tipo de transaccion', 'typ transakce'],
  reference: ['reference', 'id', 'transaction id', 'expense id', 'id tranzactie', 'id cheltuiala', 'identificador de transaccion', 'id de gasto', 'id transakce', 'id vydaje'],
  flow: ['flow'],
  category: ['category', 'expense category name', 'nume categorie de cheltuieli', 'nombre de la categoria de gasto', 'nazev kategorie vydaju'],
  subcategory: ['subcategory'],
  account: ['account'],
};

function normalizeHeader(value) {
  return normalizeText(value);
}

function normalizeDate(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const direct = value.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAmount(rawValue) {
  if (typeof rawValue === 'number') return rawValue;
  const normalized = String(rawValue || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/,(?=\d{1,2}$)/, '.')
    .replace(/,/g, '');

  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

function normalizeType(type, desc) {
  const rawType = normalizeText(type);
  const rawDesc = normalizeText(desc);

  if (rawType.includes('cash')) return 'Cash Withdrawal';
  if (rawType.includes('transfer') || rawDesc.includes('bank transfer')) return 'Bank Transfer';
  if (rawType.includes('card')) return 'Card Payment';
  if (rawType.includes('top up') || rawDesc.includes('top up')) return 'Top Up';
  if (rawType.includes('refund') || rawDesc.includes('refund') || rawDesc.includes('reversal')) return 'Refund';
  if (rawType.includes('chargeback')) return 'Chargeback';
  return String(type || '').trim();
}

function buildHeaderLookup(columns) {
  const actualByCanonical = {};
  const recognizedHeaders = new Set();

  for (const column of columns) {
    const normalized = normalizeHeader(column);
    let matched = false;

    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
        actualByCanonical[canonical] ||= [];
        actualByCanonical[canonical].push(column);
        recognizedHeaders.add(column);
        matched = true;
        break;
      }
    }

    if (!matched && normalized === 'transaction type') {
      actualByCanonical.type ||= [];
      actualByCanonical.type.push(column);
      recognizedHeaders.add(column);
    }
  }

  return {
    actualByCanonical,
    recognizedHeaders,
    unrecognizedHeaders: columns.filter((column) => !recognizedHeaders.has(column)),
  };
}

function hasAnyHeaderGroup(headerLookup, group) {
  return group.some((canonical) => (headerLookup.actualByCanonical[canonical] || []).length > 0);
}

function detectProfile(columns) {
  const headerLookup = buildHeaderLookup(columns);
  const normalizedProfile = PROFILE_REGISTRY.find((profile) => profile.id === 'normalized-csv');
  const personalProfile = PROFILE_REGISTRY.find((profile) => profile.id === 'revolut-personal-raw');
  const businessTransactionProfile = PROFILE_REGISTRY.find((profile) => profile.id === 'revolut-business-transaction');
  const businessExpenseProfile = PROFILE_REGISTRY.find((profile) => profile.id === 'revolut-business-expense');

  const normalizedMatched = normalizedProfile.requiredGroups.every((group) => hasAnyHeaderGroup(headerLookup, group));
  const personalMatched = personalProfile.requiredGroups.every((group) => hasAnyHeaderGroup(headerLookup, group));
  const businessTransactionMatched = businessTransactionProfile.requiredGroups.every((group) => hasAnyHeaderGroup(headerLookup, group));
  const businessExpenseMatched = businessExpenseProfile.requiredGroups.every((group) => hasAnyHeaderGroup(headerLookup, group));

  const hasExpandedBusinessColumns =
    hasAnyHeaderGroup(headerLookup, ['account']) ||
    hasAnyHeaderGroup(headerLookup, ['amount_payment']) ||
    hasAnyHeaderGroup(headerLookup, ['currency_payment']) ||
    hasAnyHeaderGroup(headerLookup, ['date_started_utc', 'date_started_local', 'date_completed_utc', 'date_completed_local']);

  const hasExpenseSpecificColumns =
    hasAnyHeaderGroup(headerLookup, ['amount_original']) ||
    hasAnyHeaderGroup(headerLookup, ['currency_original']);

  let profile = null;
  if (normalizedMatched) {
    profile = normalizedProfile;
  } else if (businessExpenseMatched && hasExpenseSpecificColumns) {
    profile = businessExpenseProfile;
  } else if (businessTransactionMatched && hasExpandedBusinessColumns) {
    profile = businessTransactionProfile;
  } else if (personalMatched) {
    profile = personalProfile;
  }

  return {
    profile,
    headerLookup,
  };
}

function getFirstMappedValue(row, headerLookup, canonicalKeys) {
  for (const canonicalKey of canonicalKeys) {
    const actualHeaders = headerLookup.actualByCanonical[canonicalKey] || [];
    for (const header of actualHeaders) {
      const value = row[header];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return '';
}

export function categorizeTransactionDetailed(description, amount, customVendors = {}) {
  return defaultVendorMatcher.classifyVendor(description, amount, customVendors);
}

export function categorizeTransaction(description, amount, customVendors = {}) {
  const result = categorizeTransactionDetailed(description, amount, customVendors);
  return [result.category, result.subcategory];
}

function categorizeNormalizedTransaction(description, amount, type, customVendors) {
  const normalizedType = normalizeType(type, description);
  const lowerType = normalizeText(normalizedType);

  if (amount > 0 && (lowerType.includes('refund') || lowerType.includes('chargeback'))) {
    return {
      category: 'Refunds',
      subcategory: 'Refunds',
      matchedVendor: 'Refund',
      matchedAlias: normalizedType,
      matchSource: 'system',
      confidence: 'high',
    };
  }

  if (lowerType.includes('transfer')) {
    return {
      category: 'Transfers',
      subcategory: 'Transfers',
      matchedVendor: 'Transfer',
      matchedAlias: normalizedType,
      matchSource: 'system',
      confidence: 'high',
    };
  }

  if (lowerType.includes('top up')) {
    return {
      category: 'Savings',
      subcategory: 'Top Up',
      matchedVendor: 'Top Up',
      matchedAlias: normalizedType,
      matchSource: 'system',
      confidence: 'high',
    };
  }

  if (lowerType.includes('cash')) {
    return {
      category: 'Cash',
      subcategory: 'Cash Withdrawal',
      matchedVendor: 'Cash Withdrawal',
      matchedAlias: normalizedType,
      matchSource: 'system',
      confidence: 'high',
    };
  }

  return categorizeTransactionDetailed(description, amount, customVendors);
}

function buildWarnings(profile, headerLookup) {
  const warnings = [];
  const warningSet = new Set();
  const validationCategories = {};

  function pushWarning(message) {
    if (!warningSet.has(message)) {
      warningSet.add(message);
      warnings.push(message);
    }
  }

  function tagValidation(category) {
    validationCategories[category] = (validationCategories[category] || 0) + 1;
  }

  if (headerLookup.unrecognizedHeaders.length > 0) {
    pushWarning(`Unrecognized columns ignored: ${headerLookup.unrecognizedHeaders.slice(0, 5).join(', ')}${headerLookup.unrecognizedHeaders.length > 5 ? ', ...' : ''}`);
    tagValidation('unrecognized-columns');
  }

  if (headerLookup.unrecognizedHeaders.length > 0 && headerLookup.recognizedHeaders.size > 0) {
    pushWarning('Partially recognized header set detected. Parsed using the closest supported profile.');
    tagValidation('partial-header-match');
  }

  if (
    hasAnyHeaderGroup(headerLookup, ['date_started_utc']) &&
    hasAnyHeaderGroup(headerLookup, ['date_started_local'])
  ) {
    pushWarning('Both UTC and local started-date columns detected. Local/completed dates are preferred when available.');
    tagValidation('multiple-date-sources');
  }

  if (
    hasAnyHeaderGroup(headerLookup, ['date_completed_utc']) &&
    hasAnyHeaderGroup(headerLookup, ['date_completed_local'])
  ) {
    pushWarning('Both UTC and local completed-date columns detected. Local completed dates are preferred when available.');
    tagValidation('multiple-date-sources');
  }

  if (
    hasAnyHeaderGroup(headerLookup, ['amount_payment']) &&
    hasAnyHeaderGroup(headerLookup, ['amount_original'])
  ) {
    pushWarning('Both payment and original amount columns detected. Payment amount is used for analytics.');
    tagValidation('multiple-amount-sources');
  }

  if (
    hasAnyHeaderGroup(headerLookup, ['currency_payment']) &&
    hasAnyHeaderGroup(headerLookup, ['currency_original'])
  ) {
    pushWarning('Both payment and original currency columns detected. Payment currency is preferred when available.');
    tagValidation('multiple-currency-sources');
  }

  if (profile.id === 'normalized-csv' && !hasAnyHeaderGroup(headerLookup, ['flow'])) {
    pushWarning('Normalized CSV is missing an explicit Flow column. Flow will fall back to amount sign.');
    tagValidation('flow-derived-from-sign');
  }

  return {
    warnings,
    validationCategories,
  };
}

function buildVendorObservation(transaction, classification) {
  if (classification.matchSource !== 'none') return null;

  return {
    normalizedDescription: normalizeVendorKey(transaction.desc),
    rawDescription: transaction.desc,
    amountAbs: Math.abs(transaction.amt),
    count: 1,
    firstSeenAt: transaction.date,
    lastSeenAt: transaction.date,
    suggestedCandidates: classification.candidateSuggestions || [],
  };
}

function mergeVendorObservations(observations) {
  const merged = new Map();

  for (const observation of observations.filter(Boolean)) {
    const existing = merged.get(observation.normalizedDescription);
    if (!existing) {
      merged.set(observation.normalizedDescription, {
        ...observation,
      });
      continue;
    }

    const sampleSet = new Set([existing.rawDescription, observation.rawDescription].filter(Boolean));
    const preferredSuggestionMap = new Map(
      [...existing.suggestedCandidates, ...observation.suggestedCandidates]
        .sort((a, b) => a.score - b.score)
        .map((candidate) => [`${candidate.canonicalName}:${candidate.alias}`, candidate])
    );

    merged.set(observation.normalizedDescription, {
      normalizedDescription: observation.normalizedDescription,
      rawDescription: [...sampleSet][0],
      amountAbs: existing.amountAbs + observation.amountAbs,
      count: existing.count + observation.count,
      firstSeenAt: existing.firstSeenAt < observation.firstSeenAt ? existing.firstSeenAt : observation.firstSeenAt,
      lastSeenAt: existing.lastSeenAt > observation.lastSeenAt ? existing.lastSeenAt : observation.lastSeenAt,
      suggestedCandidates: [...preferredSuggestionMap.values()].slice(0, 3),
    });
  }

  return [...merged.values()].sort((a, b) => b.amountAbs - a.amountAbs);
}

function buildTransaction(row, profile, headerLookup, customVendors, rowIndex) {
  const rawDate = getFirstMappedValue(row, headerLookup, profile.datePriority);
  const date = normalizeDate(rawDate);
  const desc = String(getFirstMappedValue(row, headerLookup, profile.descriptionPriority) || '').trim();
  const amount = parseAmount(getFirstMappedValue(row, headerLookup, profile.amountPriority));
  const rawType = getFirstMappedValue(row, headerLookup, profile.typePriority);
  const type = normalizeType(rawType, desc);
  const currency = String(getFirstMappedValue(row, headerLookup, profile.currencyPriority) || '').trim().toUpperCase();
  const ref = String(getFirstMappedValue(row, headerLookup, profile.referencePriority) || '').trim();

  if (!date) {
    return { error: `Row ${rowIndex}: missing or invalid date` };
  }
  if (!desc) {
    return { error: `Row ${rowIndex}: missing description` };
  }
  if (Number.isNaN(amount)) {
    return { error: `Row ${rowIndex}: invalid amount` };
  }
  if (amount === 0) {
    return { error: `Row ${rowIndex}: zero-value transaction skipped` };
  }

  let cat = String(getFirstMappedValue(row, headerLookup, ['category']) || '').trim();
  let sub = String(getFirstMappedValue(row, headerLookup, ['subcategory']) || '').trim();
  const flowRaw = String(getFirstMappedValue(row, headerLookup, ['flow']) || '').trim();
  const flow = flowRaw || (amount > 0 ? 'Credit' : 'Debit');
  let classification = {
    matchedVendor: undefined,
    matchedAlias: undefined,
    matchedVendorId: undefined,
    matchedRegion: undefined,
    matchSource: 'none',
    matchStrategy: 'none',
    confidence: 'none',
  };

  if (!cat || !sub || cat === 'nan' || sub === 'nan') {
    const derived = categorizeNormalizedTransaction(desc, amount, type, customVendors);
    cat = derived.category;
    sub = derived.subcategory;
    classification = derived;
  }

  return {
    transaction: {
      date,
      desc,
      cat,
      sub,
      amt: amount,
      flow,
      type,
      ym: date.substring(0, 7),
      currency: currency || undefined,
      ref: ref || undefined,
      source: profile.source,
      matchedVendor: classification.matchedVendor,
      matchedAlias: classification.matchedAlias,
      matchedVendorId: classification.matchedVendorId,
      matchedRegion: classification.matchedRegion,
      matchSource: classification.matchSource,
      matchStrategy: classification.matchStrategy,
      confidence: classification.confidence,
    },
    vendorObservation: buildVendorObservation({
      date,
      desc,
      amt: amount,
    }, classification),
  };
}

export function parseCSV(file, customVendors = {}) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data;
        if (data.length === 0) {
          resolve({
            transactions: [],
            summary: {
              detectedProfileId: 'empty',
              detectedProfileLabel: 'Empty CSV',
              totalRows: 0,
              processedRows: 0,
              skippedRows: 0,
              warnings: [],
              skippedReasonCounts: {},
              skippedDetails: [],
            },
          });
          return;
        }

        const columns = Object.keys(data[0]);
        const { profile, headerLookup } = detectProfile(columns);

        if (!profile) {
          reject(new Error(`Unknown CSV format. Validation category: unsupported-file-shape. Columns: ${columns.join(', ')}`));
          return;
        }

        const { warnings, validationCategories } = buildWarnings(profile, headerLookup);
        const processed = [];
        const vendorObservations = [];
        const skippedDetails = [];
        const skippedReasonCounts = {};

        for (const [index, row] of data.entries()) {
          const result = buildTransaction(row, profile, headerLookup, customVendors, index + 2);
          if (result.error) {
            skippedDetails.push(result.error);
            const reason = result.error.split(': ').at(-1);
            skippedReasonCounts[reason] = (skippedReasonCounts[reason] || 0) + 1;
            if (reason.includes('invalid amount')) {
              validationCategories['suspicious-amount'] = (validationCategories['suspicious-amount'] || 0) + 1;
            } else if (reason.includes('invalid date')) {
              validationCategories['suspicious-date'] = (validationCategories['suspicious-date'] || 0) + 1;
            } else if (reason.includes('missing description')) {
              validationCategories['missing-description'] = (validationCategories['missing-description'] || 0) + 1;
            } else if (reason.includes('zero-value')) {
              validationCategories['zero-value-row'] = (validationCategories['zero-value-row'] || 0) + 1;
            }
            continue;
          }
          processed.push(result.transaction);
          if (result.vendorObservation) {
            vendorObservations.push(result.vendorObservation);
          }
        }

        const payload = {
          transactions: processed,
          summary: {
            detectedProfileId: profile.id,
            detectedProfileLabel: profile.label,
            totalRows: data.length,
            processedRows: processed.length,
            skippedRows: skippedDetails.length,
            warnings,
            skippedReasonCounts,
            skippedDetails,
            validationCategories,
            unknownVendorCount: vendorObservations.length,
          },
          vendorObservations: mergeVendorObservations(vendorObservations),
        };

        const validated = ParsedCSVSchema.safeParse(payload);
        if (!validated.success) {
          reject(validated.error);
          return;
        }

        resolve(validated.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

export function txKey(t) {
  return [t.date, t.desc, t.amt, t.type, t.flow, t.currency || '', t.ref || ''].join('|');
}

export function mergeTransactions(existing, newTxns) {
  const existingKeys = new Set(existing.map(txKey));
  const added = [];

  for (const t of newTxns) {
    const key = txKey(t);
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      added.push(t);
    }
  }

  return [...existing, ...added].sort((a, b) => a.date.localeCompare(b.date));
}
