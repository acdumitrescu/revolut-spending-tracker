# 0002: The HTTP API is the only seam between UI and backend

- Status: Accepted
- Date: 2026-11-01

## Context

The same React UI runs in three hosts: the browser dev server, Docker/nginx and the desktop app. We also expect to replace the Node backend with Rust later. Tauri offers a direct UI-to-Rust bridge (`invoke`), but anything built on it only works inside the desktop app.

## Decision

- The UI talks to the backend **only through HTTP `fetch` to `/api/*`**, on the same origin.
- The backend is configured **only through environment variables** and reports readiness through `GET /healthz`.
- Together these are the **backend contract**, documented in `docs/desktop/backend-contract.md`. Black-box tests in `backend/contract/` check it over real HTTP against a spawned process.
- Tauri IPC is not used for application logic. If it's ever used, it's only for desktop-only extras (menus, file drop), and only behind a feature check, so the browser and Docker builds keep working.

## Consequences

- One frontend serves all three hosts.
- A Rust backend is a drop-in replacement once it passes `npm run test:contract`. The shell only changes which program it starts (`BackendSpec` in `src-tauri/src/backend.rs`).
- Any change to the API or env must update the contract doc and the contract tests in the same change.
