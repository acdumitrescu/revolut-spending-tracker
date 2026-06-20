# Security and Privacy Checklist

Use this checklist before sharing, pushing, or publishing anything from SimpleSafeBanking.

## What stays local

- transaction data imported from CSV
- custom vendor mappings
- tracked accounts and balances
- budgets and goals
- FX settings and display currency preference
- backup JSON content until you export it yourself

By default, this data lives only in your browser `localStorage`.

If you enable the private-sync deployment profile, a versioned copy of the app state may also be written to your own private server.

## What leaves the browser

- nothing from your transaction or account data is uploaded by default in `client-only` mode
- in `private-sync` mode, the versioned app state may sync to your own private deployment
- the only intended network request is optional FX refresh for `RON -> EUR/USD` rates
- if FX refresh fails, the app continues using saved local rates

## What export actions do

- `Export JSON` writes a full personal backup file to your machine
- `Export Excel` writes a workbook version of your local app data to your machine
- `Restore Backup JSON` reads a local file back into the browser
- `Import Revolut CSV` parses the CSV locally in the browser
- private-sync stores one private state blob for your deployment rather than creating public user accounts

Treat exported JSON and Excel files as private personal data.

## Safe places for private files

Keep real personal data only in ignored local paths such as:

- `imports/`
- `exports/`
- `backups/`
- `private-data/`
- `personal-data/`
- `PRIVATE_NOTES.md`

Do not place real personal files in tracked locations such as:

- `src/`
- `public/`
- the repository root

## Before commit or push

Always check:

1. `git status`
2. `git diff --cached --stat`

Stop if you see:

- real Revolut CSV exports
- personal JSON or Excel backups
- local notes with account details
- any secrets, tokens, or credentials

## Publishing defaults

- `main` should stay public-safe
- `personal` should stay local-only
- synthetic demo data is safe to publish
- browser `localStorage` is runtime-only and should never be copied into tracked files
