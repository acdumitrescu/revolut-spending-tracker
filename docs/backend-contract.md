# Backend contract

This is everything the UI and any supervising process rely on from the backend. It's the seam described in the HTTP-API-is-the-seam rule. The Node implementation lives in `backend/server.js`. A future Rust backend must honour this document and pass the black-box suite in `backend/contract/` (`npm run test:contract`).

**Rule:** any change to an endpoint, header, status code or env var updates this file and the contract tests in the same change.

## 1. Process lifecycle

| Aspect      | Contract                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Start       | `node server.js` (later: any executable). Configuration comes **only** from env vars (§2). Nothing secret goes in argv.                                            |
| Bind        | `HOST`:`PORT`. Local-users mode refuses any host other than `127.0.0.1`/`localhost`.                                                                               |
| Ready       | `GET /healthz` returns `200 {"ok":true}`. No auth, but the `Host` check (§3) still applies. Starts answering once storage is open.                                 |
| Stdout      | One line `SSB API listening on <host>:<port>` when it's listening. Everything else is diagnostics. Logs never contain secrets, request bodies or financial data.   |
| Stop        | On `SIGTERM`/`SIGINT`: stop accepting connections, finish in-flight requests, close every encrypted store, zero the keys, then exit `0`.                           |
| Parent loss | With `SSB_EXIT_ON_STDIN_CLOSE=true`, EOF on stdin triggers the same graceful stop. A supervising process holds stdin open, so the backend exits if the shell dies. |
| Bad config  | Exits non-zero before listening (for example a missing or weak `SSB_SYNC_TOKEN`).                                                                                  |

## 2. Environment variables

| Variable                                                                              | Default                                       | Used by       | Meaning                                                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`                                                                                | `127.0.0.1`                                   | all           | Bind address. Loopback by default; the Docker image sets `HOST=0.0.0.0` explicitly. Embedded and dev use `127.0.0.1`.                   |
| `PORT`                                                                                | `3177`                                        | all           | Bind port. A supervisor may pick a free random port.                                                                                    |
| `SSB_SYNC_TOKEN`                                                                      | **required**                                  | all           | Bearer token for every `/api/*` call. Must pass `isSafeSyncToken` (≥32 chars, not a placeholder).                                       |
| `ALLOWED_ORIGINS`                                                                     | `http://127.0.0.1:3176,http://localhost:3176` | all           | Comma list. `Origin` must match for every write (and for reads that send one).                                                          |
| `SSB_ALLOWED_HOSTS`                                                                   | _(empty)_                                     | all           | Extra `Host` header values. `127.0.0.1:<port>` and `localhost:<port>` are always allowed.                                               |
| `SSB_STATIC_DIR`                                                                      | _(unset)_                                     | embedded      | If set, serve this built UI folder at `/` with an SPA fallback to `index.html`. Unset means API only (Docker/dev).                      |
| `SSB_EXIT_ON_STDIN_CLOSE`                                                             | `false`                                       | embedded      | See §1.                                                                                                                                 |
| `SSB_STORAGE`                                                                         | _(plain JSON)_                                | dev, embedded | `sqlcipher` turns on encrypted storage.                                                                                                 |
| `SSB_LOCAL_USERS`                                                                     | `false`                                       | dev, embedded | `true` (with `sqlcipher`) turns on local users: per-user databases unlocked by password.                                                |
| `SSB_DATABASE_FILE`                                                                   | _(required with sqlcipher)_                   | dev, embedded | Legacy single-user database path. Its folder is the default parent of `users/`. If the file is missing, no legacy migration is offered. |
| `SSB_USERS_DIR`                                                                       | `<dirname(SSB_DATABASE_FILE)>/users`          | dev, embedded | User registry plus per-user databases and backups. Must be `0700`.                                                                      |
| `SSB_KEYCHAIN_HELPER`                                                                 | _(unset)_                                     | dev           | Path to the Keychain helper. Needed only for legacy single-user mode or the first-user migration. The desktop app doesn't set it.       |
| `SSB_BACKUP_DIR`                                                                      | _(unset)_                                     | dev, docker   | Backup folder outside users mode. Users mode uses `users/<id>/backups`.                                                                 |
| `APP_STATE_FILE`, `VENDOR_OBSERVATIONS_FILE`                                          | `private-data/private-sync/…`                 | docker        | Plain-JSON storage paths (non-encrypted mode).                                                                                          |
| `APP_STATE_MAX_BYTES`                                                                 | `5242880`                                     | all           | Maximum workspace payload.                                                                                                              |
| `SSB_TRUSTED_DEV_PROXY`, `SSB_DEV_DISABLE_AUTO_LOCK`, `SSB_ALLOW_WEAK_TEST_PASSWORDS` | `false`                                       | dev only      | Testing conveniences. **Never set them in desktop builds.**                                                                             |

## 3. Request rules

**Every route** (API, `/healthz`, static UI), checked first:

0. **Host:** a `Host` that isn't allowed gives `403 {"error":"Host not allowed"}`. Only `127.0.0.1:<port>`, `localhost:<port>` and `SSB_ALLOWED_HOSTS` pass. This blocks DNS rebinding before anything else is evaluated.

**Every `/api/*` route**, in this order. The first failure wins:

1. **Auth:** `Authorization: Bearer <SSB_SYNC_TOKEN>`. Missing or wrong gives `401` plus `WWW-Authenticate: Bearer`. A weak or absent server token gives `503`.
2. **Host:** checked again by the API boundary (same rule as step 0).
3. **Origin:** a present `Origin` that isn't listed gives `403`. Writes (anything except GET/HEAD/OPTIONS) **must** send a listed `Origin`.
4. **Fetch metadata:** a `Sec-Fetch-Site` other than `same-origin`/`none` gives `403`.
5. **Session (users mode):** every financial route needs `x-ssb-session: <token from create/unlock>`. Missing, expired or revoked gives `401`.

**Headers on every response:** `Content-Security-Policy` (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`; inline styles allowed), `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. No `X-Powered-By`. API responses also carry `Cache-Control: no-store`.

Errors are always JSON `{"error": "<safe message>"}` and never include stack traces. A body the server can't parse gives `400`. A payload that's too large gives `413`. User create/unlock/restore requests are throttled by **failures**: once 10 requests have failed inside one minute (wrong password, validation errors, unknown user, anything that returns an error), further requests get `429` until the minute is up. Successful requests are never counted and never clear the count; the limit is global, not per user, so a good login can't be used to reset the budget for guessing another account's password. Pinned by `backend/localUsers.test.js` and `security.contract.test.js`.

## 4. Endpoints

### Health

| Method & path  | Auth | Response          |
| -------------- | ---- | ----------------- |
| `GET /healthz` | none | `200 {"ok":true}` |

### Local users (only when `SSB_LOCAL_USERS=true`)

| Method & path              | Session | Body                           | Response                                                                                                                                                                                                                |
| -------------------------- | ------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/users`           | no      | -                              | `{users:[{id,name}], setupRequired, migrationRequired, idleMs, passwordMinimum, testingPasswords}`                                                                                                                      |
| `POST /api/users`          | no      | `{name, password, migrate?}`   | `{user:{id,name}, token, idleMs, autoLockDisabled}`. `400` for an invalid name or password, a duplicate, or "migrate required". `429` when 10 failures have already happened this minute.                               |
| `POST /api/users/unlock`   | no      | `{userId, password}`           | Same as create. `401` for the wrong user or password. `429` when throttled, or when 20 sessions are already open ("Too many open sessions"; this one is reported as its own 429 and not hidden behind the generic 401). |
| `POST /api/users/restore`  | no      | recovery file payload (≤30 MB) | Same as create                                                                                                                                                                                                          |
| `POST /api/users/lock`     | header  | -                              | `{locked:true}`. Revokes the session.                                                                                                                                                                                   |
| `GET /api/users/session`   | yes     | -                              | `{user:{id,name}}`                                                                                                                                                                                                      |
| `POST /api/users/recovery` | yes     | -                              | `{format:"ssb-local-user-recovery-v1", name, createdAt, wrappedKey, database(base64)}`                                                                                                                                  |

Sessions expire after 15 minutes idle or 12 hours total, unless the dev-only flags are set.

### Workspace

| Method & path                          | Session | Notes                                                                                                                                                                                                     |
| -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/data`                        | yes     | `{data, version, updatedAt}`                                                                                                                                                                              |
| `POST /api/data`                       | yes     | Plain-JSON mode only: `{data, version}` gives the new state, or `409 {error:"Version conflict", ...current}`. **Encrypted mode gives `405`.**                                                             |
| `POST /api/changes`                    | yes     | Encrypted mode: validated change commands (`backend/workspaceChanges.js`) give the new state. `409` with the current state on a conflict. `400` for invalid changes. `404` when encrypted storage is off. |
| `POST /api/backups`                    | yes     | `{data, reason, importBatchId?}` gives a backup receipt                                                                                                                                                   |
| `GET /api/encrypted-backups`           | yes     | `{filenames:[…]}`, newest first. The names match `^(manual\|import\|recovery)-[A-Za-z0-9_-]+\.ssbdb$`.                                                                                                    |
| `GET /api/encrypted-backups/:filename` | yes     | `{data}` after an integrity check and validation. `400` for a bad name or bad backup.                                                                                                                     |

### Vendor observations

| Method & path                           | Session | Notes                                                               |
| --------------------------------------- | ------- | ------------------------------------------------------------------- |
| `GET /api/vendor-observations`          | yes     | `{enabled:true, updatedAt, observations:[…]}`                       |
| `POST /api/vendor-observations/collect` | yes     | `{observations:[…]}` gives the list plus `stored`                   |
| `POST /api/vendor-observations/resolve` | yes     | `{normalizedDescription, status, resolution?}`. `404` if not found. |

### Market data (outbound network, best effort)

| Method & path                    | Session | Notes                                      |
| -------------------------------- | ------- | ------------------------------------------ |
| `GET /api/quotes?symbols=A,B`    | yes     | Yahoo quotes. `502` upstream failure.      |
| `GET /api/instruments/search?q=` | yes     | `{instruments, source:"yahoo-unofficial"}` |

### Static UI (only when `SSB_STATIC_DIR` is set)

| Method & path                      | Notes                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `GET /assets/*`, `/favicon.svg`, … | Files from `SSB_STATIC_DIR`                                              |
| `GET /<any non-/api path>`         | `index.html` (SPA fallback). `/api/*` is never answered by the fallback. |

## 5. Storage layout (users mode)

```
<data root>/
  workspace.ssbdb           legacy single-user DB (optional; migration source only)
  users/                    0700
    users.json              registry: ids, names, password-wrapped keys (0600)
    <uuid>/workspace.ssbdb  per-user SQLCipher DB (0600)
    <uuid>/backups/*.ssbdb  per-user encrypted backups
```

A replacement backend must read and write these files byte-compatibly: the same SQLCipher settings, wrapped-key format (`backend/passwordRecovery.js`) and schema (`backend/appStateSchema.js`).
