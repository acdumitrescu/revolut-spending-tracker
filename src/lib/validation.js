import { z } from 'zod';
import { BASE_CURRENCY, DEFAULT_FX_RATES, SUPPORTED_DISPLAY_CURRENCIES } from './fx';

export const THEME_MODES = ['light', 'dark'];
export const APP_STATE_SCHEMA_VERSION = 1;

export const TransactionSchema = z.object({
  date: z.string().min(1),
  desc: z.string(),
  cat: z.string(),
  sub: z.string(),
  amt: z.number(),
  flow: z.enum(['Credit', 'Debit']),
  type: z.string(),
  ym: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Year-month must be YYYY-MM format with valid month'),
  currency: z.string().optional(),
  ref: z.string().optional(),
  source: z.string().optional(),
  matchedVendor: z.string().optional(),
  matchedAlias: z.string().optional(),
  matchedVendorId: z.string().optional(),
  matchedRegion: z.string().optional(),
  matchSource: z.enum(['custom', 'built-in-exact', 'built-in-contains', 'family', 'keyword', 'fuzzy', 'system', 'none']).optional(),
  matchStrategy: z.enum(['custom', 'exact', 'boundary', 'family', 'keyword', 'fuzzy', 'system', 'none']).optional(),
  confidence: z.enum(['high', 'medium', 'low', 'none']).optional(),
});

export const VendorObservationCandidateSchema = z.object({
  canonicalName: z.string(),
  category: z.string(),
  subcategory: z.string(),
  alias: z.string(),
  score: z.number().nonnegative(),
  sourceEvidence: z.array(z.string()).default([]),
});

export const VendorObservationSchema = z.object({
  normalizedDescription: z.string().min(1),
  rawDescription: z.string().min(1),
  amountAbs: z.number().nonnegative(),
  count: z.number().int().positive().default(1),
  firstSeenAt: z.string().min(1),
  lastSeenAt: z.string().min(1),
  suggestedCandidates: z.array(VendorObservationCandidateSchema).default([]),
});

export const ParsedCSVSchema = z.object({
  transactions: z.array(TransactionSchema),
  summary: z.object({
    detectedProfileId: z.string(),
    detectedProfileLabel: z.string(),
    totalRows: z.number().int().nonnegative(),
    processedRows: z.number().int().nonnegative(),
    skippedRows: z.number().int().nonnegative(),
    warnings: z.array(z.string()).default([]),
    skippedReasonCounts: z.record(z.string(), z.number().int().nonnegative()).default({}),
    skippedDetails: z.array(z.string()).default([]),
    validationCategories: z.record(z.string(), z.number().int().nonnegative()).default({}),
    unknownVendorCount: z.number().int().nonnegative().default(0),
  }),
  vendorObservations: z.array(VendorObservationSchema).default([]),
});

export const ImportSummaryRecordSchema = ParsedCSVSchema.shape.summary.extend({
  fileName: z.string().optional(),
  importedAt: z.number().int().nonnegative(),
});

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional().default(BASE_CURRENCY),
  balances: z.record(z.string(), z.number()),
  monthlyContribution: z.number().nonnegative().default(0),
});

export const GoalSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().or(z.literal('')),
});

export const AppDataSchema = z.object({
  transactions: z.array(TransactionSchema),
  customVendors: z.record(z.string(), z.tuple([z.string(), z.string()])),
  accounts: z.array(AccountSchema),
  budgets: z.record(z.string(), z.record(z.string(), z.number())).optional().default({}),
  goals: z.array(GoalSchema).optional().default([]),
  baseCurrency: z.string().optional().default(BASE_CURRENCY),
  displayCurrency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional().default(BASE_CURRENCY),
  themeMode: z.enum(THEME_MODES).optional().default('light'),
  fxRates: z.object({
    EUR: z.number().positive(),
    USD: z.number().positive(),
  }).optional().default(DEFAULT_FX_RATES),
  fxUpdatedAt: z.number().nullable().optional().default(null),
  fxSource: z.string().optional().default('manual-default'),
  importMeta: z.object({
    latestSummary: ImportSummaryRecordSchema.nullable().optional().default(null),
  }).optional().default({ latestSummary: null }),
  syncInfo: z.object({
    lastSuccessfulSyncAt: z.number().nullable().optional().default(null),
    lastRemoteVersion: z.number().int().nonnegative().optional().default(0),
    lastRemoteUpdatedAt: z.number().nullable().optional().default(null),
  }).optional().default({
    lastSuccessfulSyncAt: null,
    lastRemoteVersion: 0,
    lastRemoteUpdatedAt: null,
  }),
  lastUpdated: z.number().nullable(),
});

export const PersistedAppStateSchema = z.object({
  schemaVersion: z.literal(APP_STATE_SCHEMA_VERSION),
  exportedAt: z.number().int().nonnegative().nullable().optional().default(null),
  data: AppDataSchema,
});

export function validateAppData(data) {
  const result = AppDataSchema.safeParse(data);
  if (!result.success) {
    console.error('AppData validation failed:', result.error.format());
    return false;
  }
  return true;
}

function normalizeTransactionSubcategory(transaction) {
  if (!transaction || typeof transaction !== 'object') return transaction;

  const category = String(transaction.cat || '').trim();
  const subcategory = String(transaction.sub || '').trim();

  return {
    ...transaction,
    sub: subcategory && subcategory !== category ? subcategory : '',
  };
}

function normalizeAppDataShape(data) {
  return {
    ...data,
    transactions: Array.isArray(data.transactions)
      ? data.transactions.map(normalizeTransactionSubcategory)
      : [],
  };
}

export function sanitizeAppData(raw) {
  const fallback = {
    transactions: [],
    customVendors: {},
    accounts: [],
    budgets: {},
    goals: [],
    baseCurrency: BASE_CURRENCY,
    displayCurrency: BASE_CURRENCY,
    themeMode: 'light',
    fxRates: DEFAULT_FX_RATES,
    fxUpdatedAt: null,
    fxSource: 'manual-default',
    importMeta: {
      latestSummary: null,
    },
    syncInfo: {
      lastSuccessfulSyncAt: null,
      lastRemoteVersion: 0,
      lastRemoteUpdatedAt: null,
    },
    lastUpdated: null,
  };

  const result = AppDataSchema.safeParse(raw);
  if (result.success) return normalizeAppDataShape(result.data);

  if (raw && typeof raw === 'object') {
    const t = Array.isArray(raw.transactions) ? raw.transactions : [];
    fallback.transactions = t
      .filter((txn) => {
        const r = TransactionSchema.safeParse(txn);
        return r.success;
      })
      .map(normalizeTransactionSubcategory);
    if (raw.customVendors && typeof raw.customVendors === 'object') {
      fallback.customVendors = raw.customVendors;
    }
    if (Array.isArray(raw.accounts)) {
      fallback.accounts = raw.accounts
        .map((account) => AccountSchema.safeParse(account))
        .filter((result) => result.success)
        .map((result) => result.data);
    }
    if (Array.isArray(raw.goals)) {
      fallback.goals = raw.goals.filter((goal) => GoalSchema.safeParse(goal).success);
    }
    if (raw.budgets && typeof raw.budgets === 'object') {
      const budgetEntries = Object.entries(raw.budgets);
      const looksLegacy = budgetEntries.every(([, value]) => typeof value === 'number');
      if (looksLegacy) {
        const latestMonth = fallback.transactions.map((txn) => txn.ym).sort().at(-1) || new Date().toISOString().slice(0, 7);
        fallback.budgets = { [latestMonth]: Object.fromEntries(budgetEntries) };
      } else {
        fallback.budgets = budgetEntries.reduce((acc, [month, monthBudgets]) => {
          if (typeof monthBudgets !== 'object' || monthBudgets === null) return acc;
          const normalized = Object.entries(monthBudgets).reduce((inner, [cat, amount]) => {
            if (typeof amount === 'number' && Number.isFinite(amount)) {
              inner[cat] = amount;
            }
            return inner;
          }, {});
          if (Object.keys(normalized).length > 0) {
            acc[month] = normalized;
          }
          return acc;
        }, {});
      }
    }
    fallback.baseCurrency = BASE_CURRENCY;
    fallback.displayCurrency = typeof raw.displayCurrency === 'string' && SUPPORTED_DISPLAY_CURRENCIES.includes(raw.displayCurrency.trim().toUpperCase())
      ? raw.displayCurrency.trim().toUpperCase()
      : BASE_CURRENCY;
    fallback.themeMode = typeof raw.themeMode === 'string' && THEME_MODES.includes(raw.themeMode.trim().toLowerCase())
      ? raw.themeMode.trim().toLowerCase()
      : 'light';
    fallback.fxRates = {
      EUR: typeof raw.fxRates?.EUR === 'number' && Number.isFinite(raw.fxRates.EUR) && raw.fxRates.EUR > 0
        ? raw.fxRates.EUR
        : DEFAULT_FX_RATES.EUR,
      USD: typeof raw.fxRates?.USD === 'number' && Number.isFinite(raw.fxRates.USD) && raw.fxRates.USD > 0
        ? raw.fxRates.USD
        : DEFAULT_FX_RATES.USD,
    };
    fallback.fxUpdatedAt = typeof raw.fxUpdatedAt === 'number' ? raw.fxUpdatedAt : null;
    fallback.fxSource = typeof raw.fxSource === 'string' && raw.fxSource.trim()
      ? raw.fxSource.trim()
      : 'manual-default';
    if (raw.importMeta && typeof raw.importMeta === 'object') {
      const latestSummaryResult = ImportSummaryRecordSchema.safeParse(raw.importMeta.latestSummary);
      fallback.importMeta = {
        latestSummary: latestSummaryResult.success ? latestSummaryResult.data : null,
      };
    }
    if (raw.syncInfo && typeof raw.syncInfo === 'object') {
      fallback.syncInfo = {
        lastSuccessfulSyncAt: typeof raw.syncInfo.lastSuccessfulSyncAt === 'number' ? raw.syncInfo.lastSuccessfulSyncAt : null,
        lastRemoteVersion: Number.isInteger(raw.syncInfo.lastRemoteVersion) && raw.syncInfo.lastRemoteVersion >= 0 ? raw.syncInfo.lastRemoteVersion : 0,
        lastRemoteUpdatedAt: typeof raw.syncInfo.lastRemoteUpdatedAt === 'number' ? raw.syncInfo.lastRemoteUpdatedAt : null,
      };
    }
    fallback.lastUpdated = typeof raw.lastUpdated === 'number' ? raw.lastUpdated : null;
  }

  return normalizeAppDataShape(fallback);
}

export function sanitizePersistedAppState(raw) {
  const parsed = PersistedAppStateSchema.safeParse(raw);
  if (parsed.success) {
    return {
      ...parsed.data,
      data: sanitizeAppData(parsed.data.data),
    };
  }

  const legacyData = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
    ? raw.data
    : raw;

  return {
    schemaVersion: APP_STATE_SCHEMA_VERSION,
    exportedAt: typeof raw?.exportedAt === 'number' ? raw.exportedAt : null,
    data: sanitizeAppData(legacyData),
  };
}
