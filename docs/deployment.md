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
5. For a public demo, prefer a static host such as Vercel and keep the deployment frontend-only.

Behavior:

- all finance data stays in browser storage
- backups are exported and restored through JSON/Excel flows
- FX refresh remains optional
- users may upload their own CSV locally, so the demo should recommend exporting a JSON backup before they leave

### Vercel demo setup

Recommended public demo settings:

1. Import the GitHub repo into Vercel.
2. Deploy from `main`.
3. Set:
   - `VITE_DEPLOYMENT_PROFILE=client-only`
   - `VITE_PRIVATE_SYNC_ENABLED=false`
4. Leave the backend undeployed.
5. Use the included `vercel.json` rewrite so client-side routes keep working on refresh.

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
2. Keep the `api` service internal to Docker Compose.
3. Put external protection in front of the site:
   - recommended: reverse proxy Basic Auth or another private access gate
   - keep `/api` inaccessible from unauthenticated public traffic
4. Mount the named volume `app-state` for persistent private sync state.
5. Run `docker compose up -d --build`.

Behavior:

- browser-local state remains primary
- the app still works if private sync is unavailable
- the API stores one versioned private state blob for the deployment

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
