# Replacing the Node backend with Rust (plan, not started)

[ADR 0001](../adr/0001-desktop-tauri-node-sidecar.md) keeps the Node backend as a sidecar so nothing had to be rewritten. [ADR 0002](../adr/0002-http-api-is-the-backend-seam.md) makes a later port possible without touching the UI: the only thing the UI and shell know about the backend is [backend-contract.md](backend-contract.md).

## Why you might do it

- Drop the bundled Node runtime and the native-module ABI coupling (about 117 MB of the app).
- One signed binary, no library-validation exception (see the signing notes in [building.md](building.md)).
- Memory-safe handling of keys and financial data.

None of this is urgent. Don't start until the pain outweighs the cost of re-implementing about 2.9k lines of backend.

## The migration seam

`src-tauri/src/backend.rs` already separates *what to launch* from *how to supervise it*. A Rust backend adds a second constructor next to `BackendSpec::node_sidecar`; supervision, health checks, the listener-ownership check and shutdown stay unchanged. A fully in-process backend would instead implement the same HTTP contract on a loopback listener inside the shell.

## Plan

1. **Freeze the contract.** Keep `backend/contract/` green against Node. It is black-box: `SSB_CONTRACT_BACKEND_CMD="path/to/binary [args]" npm run test:contract` runs the same suite against any executable.
2. **Port by slice, behind the same HTTP API**, in this order (each slice shippable):
   1. Request boundary: Host/Origin/Sec-Fetch, bearer token (constant-time), security headers, body limits, static serving.
   2. Encrypted store: SQLCipher via the `rusqlite` bundled-SQLCipher feature. It must open the **existing** `.ssbdb` files, so keep the key derivation, PRAGMAs and schema byte-compatible.
   3. Local users: registry, scrypt key wrapping, sessions, unlock throttling.
   4. Workspace, changes and backups, including backup-name validation.
   5. Market data (outbound, best effort) and vendor observations.
3. **Run both side by side** on scratch data: write with one, read with the other, in both directions, before switching the default.
4. **Switch** the shell's constructor, drop `externalBin`, delete the Node staging, and remove `disable-library-validation`.

## Must not regress

Everything in [security-checklist.md](security-checklist.md) is a requirement on the new backend, and its tests (`backend/contract/*.test.js`) are the acceptance suite. Data compatibility is the hard part: existing users must unlock their existing files with the same passwords and recovery bundles.
