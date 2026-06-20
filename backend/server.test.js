// @vitest-environment node
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_STATE_FILE,
  DEFAULT_VENDOR_OBSERVATIONS_FILE,
  resolveAppStateFile,
  resolveVendorObservationsFile,
} from './storagePath.js';

describe('private sync storage path', () => {
  it('defaults to a repo-local ignored path for local server runs', () => {
    expect(DEFAULT_APP_STATE_FILE).toBe(path.resolve(
      process.cwd(),
      'private-data',
      'private-sync',
      'app-state.json'
    ));
    expect(resolveAppStateFile()).toBe(DEFAULT_APP_STATE_FILE);
  });

  it('preserves explicit APP_STATE_FILE overrides', () => {
    expect(resolveAppStateFile('/data/app-state.json')).toBe('/data/app-state.json');
  });

  it('defaults vendor observations to a repo-local ignored path', () => {
    expect(DEFAULT_VENDOR_OBSERVATIONS_FILE).toBe(path.resolve(
      process.cwd(),
      'private-data',
      'private-sync',
      'vendor-observations.json'
    ));
    expect(resolveVendorObservationsFile()).toBe(DEFAULT_VENDOR_OBSERVATIONS_FILE);
  });
});
