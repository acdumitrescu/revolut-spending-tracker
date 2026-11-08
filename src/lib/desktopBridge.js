// Desktop app (docs/adr/0003): the shell injects a per-launch token into the page
// before any script runs. It is never persisted. Empty in browsers and Docker.
export function getDesktopSyncToken() {
  try {
    const token = typeof window === 'undefined' ? undefined : window.__SSB_DESKTOP__?.syncToken;
    return typeof token === 'string' ? token.trim() : '';
  } catch {
    return '';
  }
}

/** `Authorization` header for the desktop backend, or nothing outside the desktop app. */
export function desktopAuthorizationHeader() {
  const token = getDesktopSyncToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
