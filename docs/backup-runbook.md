# Backup and Restore Runbook

> For the current encrypted personal launcher, see [Local users](local-users.md). It uses separate password-unlocked profiles and per-user recovery downloads. The single-user paths and commands below describe the earlier workflow.

## What to back up

For `client-only` deployments:

- exported JSON backups from the app
- optional exported Excel snapshots for private review

For `private-sync` deployments:

- exported JSON backups from the app
- automatic local-development JSON backups under `backups/automatic/`
- the Docker volume `app-state`
- for personal local Docker, the Docker volume `ssb-personal_app-state`

## Recommended backup routine

1. Export a JSON backup after meaningful import or budgeting changes.
2. Keep that JSON file in an ignored local folder such as `backups/` or `exports/`.
3. For private-sync deployments, periodically back up the Docker volume as well.
4. Before upgrades, create both:
   - a fresh JSON backup
   - a fresh volume backup

For the personal local Docker profile, create a private volume backup with:

```bash
scripts/backup-personal-volume.sh
```

The backup is written under `backups/`, which is ignored by git.

## Trusted local-development backups

When the app is launched with `ssb start`, every confirmed real CSV import is backed up before its state is committed. One idempotent, UI-restorable JSON file is retained per import batch under `backups/automatic/`. Synthetic demo imports and backup restoration are excluded.

Use **Import & backup → Create backup now** for an additional manual restore point. Automatic and manual files are retained until you remove them intentionally; starting or stopping the app never creates or deletes them.

## Browser recovery

Use this when browser storage is lost or cleared:

1. Open the app.
2. Use `Restore private backup` and select either a downloaded JSON export or a file from `backups/automatic/`.
3. Confirm balances, budgets, goals, and import history.
4. Export a new JSON backup after validation.

## Private-sync recovery

Use this when the API container or volume is damaged:

1. Restore the Docker volume from backup.
2. Restart the `api` service.
3. Confirm `/healthz` responds successfully.
4. Reload the app and check the private sync status.

If the volume backup is unavailable:

1. Restore from the most recent browser-exported JSON backup.
2. Let the private-sync deployment upload that recovered state again.

## Corruption handling policy

- Do not overwrite a good browser-local state with an unreadable remote state.
- If private sync is degraded, continue operating locally and export a fresh JSON backup before further troubleshooting.
- Prefer recovery in this order: browser-exported JSON backup, then Docker volume backup, then manual troubleshooting.
- Avoid `docker compose down -v`, `docker volume rm`, and Docker volume prune unless you already have a fresh backup and intentionally want to erase local server-side state.
