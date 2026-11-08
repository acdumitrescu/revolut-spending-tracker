# 0004: Desktop data lives in Application Support, copied once from dev-sync

- Status: Accepted
- Date: 2026-11-01

## Context

The personal dev build stores its encrypted workspace, users and backups in `private-data/dev-sync/` inside the repo. A desktop app shouldn't depend on a repo checkout. Two processes writing the same SQLCipher files at once (dev run and app) could corrupt data.

## Decision

- The desktop app keeps its data in `~/Library/Application Support/SimpleSafeBanking/`: the workspace database, `users/` and `backups/`. Directories are created with mode `0700`.
- Logs go to `~/Library/Logs/SimpleSafeBanking/`.
- `scripts/desktop/importDevData.mjs` copies the **local-users data** (`users/users.json` plus each `users/<uuid>/` with its database and backups) across **once**. It refuses to run while either app is running, archives the source first, verifies the copy, and never deletes the source.
- The desktop backend always runs in local-users mode. Each user's database key is wrapped with that user's password and stored in the registry, so the **app needs no Keychain access and no Keychain helper**. The Keychain is used only by the one-time legacy single-user migration (`docs/local-users.md`). A legacy-only workspace must be migrated with the dev launcher before it's imported.

## Consequences

- The dev setup and the app can run at the same time without sharing files.
- After the import, the two copies drift apart. The app copy is the real one. Dev-sync becomes test data.
- Backups for the app copy go to the app folder, not to the repo's `backups/`.
