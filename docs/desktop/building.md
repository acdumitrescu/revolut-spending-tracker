# Building and running the desktop app

Apple Silicon macOS only for now (`aarch64-apple-darwin`). Everything below runs from the repo root.

## Prerequisites

- Node and npm on the host (used by the build scripts and the web build).
- Rust. `rust-toolchain.toml` pins the exact release (currently `1.99.1`) with `rustfmt` and `clippy`; rustup installs it on first use.
- Network on the first build: it downloads the pinned Node runtime, and the production `npm audit` gate needs the registry.

## Commands

| Command | What it does |
|---|---|
| `npm run desktop:build` | Builds the desktop web bundle, stages the sidecar and resources, builds and signs `SimpleSafeBanking.app`. |
| `npm run desktop:dev` | Hot-reload development: loads the Vite dev server instead of the sidecar. Uses the saved dev token, so never use it with real data you can't afford to expose to dev tooling. |
| `npm run desktop:check` | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` (all `--locked`). Creates placeholder resources if needed. |
| `npm run check:all` | Everything: lint, all tests, build, bundle budget, privacy scan, contract tests, Rust checks. |
| `npm run desktop:import-dev-data` | One-time copy of your dev workspace into the app's data folder (see below). |

To run the real sidecar from a debug build: `SSB_DESKTOP_USE_SIDECAR=1 npm run desktop:dev`.

## What `desktop:build` stages (`scripts/desktop/prepareSidecar.mjs`)

1. **Node runtime.** Version and sha256 are pinned in `desktop/node-version.json`. The archive is cached in `desktop/cache/`, its sha256 is verified on every build, and a fresh download is also cross-checked against nodejs.org's published `SHASUMS256.txt`. A mismatch deletes the archive and stops the build.
2. **Backend.** The files listed in `backend/Dockerfile` (single source of truth) plus a production-only `npm ci` run **under the bundled Node**, with a minimal environment (no inherited tokens). Then `npm audit --omit=dev --audit-level=high` must pass (`SSB_SKIP_AUDIT=1` skips it when offline).
3. **UI.** `dist-desktop/` from `npm run build:desktop-web`.
4. **Privacy guard.** Fails the build if anything in the staged resources looks private (databases, backups, exports, `app-state.json`, and similar).

## Updating the bundled Node

The SQLCipher native module is compiled against the Node ABI, so the runtime and the module must match. To upgrade:

1. Pick the new version, then take its `darwin-arm64` sha256 from `https://nodejs.org/dist/v<version>/SHASUMS256.txt`.
2. Update `version`, `modulesAbi` and `sha256` together in `desktop/node-version.json`.
3. `npm run desktop:build`. The build fails loudly if the module doesn't load under the new runtime.
4. Run the contract suite against the bundle:
   ```bash
   APP="$PWD/src-tauri/target/release/bundle/macos/SimpleSafeBanking.app/Contents"
   SSB_CONTRACT_BACKEND_CMD="$APP/MacOS/node $APP/Resources/backend/server.js" npm run test:contract
   ```

## Signing

Builds are **ad-hoc signed** (`signingIdentity: "-"`) with the hardened runtime, and are not notarized. That is fine for an app you build and run on your own Mac. Copying the app to another Mac makes Gatekeeper refuse it until you right-click, then Open.

`src-tauri/Entitlements.plist` grants only two things:

- `allow-jit`: V8 needs it.
- `disable-library-validation`: required while ad-hoc signed. Verified: without it, Node refuses to load the SQLCipher addon (`mapping process and mapped file (non-platform) have different Team IDs`).

With a paid Developer ID you would sign Node and the addon with the same Team ID, notarize, and **remove** `disable-library-validation`. The tests in `scripts/desktopSecurityConfig.test.js` pin the current entitlement list; update them in the same change.

## Importing your dev data

```bash
npm run desktop:import-dev-data -- --dry-run   # look first
npm run desktop:import-dev-data
```

Quit the desktop app and stop the dev backend first. The script archives the source into `backups/` (git-ignored), copies the encrypted files into `~/Library/Application Support/SimpleSafeBanking/users/`, verifies every file by sha256, and never overwrites existing users. You unlock with your usual password.

## Testing against scratch data

`SSB_DESKTOP_DATA_DIR=/some/absolute/dir` moves the data root (and logs under it), so you can try a build without touching your real workspace. Never point it at a folder you don't trust.

Scratch runs are isolated from the real app: they get their own lock per folder, can run next to the real app, and their window title says "(scratch data)". Starting a second copy on a folder that is already in use is refused with an alert.

## Troubleshooting

- **"bundled runtime missing"**: run `npm run desktop:build`, not just `tauri build`.
- **Window never opens, dialog says the backend didn't start**: read `~/Library/Logs/SimpleSafeBanking/backend.log`. "another process is listening on port N" means something grabbed the port between probing and binding; relaunch.
- **`cargo` complains about the toolchain**: let rustup install the pinned version, or update `rust-toolchain.toml` deliberately.
