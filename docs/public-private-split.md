# Public and Personal Split

SimpleSafeBanking uses separate Git worktrees and separate Docker runtimes so public GitHub work cannot accidentally share your private app state.

## Folders

- `SimpleSafeBanking`: public worktree on `main`
- `SimpleSafeBanking-personal`: local-only worktree on `personal`

Check the split with:

```bash
git worktree list
```

If the personal folder is missing, recreate it from the public worktree:

```bash
git worktree add ../SimpleSafeBanking-personal personal
```

## Public Testing

Use this from the public `main` worktree when you want to test GitHub-safe code:

```bash
scripts/public-test.sh start
```

Open:

```text
http://127.0.0.1:3178
```

This profile is client-only. It does not start the private-sync API and does not mount a private Docker volume.

Stop it with:

```bash
scripts/public-test.sh stop
```

## Personal Daily Use

Use this from the `SimpleSafeBanking-personal` worktree:

```bash
scripts/personal-app.sh start
```

Open:

```text
http://127.0.0.1:3176
```

This profile runs Docker Compose project `ssb-personal` and stores server-side local state in the `ssb-personal_app-state` volume.

Stop it with:

```bash
scripts/personal-app.sh stop
```

Do not use `docker compose down -v`, `docker volume rm`, or Docker volume prune in normal use. Those commands can delete private app state.

## Backups

Use browser JSON export after meaningful changes. Keep exported files in ignored folders such as `backups/` or `exports/`.

For the personal Docker volume, run from the personal worktree:

```bash
scripts/backup-personal-volume.sh
```

The backup is written under `backups/`, which is ignored by git.

Recovery preference:

1. Restore a browser-exported JSON backup.
2. Restore the personal Docker volume backup.
3. Troubleshoot manually without deleting volumes first.

## Push Guardrails

Install the pre-push hook once per worktree:

```bash
scripts/install-git-hooks.sh
```

The hook blocks pushes from `personal` and runs:

```bash
scripts/privacy-scan.sh
```

Before committing or pushing public work, check:

```bash
git status
git diff --cached --stat
scripts/privacy-scan.sh
```

Public branches may contain code, docs, and synthetic demo data only. Personal finance exports, backups, notes, credentials, and copied runtime state must stay in ignored local paths.
