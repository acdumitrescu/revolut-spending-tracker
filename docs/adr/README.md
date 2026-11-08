# Architecture decision records

Short records of decisions that shape the codebase. Each one states the context, the decision and its consequences. A superseded record stays in place, marked as superseded, with a link to the record that replaces it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-desktop-tauri-node-sidecar.md) | Desktop app = Tauri shell + Node backend sidecar | Accepted |
| [0002](0002-http-api-is-the-backend-seam.md) | The HTTP API is the only seam between UI and backend | Accepted |
| [0003](0003-desktop-auth-token-injection.md) | Desktop auth: per-launch token injected into the webview | Accepted |
| [0004](0004-desktop-data-location.md) | Desktop data lives in Application Support, copied once from dev-sync | Accepted |

Template for new records: copy any file, keep the headings (Context / Decision / Consequences), and add a row above.
