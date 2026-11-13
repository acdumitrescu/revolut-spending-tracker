import { fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../lib/AppContext';
import { appReducer, createPersistedAppState } from '../lib/appState';
import { parseImportedAppState, serializeBackupState } from '../lib/persistence';
import { SubscriptionSchema } from '../lib/validation';
import { shouldLoadRemoteAtBootstrap } from '../lib/serverSync';
import { subscriptionSummary, renewalStatus } from '../lib/subscriptions';
import { applyWorkspaceChanges } from '../../backend/workspaceChanges';
import Subscriptions from '../pages/Subscriptions';

const plan = (overrides = {}) => ({
  id: 's1',
  name: 'Synthetic plan',
  amount: 12.99,
  currency: 'RON',
  cycle: 'monthly',
  nextRenewal: '2026-10-07',
  status: 'active',
  notes: '',
  ...overrides,
});

describe('subscriptions data', () => {
  it('normalizes currencies and cycles and excludes inactive plans', () => {
    const summary = subscriptionSummary(
      [
        plan({ amount: 10, currency: 'EUR' }),
        plan({ id: 's2', amount: 120, cycle: 'yearly' }),
        plan({ id: 's3', amount: 30, cycle: 'quarterly' }),
        plan({ id: 's4', amount: 3, cycle: 'weekly' }),
        plan({ id: 's5', amount: 999, status: 'paused' }),
        plan({ id: 's6', amount: 999, status: 'cancelled' }),
      ],
      'RON',
      { EUR: 5, USD: 4 },
      '2026-10-07',
    );
    expect(summary).toMatchObject({
      active: 4,
      monthly: 83,
      yearly: 996,
      nextRenewals: 203,
      upcoming: 4,
    });
  });
  it('keeps overdue dates out of the forward 30-day window at month/year boundaries', () => {
    const summary = subscriptionSummary(
      [
        plan({ nextRenewal: '2026-12-19' }),
        plan({ id: '2', nextRenewal: '2026-12-20' }),
        plan({ id: '3', nextRenewal: '2027-01-18' }),
        plan({ id: '4', nextRenewal: '2027-01-19' }),
      ],
      'RON',
      {},
      '2026-12-20',
    );
    expect(summary).toMatchObject({ needsReview: 1, upcoming: 2 });
    expect(summary.nextRenewals).toBeCloseTo(25.98);
    expect(renewalStatus(plan(), '2026-10-08')).toBe('Review renewal date');
    expect(renewalStatus(plan(), '2026-10-07')).toBe('Due today');
  });
  it('validates dates and prices without silently rounding or accepting blank names', () => {
    for (const overrides of [
      { amount: -1 },
      { amount: 0.001 },
      { amount: Infinity },
      { name: '  ' },
      { nextRenewal: '2026-02-30' },
      { currency: 'XXX' },
    ]) {
      expect(SubscriptionSchema.safeParse(plan(overrides)).success).toBe(false);
    }
    expect(SubscriptionSchema.safeParse(plan({ amount: 0.29 })).success).toBe(true);
  });
  it('edits by ID and retains subscriptions through backup export/import and server changes', () => {
    let state = createPersistedAppState();
    state = appReducer(state, { type: 'upsert_subscription', subscription: plan() });
    state = appReducer(state, {
      type: 'upsert_subscription',
      subscription: plan({ amount: 29.99, status: 'paused' }),
    });
    expect(state.data.subscriptions).toHaveLength(1);
    expect(parseImportedAppState(serializeBackupState(state)).data.subscriptions).toEqual(
      state.data.subscriptions,
    );
    const updated = applyWorkspaceChanges(
      { version: 1, data: createPersistedAppState() },
      { version: 1, changes: [{ field: 'subscriptions', value: state.data.subscriptions }] },
    );
    expect(updated.data.subscriptions).toEqual(state.data.subscriptions);
    expect(shouldLoadRemoteAtBootstrap(updated, createPersistedAppState())).toBe(true);
    expect(shouldLoadRemoteAtBootstrap(createPersistedAppState(), updated)).toBe(false);
    const legacy = createPersistedAppState();
    delete legacy.data.subscriptions;
    expect(parseImportedAppState(JSON.stringify(legacy)).data.subscriptions).toEqual([]);
  });
});

describe('subscriptions page', () => {
  it('adds, edits, pauses, filters and reloads a plan with its exact price', async () => {
    const values = new Map();
    vi.mocked(localStorage.getItem).mockImplementation((key) => values.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => values.set(key, value));
    let view = render(
      <AppProvider>
        <Subscriptions />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
    fireEvent.change(screen.getByLabelText('Subscription name'), {
      target: { value: 'Synthetic music' },
    });
    fireEvent.change(screen.getByLabelText('Price per billing cycle'), {
      target: { value: '29.99' },
    });
    fireEvent.change(screen.getByLabelText('Next renewal'), { target: { value: '2027-01-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save subscription' }));
    expect(screen.getByRole('article', { name: 'Synthetic music' })).toHaveTextContent('29,99');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Synthetic music' }));
    expect(screen.getByLabelText('Price per billing cycle')).toHaveValue(29.99);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paused' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save subscription' }));
    expect(screen.getByText('0 active subscriptions')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Show status'), { target: { value: 'active' } });
    expect(screen.getByText('No subscriptions match these filters.')).toBeInTheDocument();
    await waitFor(() =>
      expect([...values.values()].some((value) => value.includes('Synthetic music'))).toBe(true),
    );
    view.unmount();
    view = render(
      <AppProvider>
        <Subscriptions />
      </AppProvider>,
    );
    expect(
      within(screen.getByRole('article', { name: 'Synthetic music' })).getByText('Paused'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'unknown' } });
    expect(screen.getByText('No subscriptions match these filters.')).toBeInTheDocument();
    view.unmount();
  });
  it('cancels a draft without changing the register', () => {
    render(
      <AppProvider>
        <Subscriptions />
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add subscription' }));
    fireEvent.change(screen.getByLabelText('Subscription name'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'No subscriptions yet' })).toBeInTheDocument();
  });
});
