# SimpleSafeBanking

Privacy-first, local-first expense tracking for people who use Revolut as their main spending card.

SimpleSafeBanking turns Revolut CSV exports into a personal finance dashboard that stays on your machine. It is built for people who want a practical budgeting and spending tool without handing banking data to a SaaS backend.

![SimpleSafeBanking preview](./src/assets/hero.png)

## Why this exists

Most personal finance apps ask for account connections, cloud sync, or a full “all your money in one platform” commitment.

SimpleSafeBanking takes the opposite approach:

- import your Revolut CSV
- keep your data in the browser on your own device
- track spending, budgets, vendors, savings, and trends
- export your own backups whenever you want

It is intentionally simple, private, and easy to fork or adapt.

## Who it is for

This app is a strong fit if you:

- use Revolut as your main spending card
- want to understand spending patterns quickly
- prefer local ownership over cloud sync
- want a lightweight personal finance tool that can be published, forked, and extended

## What makes it different

- Local-first by default: no public backend requirement, no forced sync, no account-linking flow
- Revolut-focused import workflow: optimized around CSV exports instead of open banking integrations
- Privacy-oriented data model: your runtime data stays in browser storage unless you choose to export it
- Multi-currency aware: supports FX-based display conversion and per-account currencies without changing the app’s local-first model

## Feature highlights

- Revolut CSV import with validation and dedupe
- Monthly income and expense tracking
- Category and vendor analysis
- Multi-month daily spending heatmap
- Month-aware budgets
- Savings goals based on tracked balances
- Recurring bill detection
- Multi-currency account tracking
- Manual portfolio tracking with opt-in Yahoo market-price refresh in private-sync deployments
- Display currency switching for `RON`, `EUR`, and `USD`
- JSON backup/restore
- Excel workbook export for spreadsheet review

## How it works

1. Export transactions from Revolut as CSV.
2. Import the file into SimpleSafeBanking.
3. Review monthly trends, vendors, categories, budgets, and recurring charges.
4. Add tracked accounts, balances, and savings goals.
5. Export JSON backups to keep your own private restore points.

## Privacy and local-first promise

- Browser-local by default
- No analytics
- No forced account connection
- No third-party sync requirement
- Data is stored in browser `localStorage` in `client-only` mode
- Optional private-sync deployment is available for self-hosted use without turning the product into a public SaaS
- Backup and restore are controlled by the user

For public vs private workflow guidance, see [docs/local-workflow.md](docs/local-workflow.md).
For the two-folder public/personal setup, see [docs/public-private-split.md](docs/public-private-split.md).
For a publishing and backup safety checklist, see [docs/security-checklist.md](docs/security-checklist.md).

## Supported imports

Current supported import paths:

- raw Revolut CSV exports
- Revolut business transaction statement CSV exports
- Revolut business expense CSV exports
- normalized CSV files using the app’s cleaned transaction shape
- app backup restore through JSON

Current import behavior:

- validates CSV extension, non-empty content, and a 10 MB size limit before parsing
- reviews ready, duplicate, and invalid rows before committing any transaction
- excludes exact duplicates already stored or repeated inside the selected file
- provides row-level rejected details and a downloadable CSV review report
- provides a downloadable normalized CSV template for manual transformations
- records confirmed imports in reversible local history

- dates, amounts, flow, and currency are normalized before analytics
- format detection is profile-based rather than one fixed CSV assumption
- localized and expanded Revolut header sets are supported where known
- vendor overrides are case-insensitive and punctuation-tolerant
- stronger and longer vendor rules win over broader ones
- duplicate detection uses date, description, amount, type, flow, currency, and reference
- malformed rows and zero-value rows are skipped with tracked reasons
- source transaction currency is preserved where available
- import summaries include detected profile, skip reasons, and warnings

The normalized CSV fallback format is documented in [docs/normalized-csv.md](docs/normalized-csv.md).

## Currency support

- Base currency for app-managed calculations is `RON`
- Supported display currencies are `RON`, `EUR`, and `USD`
- Accounts can each have their own stored currency
- FX conversion uses the latest saved rates, not historical transaction-day rates
- Mixed-currency datasets are converted through saved FX rates while keeping source currency visible in transaction-level views

## Screens

- `Overview`: top KPIs, spending trends, category mix, vendors, savings snapshot, upcoming bills
- `Monthly`: monthly bar trend or daily bar breakdown, with income/expense series filters
- `Categories`: expense totals by category
- `Vendors`: top merchants plus custom category mapping management
- `Transactions`: searchable transaction history with source currency visibility
- `Accounts`: tracked balances, per-account currency, and cashflow kept separate from implied net worth
- `Budget`: month-aware planning, non-destructive prior-month copying, spending progress, over-budget visibility, and month-over-month comparisons
- `Heatmap`: multi-month spending intensity with daily drilldown
- `Forecast`: savings and expense planning based on tracked balances and current assumptions
- `Goals`: savings targets based on entered balances
- `Recurring`: repeating charges and bill estimates
- `Portfolio`: manual holdings, per-account currency summaries, and optional market-price refresh

## Portfolio price updates

Portfolio prices are manual by default. In a `private-sync` deployment, the Portfolio page can request
best-effort quotes from Yahoo through the authenticated backend:

- Yahoo symbols are configurable per holding (for example, `TLV.RO` for a Bucharest-listed symbol)
- the holding form includes an offline BVB shares catalog (regulated market and AeRO) plus curated common global stocks and ETFs
- when no local match is suitable, an explicit Yahoo search can find an instrument and save its chosen symbol locally
- only quote symbols are sent to Yahoo; quantities, costs, accounts, and calculated portfolio values are not
- successful quotes are cached by the server for 15 minutes
- refresh is manual unless the user enables the session-only 15-minute refresh option
- a returned quote is ignored when its currency differs from the holding currency
- saved manual or previous prices remain active whenever a lookup fails

This uses an unofficial Yahoo Finance endpoint, so quotes may be delayed, unavailable, or changed without
notice. It is not a trading feed and should not be treated as real-time market data.

Refresh the checked-in BVB share catalog when needed with:

```bash
npm run build:bvb-instruments
```

The catalog is public market-reference data only; it contains no personal holdings or transactions.

## Demo data and screenshots

- Public demo CSV: [public/demo-revolut.csv](public/demo-revolut.csv)
- Current preview image: [src/assets/hero.png](src/assets/hero.png)

## Public demo publishing

The safest public demo shape for this project is `client-only`:

- deploy the frontend as a static site
- keep `VITE_DEPLOYMENT_PROFILE=client-only`
- keep `VITE_PRIVATE_SYNC_ENABLED=false`
- do not deploy the `private-sync` backend for a public demo
- for Netlify, use the included `public/_redirects` SPA rewrite

Public demo visitors can:

- explore the bundled synthetic sample data
- upload their own CSV locally in the browser

In this demo mode:

- uploaded CSV data is not stored on a public server
- app state remains in browser storage on that device
- users should export a JSON backup before leaving if they imported personal data
- browser-local data may be lost if storage is cleared or the user returns on another device

Recommended future screenshot set for GitHub:

- import flow
- overview dashboard
- monthly analysis
- accounts + FX settings
- backup/export flow

## Backup flow

Use the sidebar to:

- import a Revolut CSV
- restore a JSON backup
- export a JSON backup
- export an Excel workbook

Recommended personal workflow:

1. Import your latest Revolut CSV.
2. Review vendor mappings, budgets, accounts, and goals.
3. Export JSON after important updates.
4. Keep your exported backups in a private local location.

## Deployment profiles

SimpleSafeBanking supports two deployment profiles:

- `client-only`: static frontend only, strongest local-first posture
- `private-sync`: static frontend plus a single-tenant private sync API for self-hosted deployments

See [docs/deployment.md](docs/deployment.md) and [docs/backup-runbook.md](docs/backup-runbook.md).

## Docker localhost

For private local use without running Vite or Node manually:

```bash
export SSB_SYNC_TOKEN="$(openssl rand -hex 32)"
scripts/personal-app.sh start
```

Then open `http://127.0.0.1:3176` and enter the token in Settings.

The personal Docker profile serves the production frontend through nginx, keeps the API internal to Compose, and stores private sync data in the `ssb-personal_app-state` Docker volume. Stop it with:

```bash
scripts/personal-app.sh stop
```

For GitHub-safe public testing with no API and no private sync volume:

```bash
scripts/public-test.sh start
```

Then open `http://127.0.0.1:3178`.

Only run a Docker volume delete command when you intentionally want to erase private sync state.

## Development

```bash
npm install
npm run dev
```

For the personal test environment, use filesystem-backed private persistence instead of browser-only development mode:

```bash
npm run setup:personal-dev
export SSB_SYNC_TOKEN="$(openssl rand -hex 32)"
npm run dev:personal
```

After the token has been saved to `private-data/dev-sync/session-token`, start both services and open the app with:

```bash
npm run local
```

For background start/stop commands, point a shell alias named `ssb` at `scripts/ssb-local.sh`, then use:

```bash
ssb start
ssb stop
```

`ssb start` opens the Overview at `http://127.0.0.1:5173/app`. In this trusted loopback workflow, Vite adds the saved bearer token to `/api/*` requests server-side, so the browser never receives or stores it. Direct requests to port `3177` still require authentication. Private state stays under ignored `private-data/dev-sync/`, is written atomically, and retains a last-known-good `.bak` copy. A populated server remains authoritative during bootstrap so empty or stale browser storage cannot overwrite it.

Every confirmed real CSV import must first create a portable JSON backup under ignored `backups/automatic/`; the import is not committed if that backup fails. Use **Import & backup → Create backup now** for an on-demand server backup. Synthetic demo imports, backup restoration, `ssb start`, and `ssb stop` do not create automatic backups.

Checks:

```bash
npm run check
```

Production build:

```bash
npm run build
```

## Current limitations

- Import is optimized for Revolut-first workflows, not every bank format
- Revolut export formats and localized headers can still evolve, so parser coverage will continue to improve
- FX conversion uses latest saved rates, not historical rates
- Savings goals depend on balances you enter manually
- Recurring detection is heuristic, not guaranteed
- Browser storage can be cleared, so backups still matter
- The app is intentionally local-first and does not yet provide encrypted sync
- Private-sync is designed for private self-hosted deployments, not public multi-user hosting
- FX refresh uses a latest-rate request and is optional; the app keeps working with saved local rates if that request fails

## Next up

- stronger Revolut parser coverage and import summaries
- better normalized CSV import documentation
- budgeting v2 follow-up with explicit rollover and category-funding rules
- better filtering, search, and recurring transaction refinement
- clearer forecast assumptions and UX wording

## Later / possible expansions

- optional adapters for more banks or cards
- split transactions and tags
- stocks tracking module
- crypto tracking module
- advanced reporting/export packs
- optional encrypted backup or sync workflows

## Product direction

Longer-term roadmap and monetization notes are documented in [docs/product-direction.md](docs/product-direction.md).

## License

This project is licensed under [CC BY-NC-SA 4.0](LICENSE).
Copyright (c) 2026 SimpleSafeBanking contributors. Non-commercial use only.
