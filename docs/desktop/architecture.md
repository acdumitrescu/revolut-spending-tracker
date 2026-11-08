# Desktop architecture

How the pieces fit and why. The decisions behind it are in the [ADRs](../adr/README.md); the exact HTTP/process interface is in [backend-contract.md](backend-contract.md).

## Components

| Component | Code | Job |
|---|---|---|
| Shell | `src-tauri/src/` (Rust, Tauri v2) | Owns the app lifecycle: data folders, the per-folder instance lock, sidecar start/stop, the window, the startup-failure alert. Contains no finance logic. |
| Sidecar | `backend/server.js` run by the pinned `node` in the bundle | The same Express backend used in dev and Docker: auth, local users, SQLCipher storage, backups. In the desktop it also serves the built UI. |
| UI | `src/` (React), built with `vite build --mode desktop` | Talks to the backend only through `fetch('/api/...')` on its own origin ([ADR 0002](../adr/0002-http-api-is-the-backend-seam.md)). |

Shell modules:

| File | Responsibility |
|---|---|
| `lib.rs` | Builder, plugins, `setup`, exit hook, startup-failure dialog. Debug builds load the Vite dev server instead of the sidecar. |
| `paths.rs` | Resolves and creates the data and log folders (mode `0700`, refuses symlinks). `SSB_DESKTOP_DATA_DIR` overrides the root for scratch runs, which also get the window title "(scratch data)". |
| `instance_lock.rs` | `flock` on `<data folder>/.app.lock`: one app per data folder. The kernel releases it on any exit, including `kill -9`. Not inherited by the sidecar. |
| `alert.rs` | Startup-failure alert through `/usr/bin/osascript` (message passed as an argument, never spliced into the script). |
| `backend.rs` | `BackendSpec` (program, args, env), `LaunchConfig` (port and token), `Backend` (start, health, stop). The only place that knows the sidecar is Node. |
| `window.rs` | Builds the window, injects the token, pins navigation to the app origin, rate-limits opening links in the browser. |

## Startup

```
user opens the app
 └─ shell: real workspace only: identifier-keyed hand-off (a second launch just focuses the first)
     ├─ create data/log folders (0700)
     ├─ take the per-data-folder lock (refuse to start if another instance holds it)
     ├─ pick a free loopback port; generate a 32-byte hex token
     ├─ spawn node backend/server.js
     │     cleared environment + an explicit allowlist (backend.rs contract_env)
     │     stdin piped and held open; stdout/stderr -> backend.log
     ├─ poll /healthz until 200, and require that OUR child owns the listener
     │     (closes the window in which another process could grab the port)
     └─ open the window on http://127.0.0.1:<port>/app
           window.__SSB_DESKTOP__ = { syncToken } injected before any page script
```

If any step fails, the shell stops the sidecar, shows an alert with the reason and the log path, and exits with code 1.

Two locks, two jobs: the Tauri single-instance plugin is keyed by the app identifier and only *focuses the existing window*, so it is registered only for the real workspace. A scratch run (`SSB_DESKTOP_DATA_DIR`) skips it, because it would otherwise hand a scratch launch to a running real app. The per-folder lock is the actual safety rule: two processes must never open the same encrypted databases. Runs on different folders coexist.

## Request path

```
React UI ──fetch /api/...──▶ Node backend (127.0.0.1:<port>)
          Authorization: Bearer <token>      checks, in order: token, Host, Origin,
          X-SSB-Session: <user session>      Sec-Fetch-Site, then the user session
```

- The **token** proves the caller is this app's window, not another local process. It is per launch, in memory only ([ADR 0003](../adr/0003-desktop-auth-token-injection.md)).
- The **session** (from unlocking a user with a password) selects which encrypted database a request may touch. The token never does.

## Shutdown

| Trigger | What happens |
|---|---|
| Quit from the app | Shell sends `SIGTERM`; the backend stops accepting, finishes in-flight requests, closes every store, zeroes keys and exits `0`. After 5 s the shell sends `SIGKILL`. |
| Shell crashes or is `kill -9`ed | The held-open stdin pipe closes; the backend sees EOF (`SSB_EXIT_ON_STDIN_CLOSE`) and does the same graceful stop. |
| Backend crashes | Not restarted automatically; the UI shows it can't reach storage and a relaunch starts a fresh one. |

## Files

| What | Where |
|---|---|
| Encrypted workspaces and their backups | `~/Library/Application Support/SimpleSafeBanking/users/` ([ADR 0004](../adr/0004-desktop-data-location.md)) |
| Backend log (no secrets) | `~/Library/Logs/SimpleSafeBanking/backend.log`, rotated at 5 MB |
| Bundle contents | `Contents/MacOS/{simplesafebanking-desktop,node}`, `Contents/Resources/{backend,dist}` |

## Where the Rust rewrite plugs in

Only `BackendSpec` knows the backend is Node. A Rust backend adds a second constructor next to `BackendSpec::node_sidecar` that returns another program with the same env, and must pass `npm run test:contract`. The shell, the UI and the window logic don't change. Steps are in [rust-migration.md](rust-migration.md).
