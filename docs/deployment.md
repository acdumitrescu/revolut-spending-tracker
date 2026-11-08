# Deployment Guide

SimpleSafeBanking supports two production deployment profiles:

- `client-only`: static frontend only, no private sync API
- `private-sync`: static frontend plus the single-tenant private sync API

## 1. Client-only deployment

Use this when you want the strongest local-first posture and do not need server persistence.

1. Copy `.env.example` values you need into your deployment environment.
2. Set:
   - `VITE_DEPLOYMENT_PROFILE=client-only`
   - `VITE_PRIVATE_SYNC_ENABLED=false`
3. Build the frontend image and deploy the static site.
4. Do not run the `api` service.
5. For a public demo, prefer a static host such as Netlify and keep the deployment frontend-only.

Behavior:

- all finance data stays in browser storage
- backups are exported and restored through JSON/Excel flows
- FX refresh remains optional
- users may upload their own CSV locally, so the demo should recommend exporting a JSON backup before they leave

### Netlify demo setup

Recommended public demo settings:

1. Import the GitHub repo into Netlify.
2. Deploy from `main`.
3. Set:
   - `VITE_DEPLOYMENT_PROFILE=client-only`
   - `VITE_PRIVATE_SYNC_ENABLED=false`
4. Leave the backend undeployed.
5. Use the included `public/_redirects` rewrite so client-side routes keep working on refresh.
6. Set the build command to `npm run build`.
7. Set the publish directory to `dist`.

Recommended public demo messaging:

- offer `Try synthetic demo data` as the safest first path
- allow CSV upload locally in-browser
- remind users to export a JSON backup before leaving if they imported personal data

## 2. Private-sync deployment

Use this when you want a private VPS or home-server deployment with browser-local UX plus optional server persistence.

1. Set:
   - `VITE_DEPLOYMENT_PROFILE=private-sync`
   - `VITE_PRIVATE_SYNC_ENABLED=true`
   - `ALLOWED_ORIGINS=https://your-private-host.example`
   - `SSB_SYNC_TOKEN` to a long random secret such as the output of `openssl rand -hex 32`
2. Keep the `api` service internal to Docker Compose.
3. Put external protection in front of the site:
   - recommended: reverse proxy Basic Auth or another private access gate
   - keep `/api` inaccessible from unauthenticated public traffic
4. Mount the named volume `app-state` for persistent private sync state.
5. Run `docker compose up -d --build`.
6. Enter the same token in Settings after opening the app. It remains in the current browser tab only.

Behavior:

- browser-local state remains primary
- the app still works if private sync is unavailable
- the API stores one versioned private state blob for the deployment
- every private API read and write requires the configured bearer token

### Local Docker workflow

Use this when you want the private-sync app available on localhost without keeping a Vite or Node dev server open.

Start:

```bash
export SSB_SYNC_TOKEN="$(openssl rand -hex 32)"
docker compose up -d --build
```

Open:

```text
http://127.0.0.1:3176
```

Stop without deleting private sync data:

```bash
docker compose down
```

Delete containers and the private sync volume only when you intentionally want to erase server-side local state:

```bash
docker compose down -v
```

The helper script wraps the same commands:

```bash
scripts/personal-app.sh start
scripts/personal-app.sh status
scripts/personal-app.sh logs
scripts/personal-app.sh stop
```

Local Docker behavior:

- only `127.0.0.1:3176` is published on the host
- the API stays internal to Compose and is reached through `/api`
- the API still requires the private sync token proxied from the browser
- nginx serves the built frontend from a read-only container filesystem
- app state and vendor observations persist in the `ssb-personal_app-state` volume when using `scripts/personal-app.sh`
- memory and process limits keep the background footprint small

The trusted `ssb start` Vite workflow is intentionally different: it injects the token in the loopback development proxy and exposes only client-visible capability booleans. Docker and other private-sync deployments retain the manual browser-session unlock flow.

For GitHub-safe public testing, use the client-only profile:

```bash
scripts/public-test.sh start
```

It opens on `http://127.0.0.1:3178`, does not start the API service, and does not mount a private sync volume.

## 3. Desktop app (macOS)

The desktop app runs the same backend as a local sidecar process. It doesn't use Docker, nginx or a public host. See [docs/desktop/README.md](desktop/README.md).

The backend has two optional env vars that only the desktop shell sets. Docker and dev leave them unset, and behaviour there is unchanged:

- `SSB_STATIC_DIR`: serve the built UI from the API process (same origin, SPA fallback)
- `SSB_EXIT_ON_STDIN_CLOSE=true`: exit cleanly when the parent process goes away

The API also shuts down gracefully on `SIGTERM` in every deployment. The full list of env vars is in [docs/desktop/backend-contract.md](desktop/backend-contract.md).

## Reverse proxy notes

Recommended outer proxy controls:

- HTTPS only
- Basic Auth or another private-access mechanism
- rate limiting at the proxy if the host is exposed beyond a private network
- access logs retained privately and rotated

## Upgrade and rollback

Upgrade:

1. Export a fresh JSON backup from the app.
2. Back up the `app-state` volume.
3. Pull or sync the new repo state.
4. Run `docker compose up -d --build`.
5. Verify `app` and `api` health checks.

Rollback:

1. Re-deploy the previous image or previous repo checkout.
2. Restore the `app-state` volume backup if server persistence must roll back too.
3. If needed, restore from the JSON backup in the browser UI.

## Logging guidance

- Keep container logs enabled for debugging and incident review.
- Use host-level log rotation so nginx and API logs do not grow unbounded.
- Treat logs as potentially sensitive operational artifacts and keep them private.
