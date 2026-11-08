# Desktop app (macOS)

A native window for SimpleSafeBanking. A small Tauri shell opens the existing React UI in the system webview and runs the existing Node backend as a hidden, loopback-only sidecar process. No Docker, no nginx, no terminal.

## Read in this order

| Doc | What it answers |
|---|---|
| [ADR index](../adr/README.md) | Why it's built this way (Tauri + Node sidecar, HTTP seam, token injection, data location). |
| [architecture.md](architecture.md) | How the shell, sidecar and UI fit together: startup, request path, shutdown, files. |
| [development.md](development.md) | Day-to-day workflow: which command for what, test layers, debugging. |
| [building.md](building.md) | How to build, run, import your dev data, and update the bundled Node. |
| [security-checklist.md](security-checklist.md) | What's protected, how it's proven, and what is knowingly not covered. |
| [backend-contract.md](backend-contract.md) | The exact HTTP/process contract between the shell, the UI and the backend. |
| [changelog.md](changelog.md) | What changed and when, newest first. |
| [rust-migration.md](rust-migration.md) | How the Node backend could later be replaced by a Rust one. |

## Moving parts

```
SimpleSafeBanking.app
├─ Contents/MacOS/simplesafebanking-desktop   Rust shell (src-tauri/src)
├─ Contents/MacOS/node                        pinned Node runtime (the sidecar)
└─ Contents/Resources/
   ├─ backend/                                backend sources + production node_modules
   └─ dist/                                   the built UI, served by the backend
```

Launch sequence: the shell creates the data folders (mode `0700`), picks a random loopback port and a random 32-byte token, starts `node backend/server.js` with a cleared environment, waits until `/healthz` answers **from that child process**, then opens the window on `http://127.0.0.1:<port>/app` with the token injected. Quitting stops the backend gracefully; if the shell dies, the backend notices (stdin closes) and exits.

## Where things live

| What | Where |
|---|---|
| Encrypted workspaces | `~/Library/Application Support/SimpleSafeBanking/users/` |
| Backend log (no secrets) | `~/Library/Logs/SimpleSafeBanking/backend.log` |
| Built app | `src-tauri/target/release/bundle/macos/SimpleSafeBanking.app` (git-ignored) |
