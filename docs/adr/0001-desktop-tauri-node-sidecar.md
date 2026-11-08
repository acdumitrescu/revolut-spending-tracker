# 0001: Desktop app = Tauri shell + Node backend sidecar

- Status: Accepted
- Date: 2026-11-01

## Context

Today the personal build runs as a browser tab, either on the Vite dev launcher (`npm run local`) or in Docker (`scripts/personal-app.sh`). We want a native macOS app with a Dock icon and its own window that needs no terminal and no Docker.

The value of the codebase is in the React UI (about 24k lines) and the Express backend (about 2.9k lines: SQLCipher store, Keychain, local users, backups). Rewriting either one to get a native window isn't worth the cost.

Options considered: a launcher `.app`, Tauri with a Node sidecar, Tauri with the backend ported to Rust, Electron, Python pywebview, and a native rewrite.

## Decision

Use **Tauri v2** as the shell. It renders the existing React build in the macOS system webview (WKWebView). It starts the **existing Node backend as a sidecar process**, using a pinned Node binary bundled in the app.

## Consequences

- No UI or backend rewrite. The app is about 60 MB, against about 150 MB for Electron.
- The app ships a Node runtime and a native module (`@journeyapps/sqlcipher`). The bundled Node version must match the ABI the module was built for (see `docs/desktop/building.md`).
- The UI renders in WebKit, not Chromium, so it has to be tested there.
- The Rust shell is the first step towards a Rust backend. Porting the backend later is planned in `docs/desktop/rust-migration.md` and enabled by [0002](0002-http-api-is-the-backend-seam.md).
