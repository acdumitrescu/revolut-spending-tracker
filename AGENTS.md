# SimpleSafeBanking Agent Instructions

These instructions apply to any agent, assistant, or contributor working in this repository.

## Privacy-first rules

- Treat this repository as public-by-default.
- Never commit or publish real personal finance data.
- Never commit real Revolut CSV exports.
- Never commit JSON/XLSX backups generated from personal app usage.
- Never commit personal notes, credentials, tokens, or secrets.
- Browser `localStorage` data is private runtime data and must not be exported into tracked files.

## Safe locations for private local data

If the user needs to keep private files near the project, use only ignored local locations such as:

- `private-data/`
- `personal-data/`
- `backups/`
- `exports/`
- `imports/`
- `tmp-data/`
- `PRIVATE_NOTES.md`

These locations are local-only and must stay out of git.

## Branch policy

- `main` is the public GitHub-ready branch.
- `personal` is a local-only branch for private experiments or personal-only customizations.
- Do not push `personal`.
- Do not merge private-only changes into `main`.
- If a change from `personal` becomes publishable, recreate it or cherry-pick only the safe code onto `main` or a public feature branch.

## Development workflow

### Public work

1. Start from `main` or create a public feature branch from `main`.
2. Implement the change.
3. Run checks.
4. Review staged files carefully.
5. Commit and push only public-safe code.

### Private/local-only work

1. Switch to `personal`.
2. Keep private customizations local.
3. Never push that branch.

## File handling rules

- Do not place real data files in tracked folders such as `src/`, `public/`, or the repository root.
- Only synthetic demo data may live in the repository.
- `public/demo-revolut.csv` is safe demo data and may remain public.

## Before any commit or push

Always check:

1. `git status`
2. `git diff --cached --stat`

If staged files look like personal finance data, backups, or local notes, stop and remove them from staging.

## Agent behavior requirement

Any agent working in this repository must follow these rules and prioritize privacy over convenience.
When in doubt, assume a file is private and keep it out of git until the user explicitly confirms it is safe to publish.
