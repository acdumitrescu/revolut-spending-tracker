# 0003: Desktop auth: per-launch token injected into the webview

- Status: Accepted
- Date: 2026-11-01

## Context

The backend requires `Authorization: Bearer <SSB_SYNC_TOKEN>` on every `/api` call, so that other local processes and web pages can't read the workspace. In dev, the Vite proxy adds the header. In Docker, the user enters the token in the UI. The desktop app needs a way that has no proxy and no manual entry.

## Decision

1. On each launch the Tauri shell generates a fresh random token (32 bytes, hex encoded).
2. It passes the token to the backend through the **environment**, never through argv, which `ps` shows.
3. It passes the token to the page through a Tauri **initialization script**, which sets `window.__SSB_DESKTOP__ = { syncToken }` before any page script runs.
4. `src/lib/serverSync.js` prefers that value over `sessionStorage`.
5. The backend listens on `127.0.0.1` on a random free port. The window may only navigate within that origin. Other URLs open in the default browser.

## Consequences

- The token is never written to disk and changes on every launch.
- Another local process can find the port but still gets `401` without the token.
- Local-user passwords and session handling (`x-ssb-session`) work as they do in the other hosts.
- No Tauri IPC permissions are granted to the page (see [0002](0002-http-api-is-the-backend-seam.md)).
