import { z } from 'zod';
import { ACCOUNT_GROUPS, suggestAccountGroup } from './accountGroups.js';
import { BASE_CURRENCY, DEFAULT_FX_RATES, SUPPORTED_DISPLAY_CURRENCIES } from './stateConstants.js';

export const THEME_MODES = ['light', 'dark'];
export const APP_STATE_SCHEMA_VERSION = 1;

export const TransactionSchema = z.object({
  date: z.string().min(1),
  desc: z.string(),
  cat: z.string(),
  sub: z.string(),
  baseCat: z.string().optional(),
  baseSub: z.string().optional(),
  manualCat: z.string().optional(),
  manualSub: z.string().optional(),
  manualCategoryUpdatedAt: z.number().int().nonnegative().optional(),
  importBatchId: z.string().min(1).optional(),
  amt: z.number(),
  flow: z.enum(['Credit', 'Debit']),
  type: z.string(),
  ym: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Year-month must be YYYY-MM format with valid month'),
  currency: z.string().optional(),
  baseCurrency: z.string().optional(),
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
  rejectedRows: z.array(z.object({
    rowNumber: z.number().int().positive(),
    reason: z.string().min(1),
  })).default([]),
  summary: z.object({
    detectedProfileId: z.string(),
    detectedProfileLabel: z.string(),
    totalRows: z.number().int().nonnegative(),
    processedRows: z.number().int().nonnegative(),
    skippedRows: z.number().int().nonnegative(),
    duplicateRows: z.number().int().nonnegative().default(0),
    existingDuplicateRows: z.number().int().nonnegative().default(0),
    fileDuplicateRows: z.number().int().nonnegative().default(0),
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
  batchId: z.string().min(1).optional(),
});

export const ImportHistoryRecordSchema = ImportSummaryRecordSchema.extend({
  batchId: z.string().min(1),
  status: z.enum(['active', 'undone']).default('active'),
  undoneAt: z.number().int().nonnegative().nullable().optional().default(null),
});

export const AccountSchema = z.object({
  group: z.enum(ACCOUNT_GROUPS).optional(),
  id: z.string(),
  name: z.string().min(1),
  currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional().default(BASE_CURRENCY),
  balances: z.record(z.string(), z.number()),
  notes: z.record(z.string(), z.string()).optional().default({}),
}).transform(account => ({...account, group: account.group || suggestAccountGroup(account.name)}));

export const GoalContributionSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().refine((value) => Number.isFinite(value) && value !== 0),
  note: z.string().max(200).optional(),
});

// Every field added after the first release is optional so older goals keep validating.
export const GoalSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  targetAmount: z.number().positive(),
  targetMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().or(z.literal('')),
  currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional(),
  note: z.string().max(500).optional(),
  linkedAccountIds: z.array(z.string()).max(50).optional(),
  contributions: z.array(GoalContributionSchema).max(500).optional(),
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const PortfolioHoldingSchema = z.object({
  id: z.string().min(1),
  broker: z.string().optional(),
  account: z.string().optional(),
  accountCurrency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional(),
  ticker: z.string().min(1),
  name: z.string().min(1),
  assetClass: z.string().min(1),
  quantity: z.number().positive(),
  avgCost: z.number().nonnegative(),
  currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional().default(BASE_CURRENCY),
  currentPrice: z.number().nonnegative(),
  quoteSymbol: z.string().max(32).optional(),
  priceSource: z.enum(['manual', 'yahoo']).optional().default('manual'),
  priceUpdatedAt: z.number().nonnegative().nullable().optional(),
});

const CreditDateSchema = z.union([z.literal(''), z.iso.date()]).default('');
export const CardPurchaseSchema = z.object({
  priceMode: z.enum(['total', 'instalment']).default('total'),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  initialCost: z.number().positive(),
  totalCost: z.number().positive(),
  instalmentAmount: z.number().positive(),
  totalMonths: z.number().int().min(1).max(600),
  remainingMonths: z.number().int().nonnegative(),
  remainingBalance: z.number().nonnegative(),
  notes: z.string().max(4000).default(''),
  status: z.enum(['active', 'archived']).default('active'),
  archivedAt: z.number().int().nonnegative().nullable().default(null),
}).refine((item) => item.remainingMonths <= item.totalMonths, 'Remaining instalments cannot exceed the term')
  .refine((item) => item.remainingBalance <= item.totalCost, 'Remaining cost cannot exceed total cost')
  .refine((item) => item.status === 'archived'
    ? item.remainingBalance === 0 && item.remainingMonths === 0 && item.archivedAt !== null
    : item.archivedAt === null, 'Only completed purchases can be archived');
const creditFields = {
  id: z.string().min(1),
  monthlyPayment: z.number().nonnegative().nullable().default(null),
  dueDate: CreditDateSchema,
  notes: z.string().max(4000).default(''),
};

export const CreditRecordSchema = z.discriminatedUnion('kind', [
  z.object({ ...creditFields, kind: z.literal('card'), accountId: z.string().min(1), purchases: z.array(CardPurchaseSchema).default([]) }),
  z.object({ ...creditFields, kind: z.literal('vendor'), name: z.string().trim().min(1).max(160), currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES), remainingBalance: z.number().nonnegative() }),
  z.object({ ...creditFields, kind: z.literal('planned'), name: z.string().trim().min(1).max(160), currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES), amountFinanced: z.number().nonnegative(), termMonths: z.number().int().positive().max(600).nullable().default(null) }),
]);

const FlowAmount = z.number().int().positive().max(1e12);
const FlowLocation = z.object({
  kind: z.enum(['account', 'cash', 'other']),
  label: z.string().trim().min(1).max(160),
  accountId: z.string().nullable().default(null),
  currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES),
}).refine(row => row.kind === 'account' ? Boolean(row.accountId) : row.accountId === null, 'Invalid receiving location');
export const IncomeRecordSchema = z.object({
  id: z.string().min(1), date: z.iso.date(), source: z.string().trim().min(1).max(160),
  kind: z.enum(['salary', 'freelance', 'interest', 'gift', 'other']),
  amountMinor: FlowAmount, currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES),
  receivedIn: FlowLocation, notes: z.string().max(2000).default(''),
}).refine(row => row.currency === row.receivedIn.currency, 'Income and receiving currency must match');
export const AllocationRecordSchema = z.object({
  id: z.string().min(1), incomeId: z.string().min(1), date: z.iso.date(),
  amountMinor: FlowAmount, destination: FlowLocation, receivedMinor: FlowAmount,
  status: z.enum(['planned', 'completed']), notes: z.string().max(2000).default(''),
});
export const BrdStatementRowSchema = z.object({
  id: z.string().regex(/^(?:[a-f0-9]{64}:\d+|manual:[a-f0-9-]{36})$/), date: z.iso.date(),
  source: z.enum(['manual', 'csv']).default('csv'),
  notes: z.string().max(2000).default(''),
  beneficiary: z.string().max(500), details: z.string().max(1000),
  amountMinor: FlowAmount, currency: z.literal('RON'), direction: z.enum(['CRDT', 'DBIT']),
  reversal: z.boolean().default(false),
  category: z.enum(['income', 'expense', 'transfer', 'cash-withdrawal', 'refund']),
}).refine(row => row.id.startsWith('manual:') === (row.source === 'manual'), 'Transaction source must match its ID')
  .refine(row => !row.reversal || row.direction === 'DBIT', 'Only negative debit reversals are supported')
  .refine(row => row.category === 'transfer' || (row.reversal ? row.category === 'refund' : row.direction === 'CRDT' ? row.category === 'income' : ['expense', 'cash-withdrawal'].includes(row.category)), 'Classification must match the statement direction');
export const BrdLedgerSchema = z.object({
  accountId: z.string().min(1),
  rows: z.array(BrdStatementRowSchema).max(20000),
  ownRecipients: z.array(z.string().trim().min(1).max(500)).max(200).default([]),
  imports: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), fileName: z.string().max(255), importedAt: z.number().int().nonnegative(), added: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative() })).max(1000),
  balanceConfirmation: z.object({ date: z.iso.date(), amountMinor: z.number().int().min(0).max(1e12) }).nullable().default(null),
}).refine(ledger => new Set(ledger.rows.map(row => row.id)).size === ledger.rows.length, 'Duplicate BRD statement row')
  .refine(ledger => new Set(ledger.imports.map(row => row.id)).size === ledger.imports.length, 'Duplicate BRD import');
export const MoneyFlowSchema = z.object({
  brd: BrdLedgerSchema.optional(),
  incomes: z.array(IncomeRecordSchema).max(10000).default([]),
  transfers: z.array(AllocationRecordSchema).max(50000).default([]),
}).superRefine((flow, ctx) => {
  for (const rows of [flow.incomes, flow.transfers]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) ctx.addIssue({code: 'custom', message: 'Duplicate income or allocation ID'});
  }
  for (const transfer of flow.transfers) {
    const income = flow.incomes.find(row => row.id === transfer.incomeId);
    if (!income) { ctx.addIssue({code: 'custom', message: 'Allocation must reference an income receipt'}); continue; }
    if (transfer.destination.kind === income.receivedIn.kind && (transfer.destination.kind === 'account'
      ? transfer.destination.accountId === income.receivedIn.accountId
      : transfer.destination.label === income.receivedIn.label)) ctx.addIssue({code: 'custom', message: 'Choose a different destination'});
    if (transfer.date < income.date) ctx.addIssue({code: 'custom', message: 'Allocation cannot precede the income receipt'});
    if (transfer.destination.currency === income.currency && transfer.receivedMinor !== transfer.amountMinor) ctx.addIssue({code: 'custom', message: 'Same-currency amounts must match'});
  }
});

export const SubscriptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  amount: z.number().nonnegative().max(1e9).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Use at most two decimal places'),
  currency: z.enum(SUPPORTED_DISPLAY_CURRENCIES),
  cycle: z.enum(['monthly', 'quarterly', 'yearly', 'weekly']),
  nextRenewal: z.iso.date(),
  status: z.enum(['active', 'paused', 'cancelled']).default('active'),
  notes: z.string().max(2000).default(''),
  // Bundled icon key (e.g. "spotify") or a small uploaded image as a data URL.
  icon: z.string().max(60000).regex(/^(|[a-z0-9-]{1,40}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/, 'Invalid icon').default(''),
});

export const CarListingSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().max(2000).refine((value) => {
    if (value === '') return true;
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
  }, 'Use an http or https link').default(''),
  priceEur: z.number().nonnegative().max(1e7).default(0),
  year: z.number().int().min(1950).max(2100).nullable().default(null),
  mileageKm: z.number().int().nonnegative().max(2e6).nullable().default(null),
  status: z.enum(['considering', 'shortlisted', 'rejected']).default('considering'),
  notes: z.string().max(2000).default(''),
});

export const AppDataSchema = z.object({
  carListings: z.array(CarListingSchema).max(1000).default([]),
  subscriptions: z.array(SubscriptionSchema).max(10000).default([]),
  moneyFlow: MoneyFlowSchema.default({incomes: [], transfers: []}),
  transactions: z.array(TransactionSchema),
  customVendors: z.record(z.string(), z.tuple([z.string(), z.string()])),
  accounts: z.array(AccountSchema),
  creditRecords: z.array(CreditRecordSchema).optional().default([]),
  portfolioHoldings: z.array(PortfolioHoldingSchema).optional().default([]),
  budgets: z.record(z.string(), z.record(z.string(), z.number())).optional().default({}),
  goals: z.array(GoalSchema).optional().default([]),
  baseCurrency: z.string().optional().default(BASE_CURRENCY),
  displayCurrency: z.enum(SUPPORTED_DISPLAY_CURRENCIES).optional().default(BASE_CURRENCY),
  themeMode: z.enum(THEME_MODES).optional().default('dark'),
  fxRates: z.object({
    EUR: z.number().positive(),
    USD: z.number().positive(),
  }).optional().default(DEFAULT_FX_RATES),
  fxUpdatedAt: z.number().nullable().optional().default(null),
  fxSource: z.string().optional().default('manual-default'),
  importMeta: z.object({
    latestSummary: ImportSummaryRecordSchema.nullable().optional().default(null),
    history: z.array(ImportHistoryRecordSchema).optional().default([]),
  }).optional().default({ latestSummary: null, history: [] }),
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
  const baseCategory = String(transaction.baseCat || '').trim();
  const baseSubcategory = String(transaction.baseSub || '').trim();
  const manualCategory = String(transaction.manualCat || '').trim();
  const manualSubcategory = String(transaction.manualSub || '').trim();

  return {
    ...transaction,
    sub: subcategory && subcategory !== category ? subcategory : '',
    baseSub: baseSubcategory && baseSubcategory !== baseCategory ? baseSubcategory : '',
    manualSub: manualSubcategory && manualSubcategory !== manualCategory ? manualSubcategory : '',
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
    creditRecords: [],
    subscriptions: [],
    carListings: [],
    moneyFlow: {incomes: [], transfers: []},
    portfolioHoldings: [],
    budgets: {},
    goals: [],
    baseCurrency: BASE_CURRENCY,
    displayCurrency: BASE_CURRENCY,
    themeMode: 'dark',
    fxRates: DEFAULT_FX_RATES,
    fxUpdatedAt: null,
    fxSource: 'manual-default',
    importMeta: {
      latestSummary: null,
      history: [],
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
    if (Array.isArray(raw.subscriptions)) {
      fallback.subscriptions = raw.subscriptions.map(record => SubscriptionSchema.safeParse(record))
        .filter(result => result.success).map(result => result.data);
    }
    if (Array.isArray(raw.carListings)) {
      fallback.carListings = raw.carListings.map(record => CarListingSchema.safeParse(record))
        .filter(result => result.success).map(result => result.data);
    }
    const flow = MoneyFlowSchema.safeParse(raw.moneyFlow);
    if (flow.success) fallback.moneyFlow = flow.data;
    if (Array.isArray(raw.creditRecords)) {
      fallback.creditRecords = raw.creditRecords.map((record) => CreditRecordSchema.safeParse(record))
        .filter((result) => result.success).map((result) => result.data);
    }
    if (Array.isArray(raw.portfolioHoldings)) {
      fallback.portfolioHoldings = raw.portfolioHoldings
        .map((holding) => PortfolioHoldingSchema.safeParse(holding))
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
        history: Array.isArray(raw.importMeta.history)
          ? raw.importMeta.history
            .map((entry) => ImportHistoryRecordSchema.safeParse(entry))
            .filter((entry) => entry.success)
            .map((entry) => entry.data)
          : [],
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
