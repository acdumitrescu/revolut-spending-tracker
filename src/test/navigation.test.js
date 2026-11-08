import { describe, expect, it } from 'vitest';
import { APP_HUBS, LEGACY_APP_ROUTES, getActiveHub } from '../app/navigation';

describe('application navigation model', () => {
  it('exposes five task-based hubs', () => {
    expect(APP_HUBS.map((hub) => hub.label)).toEqual([
      'Overview',
      'Activity',
      'Planning',
      'Insights',
      'Accounts',
    ]);
  });

  it('resolves nested routes to their parent hub', () => {
    expect(getActiveHub('/app/activity/monthly')?.id).toBe('activity');
    expect(getActiveHub('/app/planning/forecast')?.id).toBe('planning');
    expect(getActiveHub('/app/insights/vendors')?.id).toBe('insights');
    expect(getActiveHub('/app/accounts/portfolio')?.id).toBe('accounts');
    expect(getActiveHub('/app')?.id).toBe('overview');
  });

  it('keeps a deterministic destination for every legacy screen', () => {
    expect(LEGACY_APP_ROUTES).toMatchObject({
      monthly: '/app/activity/monthly',
      transactions: '/app/activity/transactions',
      budget: '/app/planning/budget',
      vendors: '/app/insights/vendors',
      mappings: '/app/insights/vendors#mappings',
      accounts: '/app/accounts/balances',
    });
  });

  it('keeps every development feature directly discoverable', () => {
    const childLabels = APP_HUBS.flatMap((hub) => hub.children || []).map((child) => child.label);
    expect(childLabels).toEqual(expect.arrayContaining([
      'Transactions', 'Monthly', 'Subscriptions', 'Budget', 'Goals', 'Forecast',
      'Rent calculator', 'Car lease',
      'Categories', 'Vendors', 'Mappings', 'Heatmap', 'Balances', 'Credit', 'Portfolio',
    ]));
  });
});
