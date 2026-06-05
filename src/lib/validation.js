import { z } from 'zod';
import { BASE_CURRENCY, DEFAULT_FX_RATES, SUPPORTED_DISPLAY_CURRENCIES } from './fx';

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
  }),
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
  fxRates: z.object({
    EUR: z.number().positive(),
    USD: z.number().positive(),
  }).optional().default(DEFAULT_FX_RATES),
  fxUpdatedAt: z.number().nullable().optional().default(null),
  fxSource: z.string().optional().default('manual-default'),
  lastUpdated: z.number().nullable(),
});

export function validateAppData(data) {
  const result = AppDataSchema.safeParse(data);
  if (!result.success) {
    console.error('AppData validation failed:', result.error.format());
    return false;
  }
  return true;
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
    fxRates: DEFAULT_FX_RATES,
    fxUpdatedAt: null,
    fxSource: 'manual-default',
    lastUpdated: null,
  };

  const result = AppDataSchema.safeParse(raw);
  if (result.success) return result.data;

  if (raw && typeof raw === 'object') {
    const t = Array.isArray(raw.transactions) ? raw.transactions : [];
    fallback.transactions = t.filter((txn) => {
      const r = TransactionSchema.safeParse(txn);
      return r.success;
    });
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
    fallback.lastUpdated = typeof raw.lastUpdated === 'number' ? raw.lastUpdated : null;
  }

  return fallback;
}
