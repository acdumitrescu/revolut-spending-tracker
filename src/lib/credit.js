import { BASE_CURRENCY, convertAmountToDisplay } from './fx';
import { getAccountCurrency } from './selectors';
import { CardPurchaseSchema } from './validation';

const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildCardPurchase(draft) {
  const totalMonths = Number(draft.totalMonths);
  const initialCost = Number(draft.initialCost);
  const totalCost =
    draft.priceMode === 'instalment'
      ? roundMoney(Number(draft.instalmentAmount) * totalMonths)
      : Number(draft.totalCost === '' ? initialCost : draft.totalCost);
  const instalmentAmount =
    draft.priceMode === 'instalment'
      ? Number(draft.instalmentAmount)
      : roundMoney(totalCost / totalMonths);
  return CardPurchaseSchema.parse({
    id: draft.id,
    name: draft.name,
    priceMode: draft.priceMode || 'total',
    initialCost,
    totalCost,
    instalmentAmount,
    totalMonths,
    remainingBalance: draft.remainingBalance === '' ? totalCost : Number(draft.remainingBalance),
    remainingMonths: draft.remainingMonths === '' ? totalMonths : Number(draft.remainingMonths),
    notes: draft.notes || '',
    status: 'active',
    archivedAt: null,
  });
}

export function getCardPurchaseSummary(purchases = []) {
  const active = purchases.filter((item) => item.status !== 'archived');
  return {
    active,
    archived: purchases.filter((item) => item.status === 'archived'),
    remaining: roundMoney(active.reduce((total, item) => total + item.remainingBalance, 0)),
    monthly: roundMoney(
      active.reduce(
        (total, item) =>
          total +
          (item.remainingMonths > 0 ? Math.min(item.instalmentAmount, item.remainingBalance) : 0),
        0,
      ),
    ),
  };
}

// Only explicitly named ING credit accounts are auto-linked. Never guess from
// an ING debit/current account or from a negative balance alone.
export function isIngCreditAccount(account) {
  return /\bing\b/i.test(account.name) && /\bcredit\b/i.test(account.name);
}

export function getCreditOverview(data) {
  const records = data.creditRecords || [];
  const linked = new Map(
    records.filter((record) => record.kind === 'card').map((record) => [record.accountId, record]),
  );
  data.accounts.filter(isIngCreditAccount).forEach((account) => {
    if (!linked.has(account.id))
      linked.set(account.id, {
        id: `card:${account.id}`,
        kind: 'card',
        accountId: account.id,
        monthlyPayment: null,
        dueDate: '',
        notes: '',
      });
  });
  const cards = [...linked.values()].map((record) => {
    const account = data.accounts.find((item) => item.id === record.accountId);
    const latestMonth = Object.keys(account?.balances || {})
      .sort()
      .at(-1);
    const balance = latestMonth ? account.balances[latestMonth] : null;
    return {
      ...record,
      purchases: record.purchases || [],
      name: account?.name || 'Missing linked account',
      currency: account ? getAccountCurrency(account) : null,
      latestMonth,
      balance,
      remainingBalance: balance === null ? null : Math.max(0, -balance),
      missingAccount: !account,
    };
  });
  const vendors = records.filter((record) => record.kind === 'vendor');
  const plans = records.filter((record) => record.kind === 'planned');
  const actual = [...cards, ...vendors];
  const convert = (value, currency) =>
    convertAmountToDisplay(value, currency, data.displayCurrency || BASE_CURRENCY, data.fxRates);
  return {
    cards,
    vendors,
    plans,
    outstanding: actual.reduce(
      (total, item) =>
        total +
        (item.remainingBalance === null ? 0 : convert(item.remainingBalance, item.currency)),
      0,
    ),
    monthlyPayments: actual.reduce(
      (total, item) =>
        total +
        (item.monthlyPayment === null || !item.currency
          ? 0
          : convert(item.monthlyPayment, item.currency)),
      0,
    ),
    missingBalances: cards.filter((item) => item.remainingBalance === null).length,
    missingPayments: actual.filter((item) => item.monthlyPayment === null || !item.currency).length,
  };
}

export function creditDateStatus(date, today) {
  if (!date) return 'Date not set';
  if (date < today) return 'Past date — review';
  if (date === today) return 'Due today';
  return 'Upcoming';
}
