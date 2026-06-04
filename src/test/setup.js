import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };

  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      rates: {
        EUR: 5,
        USD: 4.6,
      },
    }),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
