import { z } from 'zod';
import { validateState } from './validateState.js';
const fields = [
  'subscriptions',
  'carListings',
  'moneyFlow',
  'transactions',
  'accounts',
  'creditRecords',
  'portfolioHoldings',
  'budgets',
  'goals',
  'customVendors',
  'baseCurrency',
  'displayCurrency',
  'themeMode',
  'fxRates',
  'fxUpdatedAt',
  'fxSource',
  'importMeta',
  'syncInfo',
  'lastUpdated',
];
const schema = z
  .object({
    version: z.number().int().nonnegative(),
    changes: z
      .array(z.object({ field: z.enum(fields), value: z.unknown() }).strict())
      .max(fields.length),
  })
  .strict();

export function applyWorkspaceChanges(current, request) {
  const parsed = schema.safeParse(request);
  if (
    !parsed.success ||
    new Set(parsed.data.changes.map((x) => x.field)).size !== parsed.data.changes.length
  )
    throw Object.assign(new Error('Invalid workspace changes'), { status: 400 });
  if (parsed.data.version !== current.version)
    throw Object.assign(new Error('Version conflict'), { status: 409, body: current });
  if (!current.data) throw new Error('Encrypted workspace has not been initialized');
  const next = structuredClone(current.data);
  for (const change of parsed.data.changes) next.data[change.field] = change.value;
  return validateState(next);
}
