import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { appReducer, createInitialAppData, createPersistedAppState } from '../lib/appState';
import { buildCardPurchase, getCardPurchaseSummary, getCreditOverview } from '../lib/credit';
import { CardPurchaseSchema } from '../lib/validation';
import { parseImportedAppState, serializeBackupState } from '../lib/persistence';
import CardPurchases from '../components/CardPurchases';

afterEach(cleanup);
const draft = {
  id: 'item',
  name: 'Laptop',
  initialCost: '1200',
  totalCost: '',
  totalMonths: '12',
  remainingBalance: '',
  remainingMonths: '',
  priceMode: 'total',
};
const purchase = buildCardPurchase(draft);
const initial = () =>
  createPersistedAppState({
    ...createInitialAppData(),
    accounts: [
      { id: 'ing', name: 'ING CREDIT CARD', currency: 'RON', balances: { '2026-09': -1200 } },
    ],
  });
const add = (state, item = purchase) =>
  appReducer(state, { type: 'upsert_card_purchase', accountId: 'ing', purchase: item });

describe('card purchase tracking', () => {
  it('deletes only the selected purchase, including archived purchases, without changing accounts', () => {
    const state = add(add(initial()), { ...purchase, id: 'other' });
    const next = appReducer(state, {
      type: 'delete_card_purchase',
      accountId: 'ing',
      purchaseId: 'item',
    });
    expect(next.data.creditRecords[0].purchases.map((item) => item.id)).toEqual(['other']);
    expect(next.data.accounts).toEqual(state.data.accounts);
    const completed = add(next, {
      ...purchase,
      id: 'other',
      remainingBalance: 0,
      remainingMonths: 0,
    });
    const archived = appReducer(completed, {
      type: 'archive_card_purchase',
      accountId: 'ing',
      purchaseId: 'other',
    });
    expect(
      appReducer(archived, { type: 'delete_card_purchase', accountId: 'ing', purchaseId: 'other' })
        .data.creditRecords[0].purchases,
    ).toEqual([]);
  });
  it('requires explicit confirmation and allows cancelling deletion', () => {
    const onDelete = vi.fn();
    render(
      <CardPurchases
        card={{
          accountId: 'ing',
          name: 'ING',
          currency: 'RON',
          remainingBalance: 1200,
          purchases: [purchase],
        }}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete Laptop' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep purchase' }));
    expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Laptop' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(onDelete).toHaveBeenCalledWith('ing', 'item');
  });
  it('derives totals and preserves explicit zero remaining amounts', () => {
    expect(purchase).toMatchObject({
      totalCost: 1200,
      instalmentAmount: 100,
      remainingMonths: 12,
      remainingBalance: 1200,
    });
    expect(
      buildCardPurchase({
        ...draft,
        priceMode: 'instalment',
        instalmentAmount: '110',
        remainingBalance: '0',
        remainingMonths: '0',
      }),
    ).toMatchObject({ totalCost: 1320, remainingBalance: 0, remainingMonths: 0 });
  });
  it('round-trips non-divisible totals without losing cents', () => {
    const item = buildCardPurchase({
      ...draft,
      totalCost: '100',
      initialCost: '100',
      totalMonths: '3',
    });
    expect(item.instalmentAmount).toBe(33.33);
    expect(buildCardPurchase(item)).toEqual(item);
  });
  it.each([
    { remainingMonths: 13 },
    { remainingBalance: 1201 },
    { totalMonths: 0 },
    { remainingBalance: -1 },
    { status: 'archived', archivedAt: 1 },
  ])('rejects invalid purchase %j', (fields) => {
    expect(CardPurchaseSchema.safeParse({ ...purchase, ...fields }).success).toBe(false);
  });
  it('adds purchases without changing account debt or transactions', () => {
    const state = initial();
    const next = add(state);
    expect(next.data.accounts).toEqual(state.data.accounts);
    expect(next.data.transactions).toEqual(state.data.transactions);
    expect(getCreditOverview(next.data).outstanding).toBe(1200);
    expect(getCreditOverview(next.data).monthlyPayments).toBe(0);
  });
  it('requires completion, archives with history, restores and reopens', () => {
    const state = add(initial());
    const archive = { type: 'archive_card_purchase', accountId: 'ing', purchaseId: 'item' };
    expect(appReducer(state, archive)).toBe(state);
    const completed = add(state, { ...purchase, remainingBalance: 0, remainingMonths: 0 });
    const archived = appReducer(completed, archive);
    const items = archived.data.creditRecords[0].purchases;
    expect(items[0]).toMatchObject({ status: 'archived', archivedAt: expect.any(Number) });
    expect(getCardPurchaseSummary(items)).toMatchObject({ active: [], remaining: 0, monthly: 0 });
    expect(parseImportedAppState(serializeBackupState(archived)).data).toEqual(archived.data);
    expect(add(archived)).toBe(archived);
    expect(
      appReducer(archived, { ...archive, type: 'reopen_card_purchase' }).data.creditRecords[0]
        .purchases[0].status,
    ).toBe('active');
  });
  it('protects history from stale metadata edits, unlinking and currency changes', () => {
    const state = add(initial());
    const card = state.data.creditRecords[0];
    const edited = appReducer(state, {
      type: 'upsert_credit_record',
      record: { ...card, purchases: [], monthlyPayment: 100 },
    });
    expect(edited.data.creditRecords[0].purchases).toEqual(card.purchases);
    expect(appReducer(state, { type: 'remove_credit_record', id: card.id })).toBe(state);
    expect(
      appReducer(state, { type: 'update_account_currency', accountId: 'ing', currency: 'EUR' }),
    ).toBe(state);
  });
  it('offers an editor and disables archive until completion', () => {
    const onSave = vi.fn();
    render(
      <CardPurchases
        card={{
          accountId: 'ing',
          name: 'ING',
          currency: 'RON',
          remainingBalance: 1200,
          purchases: [purchase],
        }}
        onSave={onSave}
        onArchive={vi.fn()}
        onReopen={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Archive Laptop' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Laptop' }));
    fireEvent.change(screen.getByLabelText('Amount still owed'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Instalments remaining'), { target: { value: '0' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Purchase editor' }));
    expect(onSave).toHaveBeenCalledWith(
      'ing',
      expect.objectContaining({ remainingBalance: 0, remainingMonths: 0 }),
    );
  });
});
