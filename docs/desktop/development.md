# Developing the desktop app

Day-to-day workflow. Build and signing details are in [building.md](building.md).

## Which command for what

| I want to... | Run | Notes |
|---|---|---|
| Work on the UI | `npm run local` (or `npm run dev:personal`) | Same as before: browser, Vite hot reload, nothing desktop-specific. Most work happens here. |
| Check the UI inside the native window | `npm run desktop:dev` | Opens the Tauri window on the Vite dev server at `127.0.0.1:5173`. Reuses a dev server that's already running; otherwise starts one (`scripts/desktop/devServer.mjs`). No sidecar. Stop a reused server where you started it. |
| Run the real sidecar from a debug build | `SSB_DESKTOP_USE_SIDECAR=1 npm run desktop:dev` | Needs `npm run desktop:prepare` once. |
| Change the Rust shell | edit `src-tauri/src/`, then `npm run desktop:check` | fmt, clippy (warnings are errors) and unit tests. |
| Change the backend API or env | edit `backend/`, then `npm run test:backend && npm run test:contract` | Update [backend-contract.md](backend-contract.md) in the same change. |
| Build the app | `npm run desktop:build` | Output in `src-tauri/target/release/bundle/macos/`. |
| Run everything | `npm run check:all` | The gate before calling anything done. |

## Test layers

| Layer | Command | Covers |
|---|---|---|
| Frontend | `npm run test:frontend` | React and `src/lib`, including the desktop token handling |
| Backend unit | `npm run test:backend` | Storage, users, request boundary |
| Backend contract | `npm run test:contract` | The black-box HTTP/process contract. It spawns a real backend and only speaks HTTP, so a future Rust backend runs the same suite. |
| Shell | `npm run desktop:check` | Env building, token format, navigation allow-list, folder permissions |
| Real backend from Rust | `cd src-tauri && cargo test -- --ignored` | Spawns the real Node backend (needs `npm run setup:personal-dev`) |
| Security config | included in `npm test` | `scripts/desktopSecurityConfig.test.js` pins entitlements, bind address and the other security-relevant config |

Run the contract suite against a built bundle instead of the repo backend:

```bash
APP="$PWD/src-tauri/target/release/bundle/macos/SimpleSafeBanking.app/Contents"
SSB_CONTRACT_BACKEND_CMD="$APP/MacOS/node $APP/Resources/backend/server.js" npm run test:contract
```

## Rules that keep the Rust migration possible

1. **UI to backend goes through `/api` over HTTP, nothing else.** Don't add Tauri `invoke` calls for app logic ([ADR 0002](../adr/0002-http-api-is-the-backend-seam.md)).
2. **Configure the backend only through env vars** documented in the contract.
3. **A contract change needs a contract test.** Anything the UI or shell relies on and the contract doesn't pin is a hidden coupling that a rewrite would miss.
4. **Keep the Node-specific parts in `BackendSpec::node_sidecar`.** Don't leak "it's Node" into other shell code.

## Using test data safely

Never point experiments at your real workspace. Use a scratch folder:

```bash
SSB_DESKTOP_DATA_DIR="$(mktemp -d)" \
  src-tauri/target/release/bundle/macos/SimpleSafeBanking.app/Contents/MacOS/simplesafebanking-desktop
```

It starts with an empty database, so create a throwaway user there. Delete the folder afterwards.

Scratch runs are isolated from the real app: they get their own lock per folder, can run next to the real app, and their window title says "(scratch data)". Starting a second copy on a folder that is already in use is refused with an alert.

## Debugging

| Problem | Where to look |
|---|---|
| The window says it can't reach local user storage | `~/Library/Logs/SimpleSafeBanking/backend.log`. Usually a startup error. If the log is empty, the bundled `node` is missing or blocked. |
| Startup dialog "backend did not start" | The same log, then `building.md` troubleshooting. |
| Inspect the page | In a debug build, right-click, then Inspect Element (Safari Web Inspector). Release builds don't expose it. |
| A UI bug only shows in the app | The webview is WebKit, not Chrome. Reproduce in Safari first; typical causes are CSS, date parsing and file downloads. |
| A leftover `node` process | `pgrep -fl 'SimpleSafeBanking.app'`. After a hard kill the backend exits within a second by itself; if one remains, that's a bug in the stdin handling. |

## Keep out of git

Don't commit `src-tauri/target/`, `src-tauri/binaries/`, `src-tauri/resources/staged/`, `dist-desktop/` or anything under `backups/`. `npm run privacy:scan` checks this.
