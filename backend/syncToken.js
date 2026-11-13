const UNSAFE_SYNC_TOKENS = new Set(['replace-with-a-long-random-token']);

export function isSafeSyncToken(token) {
  const normalizedToken = String(token || '').trim();
  return normalizedToken.length >= 32 && !UNSAFE_SYNC_TOKENS.has(normalizedToken);
}
