# Local Workflow

This repo is split into two concerns:

- public code that can be pushed to GitHub
- private personal finance data that must stay local

Use separate folders and separate runtime state for those concerns:

- `SimpleSafeBanking`: public GitHub-safe worktree on `main`
- `SimpleSafeBanking-personal`: local-only worktree on `personal`

## Safe places for private data

Put real private files only in ignored locations such as:

- `private-data/`
- `personal-data/`
- `backups/`
- `exports/`
- `imports/`
- `PRIVATE_NOTES.md`

These are ignored by git and should never be committed.

## Branches

- `main`: public, GitHub-ready code
- `personal`: local-only branch for experiments or personal-only customizations

Rule:

- do not push `personal`

Create or repair the folder split with:

```bash
git worktree add ../SimpleSafeBanking-personal personal
```

If that folder already exists, check it with:

```bash
git worktree list
```

## Recommended development flow

### Public feature work

1. Start from `main`
2. Create a feature branch such as `feature/budget-improvements`
3. Build and test
4. Merge to `main`
5. Push `main` or the feature branch when you want it public

### Personal-only work

1. Work from `../SimpleSafeBanking-personal`
2. Keep local customizations on `personal`
3. Never push `personal`
4. If a change becomes worth publishing, recreate or cherry-pick only the safe code onto `main` or a public feature branch

## Runtime split

Public testing uses a separate client-only Docker profile:

```bash
scripts/public-test.sh start
```

- opens on `http://127.0.0.1:3178`
- does not start the private-sync API
- does not create or mount the private `app-state` volume

Personal daily use uses the private-sync Docker profile:

```bash
scripts/personal-app.sh start
```

- opens on `http://127.0.0.1:3176`
- uses Docker Compose project `ssb-personal`
- stores server-side local state in `ssb-personal_app-state`
- stop it with `scripts/personal-app.sh stop`, which keeps the volume

Do not use `docker compose down -v` in normal use. That deletes server-side state. If you intentionally need to erase the personal Docker volume, stop first, export a JSON backup from the app, run `scripts/backup-personal-volume.sh`, and then delete the volume manually.

## Private data rules

- never place real CSV exports in tracked folders like `src/`, `public/`, or the repo root
- never commit JSON backups created from your real app usage
- never commit private-sync volume dumps or copied server-state files
- browser `localStorage` is private runtime data and is not part of git
- before every push, run `git status`, `git diff --cached --stat`, and `scripts/privacy-scan.sh`

Install the local pre-push guard once per worktree:

```bash
scripts/install-git-hooks.sh
```

The hook blocks pushes from `personal` and runs the privacy scan before other pushes.

## Public demo data

Only `public/demo-revolut.csv` is intended to stay public.

If you need more test data, create it from synthetic values and place it in clearly named public demo files.

## Related docs

- [public-private-split.md](public-private-split.md)
- [security-checklist.md](security-checklist.md)
- [normalized-csv.md](normalized-csv.md)
- [deployment.md](deployment.md)
- [backup-runbook.md](backup-runbook.md)
