# Desktop security checklist

Threat model: a personal-finance app on one Mac, used by one person. Attackers considered: a malicious web page (including DNS rebinding), a malicious or buggy page script inside the app (XSS, a bad dependency), another local process running as the same user, a tampered or wrong build dependency, and accidental publishing of private data.

Not considered: an attacker who already controls your macOS account (they can read process memory and the Keychain regardless), and physical theft of an unlocked Mac.

"Proof" names the test or file that fails if the item stops being true.

## Network and process

| Control | Proof |
|---|---|
| Backend listens on loopback only, random port per launch | `backend.rs` (`HOST=127.0.0.1`, `free_loopback_port`); `security.contract.test.js` "accepts connections on loopback only" probes the LAN address |
| Backend default bind is loopback; Docker opts in to `0.0.0.0` | `desktopSecurityConfig.test.js` "binds to loopback unless the Docker image says otherwise" |
| Local-users mode refuses a non-loopback host | `security.contract.test.js` "refuses a non-loopback HOST" |
| The process answering `/healthz` must be our child (closes the free-port race before the token is injected) | `backend.rs` `listener_owned_by`; unit test `listener_ownership_is_proven_per_process`; verified live: the sidecar owned the only listener |
| Sidecar starts with a cleared environment and an explicit allowlist | `backend.rs` `contract_env`; tests `contract_env_*` |
| Dev-only flags are never set in the desktop profile | `contract_env_never_enables_dev_only_flags` |
| Sidecar dies with the shell, including a hard kill | Verified live with `kill -9` on the shell: backend logged "stopping (stdin closed)" and exited within 1 s; `lifecycle.contract.test.js` covers stdin EOF |
| One app instance per data folder (no second backend on the same encrypted files) | `instance_lock.rs` (`flock`, unit-tested); verified live 2026-11-06: two scratch folders ran side by side, a second copy on an in-use folder was refused with an alert and exit 1, and after `kill -9` a relaunch started cleanly. The identifier-keyed hand-off in `lib.rs` applies only to the real workspace |

## Authentication and request rules

| Control | Proof |
|---|---|
| Per-launch token: 32 bytes from the OS CSPRNG, hex | `backend.rs` `new_token`; test `token_is_64_lowercase_hex_and_unique` |
| Token is never in argv, a URL or a log | test `node_sidecar_runs_server_js_without_secrets_in_argv`; `security.contract.test.js` "never writes the sync token … to its log" |
| Token reaches the page only as a frozen, non-writable, non-enumerable global | `window.rs` `init_script`; test `init_script_json_encodes_and_freezes_the_token` |
| Constant-time token comparison | `server.js` `tokensMatch` (SHA-256 then `timingSafeEqual`) |
| Weak or missing token: backend refuses to start | `security.contract.test.js` "refuses to start with a weak sync token" |
| Host allowlist on **every** route (DNS rebinding), evaluated before auth | `security.contract.test.js` "Host guard on every route" |
| Origin required on writes; Sec-Fetch-Site checked; no CORS | `api.contract.test.js` "request rules" |
| Per-user sessions for all financial routes | `api.contract.test.js` "requires a session for financial routes" |
| Unlock/create/restore throttling: 10 failures per minute, global, successes neither counted nor clearing | `security.contract.test.js` "throttles … with 429"; `localUsers.test.js` "counts only failures …" |
| Request size limit | `security.contract.test.js` "answers an oversized JSON body with 413" |
| Errors never include stack traces or paths | `security.contract.test.js` "does not leak stack traces" |

## Browser surface (the webview)

| Control | Proof |
|---|---|
| Strict CSP on every response: `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, no `unsafe-eval` | `security.contract.test.js` "sends a strict CSP …" |
| Framing, referrer and sniffing protection | same test (`X-Frame-Options`, `Referrer-Policy`, `nosniff`) |
| No IPC capabilities granted to the webview, no remote IPC origins | `desktopSecurityConfig.test.js` "grants no IPC capabilities" |
| Tauri JS API not exposed; no asset protocol; no updater; no devtools, shell, fs or http plugins | `desktopSecurityConfig.test.js` (Tauri configuration, Rust crate) |
| Navigation pinned to the app origin; `window.open` and `target=_blank` never create a window | `window.rs`; test in `desktopSecurityConfig.test.js` "denies new windows …" |
| External links: `https` and `mailto` only, no embedded credentials, rate limited to one per second; plain `http` and other local ports are blocked | `window.rs` tests `never_opens_plain_http_or_credentialed_links_externally`, `external_opens_are_rate_limited`, `allows_the_app_origin_only` |
| UI has no external hosts, inline scripts or `eval` | Checked when the CSP was introduced (no external URLs in `src/`, one module script in the built `index.html`). Re-check when adding a library that loads remote assets |

## Data at rest

| Control | Proof |
|---|---|
| Workspaces are SQLCipher databases; no plaintext fallback | `encryptedStore.js`; `encryptedStore.test.js` |
| Keys are password-wrapped (scrypt) and zeroed on shutdown | `localUsers.js`, `closePrivateStorage`; `localUsers.test.js` |
| Data and log folders are mode `0700`, symlinks refused, files `0600` | `paths.rs` tests `creates_private_directories_and_tightens_modes`, `refuses_a_symlinked_data_directory`; verified live |
| Backup names are validated (no path traversal) | `api.contract.test.js` "rejects a path-traversal backup name" |
| Static files cannot escape the UI folder | `security.contract.test.js` "never serves files outside the static directory" |
| Import of dev data: archive first, never overwrite, sha256-verify, owner-only archive folder | `scripts/desktop/importDevData.mjs` |

## Supply chain and build

| Control | Proof |
|---|---|
| Node runtime pinned by version and sha256, checked every build, cross-checked against nodejs.org on download, size and time limited | `prepareSidecar.mjs`; `desktopSecurityConfig.test.js` |
| Sidecar dependencies installed with a minimal environment, production only, `npm audit` (high and above) must pass | `prepareSidecar.mjs`; `desktopSecurityConfig.test.js` |
| Backend dependencies pinned exactly (Express excepted); zod 4.6.7 | `desktopSecurityConfig.test.js` "pins backend dependencies exactly" |
| Tauri crates pinned with `=`; `Cargo.lock` committed; Rust toolchain pinned; Rust checks use `--locked` | `desktopSecurityConfig.test.js` "pins tauri crates exactly …" |
| `npm audit` is clean for the backend; CI fails on high or critical in either package | `ci.yml`; see "Known gaps" for the root package |
| Staged resources scanned for private-looking files | `prepareSidecar.mjs` `privacyGuard` |
| Hardened runtime on; entitlements limited to JIT (+ library-validation exception while ad-hoc signed) | `desktopSecurityConfig.test.js` "macOS entitlements"; `codesign -d --entitlements -` on the built app |

## Repository privacy

| Control | Proof |
|---|---|
| Build outputs, the Node binary, staged resources, schemas and caches are git-ignored | `.gitignore` (`src-tauri/target/`, `binaries/`, `resources/staged/`, `gen/`, `desktop/cache/`, `dist-desktop/`) |
| Privacy scan covers desktop artifacts | `scripts/privacy-scan.sh`, run by `npm run check` |
| `personal` is never pushed | `AGENTS.md`; the scan prints a reminder on this branch |

## Known gaps and accepted risks

1. **Ad-hoc signing, no notarization.** Gatekeeper doesn't vouch for the app and nothing guarantees the bundle wasn't modified after you built it. Fine for a self-built personal app; fixing it needs a paid Developer ID.
2. **`disable-library-validation` is enabled.** Required while ad-hoc signed (verified: Node can't load SQLCipher without it), but it means a same-user attacker who can write inside the app bundle could plant a native module. Remove it once Node and the addon are signed with one Team ID.
3. **Token is passed to the sidecar by environment variable.** A same-user process can read it (`ps eww`). Such a process can already read the backend's memory, so this isn't a new capability. Switching to a stdin hand-off would remove it.
4. **Any local process can open a TCP connection to the backend port.** It still needs the bearer token, an allowed Host, and for writes an allowed Origin.
5. **`SSB_DESKTOP_DATA_DIR` works in release builds.** It exists to test builds against scratch data. Someone who can set your environment can already act as you.
6. **`style-src` allows `'unsafe-inline'`** because React renders inline `style` attributes. Scripts remain locked to `'self'`.
7. **Tauri's own CSP setting is not used.** The window loads the backend's origin, so Tauri would not apply it; the backend header is the single source of truth.
8. **Root `npm audit` still reports moderate advisories** with only breaking-change fixes: `uuid` 8.3.2 (a shipped dependency of `exceljs` 4.4.0, which only calls `v4`; the advisory concerns v3/v5/v6 with a caller-supplied buffer, so it isn't reachable) and `minimatch` (dev tooling only). Nothing high or critical remains in either package; CI enforces that.
9. **`cargo audit` is not run automatically** (`cargo-audit` isn't installed in CI or here). Run `npm run desktop:audit` after `cargo install cargo-audit`.
10. **CSP verification is partial.** In the release app (2026-11-06, scratch workspace) the login screen, creating a user, fetching and parsing the bundled demo CSV, and saving 22 transactions through the encrypted API all worked with the policy in place; the bundles contain no `eval`, `new Function` or `new Worker`. **Not yet exercised in the real window:** Excel and JSON export (blob downloads), the encrypted-backup list and restore, and a file-picker upload. WKWebView console output isn't readable from here. If one of those looks broken, suspect the CSP first: temporarily removing the `Content-Security-Policy` line in `securityHeaders()` (`backend/requestBoundary.js`) is the quickest way to confirm.
11. **Debug builds** (`desktop:dev`) load the Vite dev server with a saved dev token. Release builds never do.
12. **No update mechanism.** You rebuild to update; there is no network update path to attack.

## Resolved

- **The single-instance lock was per app identifier, not per data folder** (found and fixed 2026-11-06). `tauri-plugin-single-instance` uses the socket `/tmp/app_simplesafebanking_desktop_si.sock` (read from the plugin source), so it ignored `SSB_DESKTOP_DATA_DIR`: with the real app open, a scratch launch handed off to the real window and exited, and you could believe you were on scratch data while looking at your real workspace. Now the lock is per data folder (`instance_lock.rs`), scratch runs skip the identifier hand-off, and their window title says "(scratch data)".
- **The unlock throttle counted successful attempts** (found and fixed 2026-11-06). More than 10 successful unlocks in a minute returned `429`. It now counts failures only and a success never clears the count (the limit is global, so a clearing success would let a holder of one account keep guessing another account's password). The old code also hid the "too many open sessions" `429` behind the generic `401`; it is now returned as documented.
- **Startup-failure dialogs never appeared** (found and fixed 2026-11-06). `tauri-plugin-dialog` showed no window in this app (the window server listed none), so a refused or failed launch lingered as a windowless process. The alert now uses `/usr/bin/osascript` and the plugin was removed (about 150 fewer lines in `Cargo.lock`).
