# Local Workflow

This repo is split into two concerns:

- public code that can be pushed to GitHub
- private personal finance data that must stay local

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

## Recommended development flow

### Public feature work

1. Start from `main`
2. Create a feature branch such as `feature/budget-improvements`
3. Build and test
4. Merge to `main`
5. Push `main` or the feature branch when you want it public

### Personal-only work

1. Switch to `personal`
2. Make local customizations that you do not want on GitHub
3. Never push `personal`
4. If a change becomes worth publishing, recreate or cherry-pick the safe parts onto `main` or a public feature branch

## Private data rules

- never place real CSV exports in tracked folders like `src/`, `public/`, or the repo root
- never commit JSON backups created from your real app usage
- never commit private-sync volume dumps or copied server-state files
- browser `localStorage` is private runtime data and is not part of git
- before every push, run `git status` and `git diff --cached --stat`

## Public demo data

Only `public/demo-revolut.csv` is intended to stay public.

If you need more test data, create it from synthetic values and place it in clearly named public demo files.

## Related docs

- [security-checklist.md](security-checklist.md)
- [normalized-csv.md](normalized-csv.md)
- [deployment.md](deployment.md)
- [backup-runbook.md](backup-runbook.md)
