# SimpleSafeBanking

Local-first budgeting and expense tracking for people who use Revolut as their main spending card.

![SimpleSafeBanking preview](./src/assets/hero.png)

## What it does

SimpleSafeBanking turns Revolut CSV exports into a private dashboard for:

- monthly income, spend, and trend tracking
- category and vendor analysis
- month-aware budgets
- savings goals based on tracked account balances
- recurring transaction detection for subscriptions and bills
- multi-month daily spending heatmaps
- JSON and XLSX backup/export

## Who it is for

This project is aimed at people who:

- spend mostly through Revolut
- want a lightweight personal finance tool without a server
- prefer keeping their banking exports on their own machine
- want something easy to publish, fork, and adapt

## Privacy and local-first promise

- No backend
- No analytics
- No third-party data sync
- Data is stored in browser `localStorage`
- You can export a JSON backup anytime and restore it later

## Supported imports

The app currently supports:

- raw Revolut CSV exports with columns like `Started Date`, `Completed Date`, `Description`, `Amount`, `Type`, and `Currency`
- normalized/master CSV exports created by this app or manually cleaned to include `Date`, `Description`, `Category`, `Subcategory`, `Amount`, `Flow`, and `Type`

Import behavior:

- transactions are normalized before categorization
- vendor overrides are case-insensitive and punctuation-tolerant
- longer vendor rules win over shorter ones
- duplicate detection uses date, description, amount, type, flow, currency, and reference
- malformed and zero-value rows are skipped with tracked reasons

## Demo data

A synthetic sample file is included at [public/demo-revolut.csv](/Users/user/Desktop/IT/SimpleSafeBanking/public/demo-revolut.csv). It is safe to publish and useful for quick manual testing.

## Backup flow

Use the sidebar to:

- import a Revolut CSV
- export a JSON backup for personal restore
- export XLSX for spreadsheet review
- restore a previous JSON backup

Recommended personal workflow:

1. Import your newest Revolut CSV.
2. Adjust custom vendor mappings, budgets, accounts, and goals.
3. Export JSON after major updates.
4. Keep the JSON somewhere private as your local backup snapshot.

## Screens and features

- `Overview`: top KPIs, category mix, vendors, savings snapshot, upcoming bills
- `Monthly`: month trend or daily breakdown for a selected month
- `Vendors`: top merchants plus custom category mapping management
- `Budget`: budgets saved by month, with rollover-safe history
- `Heatmap`: multi-month daily spend intensity with day drilldown
- `Accounts`: tracked account balances and cashflow kept separate to avoid misleading “net worth” math
- `Goals`: savings targets based on entered balances
- `Recurring`: detected repeating charges and upcoming bill estimates

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run check
```

Production build:

```bash
npm run build
```

## Limitations

- Primary display currency is `RON`
- Recurring detection is heuristic, not guaranteed
- Account-based goals depend on balances you enter manually
- Revolut export formats can change, so parser support may need occasional updates
- Browser storage can be cleared by the user or the browser, which is why JSON backups matter

## Next roadmap candidates

- richer budget history comparisons
- split transactions
- mobile sidebar improvements
- tags and advanced filters
- liability/debt tracking
