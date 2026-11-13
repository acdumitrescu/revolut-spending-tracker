// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { applyWorkspaceChanges } from './workspaceChanges.js';
import { PersistedAppStateSchema } from './appStateSchema.js';

const state = PersistedAppStateSchema.parse({
  schemaVersion: 1,
  data: { transactions: [], accounts: [], customVendors: {}, lastUpdated: 1 },
});
const current = { version: 3, data: state };
const status = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.status ?? 'thrown';
  }
};

describe('applyWorkspaceChanges', () => {
  it('applies whitelisted field changes to a copy and validates the result', () => {
    const next = applyWorkspaceChanges(current, {
      version: 3,
      changes: [
        { field: 'displayCurrency', value: 'EUR' },
        { field: 'lastUpdated', value: 2 },
      ],
    });
    expect(next.data.displayCurrency).toBe('EUR');
    expect(next.data.lastUpdated).toBe(2);
    expect(current.data.data.displayCurrency).not.toBe('EUR'); // input untouched
  });

  it('refuses unknown fields, extra keys and duplicate fields with 400', () => {
    expect(
      status(() =>
        applyWorkspaceChanges(current, { version: 3, changes: [{ field: 'evil', value: 1 }] }),
      ),
    ).toBe(400);
    expect(
      status(() => applyWorkspaceChanges(current, { version: 3, changes: [], extra: true })),
    ).toBe(400);
    expect(
      status(() =>
        applyWorkspaceChanges(current, {
          version: 3,
          changes: [
            { field: 'themeMode', value: 'dark' },
            { field: 'themeMode', value: 'light' },
          ],
        }),
      ),
    ).toBe(400);
  });

  it('reports a version conflict with 409 and the current state', () => {
    try {
      applyWorkspaceChanges(current, { version: 2, changes: [] });
      throw new Error('expected a conflict');
    } catch (error) {
      expect(error.status).toBe(409);
      expect(error.body).toBe(current);
    }
  });

  it('refuses to change an uninitialized workspace', () => {
    expect(
      status(() => applyWorkspaceChanges({ version: 0, data: null }, { version: 0, changes: [] })),
    ).toBe('thrown');
  });

  it('rejects a change that makes the state invalid', () => {
    expect(
      status(() =>
        applyWorkspaceChanges(current, {
          version: 3,
          changes: [{ field: 'transactions', value: 'nope' }],
        }),
      ),
    ).not.toBeNull();
  });
});
