# Backup and Restore Runbook

## What to back up

For `client-only` deployments:

- exported JSON backups from the app
- optional exported Excel snapshots for private review

For `private-sync` deployments:

- exported JSON backups from the app
- the Docker volume `app-state`

## Recommended backup routine

1. Export a JSON backup after meaningful import or budgeting changes.
2. Keep that JSON file in an ignored local folder such as `backups/` or `exports/`.
3. For private-sync deployments, periodically back up the `app-state` volume as well.
4. Before upgrades, create both:
   - a fresh JSON backup
   - a fresh volume backup

## Browser recovery

Use this when browser storage is lost or cleared:

1. Open the app.
2. Use `Restore backup JSON`.
3. Confirm balances, budgets, goals, and import history.
4. Export a new JSON backup after validation.

## Private-sync recovery

Use this when the API container or volume is damaged:

1. Restore the `app-state` volume from backup.
2. Restart the `api` service.
3. Confirm `/healthz` responds successfully.
4. Reload the app and check the private sync status.

If the volume backup is unavailable:

1. Restore from the most recent browser-exported JSON backup.
2. Let the private-sync deployment upload that recovered state again.

## Corruption handling policy

- Do not overwrite a good browser-local state with an unreadable remote state.
- If private sync is degraded, continue operating locally and export a fresh JSON backup before further troubleshooting.
