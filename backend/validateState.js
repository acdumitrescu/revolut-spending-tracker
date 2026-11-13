import { PersistedAppStateSchema } from './appStateSchema.js';

export function validateState(value) {
  const parsed = PersistedAppStateSchema.safeParse(value);
  if (!parsed.success)
    throw Object.assign(new Error('Invalid versioned app state'), { status: 400 });
  // Never silently discard unknown imported fields or accept prototype keys.
  function inspect(raw, clean) {
    if (!raw || typeof raw !== 'object') return;
    for (const key of Object.keys(raw)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key) || !Object.hasOwn(clean, key)) {
        throw Object.assign(new Error('Unsupported field in app state'), { status: 400 });
      }
      inspect(raw[key], clean[key]);
    }
  }
  inspect(value, parsed.data);
  return parsed.data;
}
