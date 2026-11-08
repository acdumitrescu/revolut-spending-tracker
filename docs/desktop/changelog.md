# Desktop changelog

Newest first.

## 2026-11-07

- **Currency correction on the Transactions page.** Each row has a currency dropdown (RON/EUR/USD) and a "Restore X" button once changed. It relabels the currency and keeps the amount; it does not convert at an exchange rate, so Overview/Monthly/Categories totals follow the new label.
  - The imported currency is kept in `baseCurrency`, and `txKey` uses it, so a corrected row keeps its identity: re-importing the same CSV does not duplicate it and category overrides still match.
  - `baseCurrency` was added to the backend transaction schema (`backend/appStateSchema.js`); unknown keys are stripped there, so it would otherwise be silently lost on save.
  - Tests: reducer (set, change again, restore, missing original), key stability, backend schema retention.

## 2026-11-06

- **Fixed the three review findings** (uncommitted when written; see `git log`).
  - **Per-data-folder instance lock** (`src-tauri/src/instance_lock.rs`). The identifier-keyed single-instance plugin ignored `SSB_DESKTOP_DATA_DIR`, so a scratch launch could silently hand off to the real app. Scratch runs now skip that plugin, take a `flock` on `<data folder>/.app.lock` before the sidecar starts, and carry "(scratch data)" in the window title. Verified live on scratch folders only: two folders ran side by side on different ports, only the shell (not `node`) held each lock, a second copy on an in-use folder was refused with an alert and exit 1, and after `kill -9` of the shell a relaunch started cleanly. The final check that a real-app launch no longer hands off to a scratch window is covered by the absence of the `/tmp/..._si.sock` socket during scratch runs; launching the real app for it was deliberately avoided.
  - **Unlock throttle counts failures only** (`backend/localUsers.js`). Successes are neither counted nor clearing the count, because the limit is global. The "too many open sessions" `429` is no longer masked as a `401`. Two new tests fail on the old code and pass on the new.
  - **Startup-failure alert** (`src-tauri/src/alert.rs`). `tauri-plugin-dialog` never showed a window here, so refused or failed launches lingered as windowless processes. The alert now uses `/usr/bin/osascript` with the message passed as an argument; the plugin was removed. Verified live.
- Documentation updated to match: contract (throttle and session-cap `429`), architecture (two locks, new modules), checklist, scratch-run instructions, `AGENTS.md`.
- **Added the architecture and development docs**: [architecture.md](architecture.md), [development.md](development.md), a Desktop section in the root `README.md`, and desktop privacy rules in `AGENTS.md`.
- **Review pass** (bugs, vulnerabilities, errors) found two issues, plus a third while verifying the fix. All three are fixed (first entry above) and recorded under Resolved in [security-checklist.md](security-checklist.md).
- **Manual check in the built app** on a scratch workspace: login screen, creating a user, loading and parsing the bundled demo CSV, and saving 22 transactions through the encrypted API all worked. Excel/JSON export, the encrypted-backup list and restore, and a file-picker upload are **not yet verified** in the real window.
- Verified: `npm run check:all` passes (lint, 369 frontend tests, backend and contract tests, build, bundle budget, privacy scan, Rust fmt/clippy/tests). Backend production `npm audit`: 0 vulnerabilities.

## 2026-11-05

- **Backend hardening**: strict Content-Security-Policy and other security headers on every response, Host allowlist on every route (DNS rebinding), default bind to `127.0.0.1`, dependency advisories fixed, and security contract tests added.
- **Shell, build and entitlements hardening**: external links limited to https/mailto and rate limited, `window.open` never creates a webview, the process answering `/healthz` must be the sidecar child, `allow-unsigned-executable-memory` dropped, Node download checks (timeout, size cap, SHASUMS cross-check), minimal-environment `npm ci` with an audit gate, pinned Rust toolchain, `--locked` cargo checks.
- **Docs**: building, security checklist, Rust migration plan.
- **Contract test fix**: the malformed-JSON test now really sends malformed JSON.

## 2026-11-01 to 2026-11-05: foundation

- Tauri v2 shell (`src-tauri/`) that renders the existing React build and starts the existing Node backend as a loopback-only sidecar with a per-launch token, a cleared environment and graceful shutdown (SIGTERM, or stdin EOF if the shell dies).
- Backend additions: `SSB_STATIC_DIR` (serve the built UI), graceful shutdown, `SSB_EXIT_ON_STDIN_CLOSE`.
- Frontend: desktop token injection (`src/lib/desktopBridge.js`), `.env.desktop`, `build:desktop-web`.
- Build pipeline: `scripts/desktop/prepareSidecar.mjs` (pinned, checksum-verified Node 24.22.1; backend staged under that Node; SQLCipher load check; privacy guard) and `importDevData.mjs`.
- Black-box backend contract tests (`backend/contract/`) so a future backend, in any language, can be validated against the same suite.
- ADRs 0001 to 0004.
- App icons generated from `public/favicon.svg`.
