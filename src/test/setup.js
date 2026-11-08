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
  const sessionValues = new Map();
  const sessionStorage = {
    getItem: vi.fn((key) => sessionValues.get(key) ?? null),
    setItem: vi.fn((key, value) => sessionValues.set(key, String(value))),
    removeItem: vi.fn((key) => sessionValues.delete(key)),
    clear: vi.fn(() => sessionValues.clear()),
  };
  vi.stubGlobal('sessionStorage', sessionStorage);
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => null),
      writable: true,
      configurable: true,
    });
  }

  if (typeof window !== 'undefined') {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        rates: {
          EUR: 5,
          USD: 4.6,
        },
      }),
    }));
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});
