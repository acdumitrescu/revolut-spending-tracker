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

- Local-first by default: no backend, no forced sync, no account-linking flow
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

- No backend
- No analytics
- No forced account connection
- No third-party sync requirement
- Data is stored in browser `localStorage`
- Backup and restore are controlled by the user

For public vs private workflow guidance, see [docs/local-workflow.md](/Users/user/Desktop/IT/SimpleSafeBanking/docs/local-workflow.md).
For a publishing and backup safety checklist, see [docs/security-checklist.md](/Users/user/Desktop/IT/SimpleSafeBanking/docs/security-checklist.md).

## Supported imports

Current supported import paths:

- raw Revolut CSV exports
- Revolut business transaction statement CSV exports
- Revolut business expense CSV exports
- normalized CSV files using the app’s cleaned transaction shape
- app backup restore through JSON

Current import behavior:

- dates, amounts, flow, and currency are normalized before analytics
- format detection is profile-based rather than one fixed CSV assumption
- localized and expanded Revolut header sets are supported where known
- vendor overrides are case-insensitive and punctuation-tolerant
- stronger and longer vendor rules win over broader ones
- duplicate detection uses date, description, amount, type, flow, currency, and reference
- malformed rows and zero-value rows are skipped with tracked reasons
- source transaction currency is preserved where available
- import summaries include detected profile, skip reasons, and warnings

The normalized CSV fallback format is documented in [docs/normalized-csv.md](/Users/user/Desktop/IT/SimpleSafeBanking/docs/normalized-csv.md).

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
- `Budget`: month-aware budgets with progress and over-budget visibility
- `Heatmap`: multi-month spending intensity with daily drilldown
- `Forecast`: savings and expense planning based on tracked balances and current assumptions
- `Goals`: savings targets based on entered balances
- `Recurring`: repeating charges and bill estimates

## Demo data and screenshots

- Public demo CSV: [public/demo-revolut.csv](/Users/user/Desktop/IT/SimpleSafeBanking/public/demo-revolut.csv)
- Current preview image: [src/assets/hero.png](/Users/user/Desktop/IT/SimpleSafeBanking/src/assets/hero.png)

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

## Development

```bash
npm install
npm run dev
```

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
- FX refresh uses a latest-rate request and is optional; the app keeps working with saved local rates if that request fails

## Next up

- stronger Revolut parser coverage and import summaries
- better normalized CSV import documentation
- budgeting v2 polish and richer monthly comparisons
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

Longer-term roadmap and monetization notes are documented in [docs/product-direction.md](/Users/user/Desktop/IT/SimpleSafeBanking/docs/product-direction.md).
