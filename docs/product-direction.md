# Product Direction

## Positioning

SimpleSafeBanking should stay focused on one public promise:

`A privacy-first, local-first finance tracker for people who use Revolut as their main spending card.`

That positioning should stay stronger than broader labels like “all-in-one finance platform” or “investment super app”.

## Product roadmap

### Phase A: Import flexibility and parser depth

Goal: make the app more trustworthy and easier to adopt.

Priority work:

- support more Revolut export variants
- improve validation and import error messaging
- add better import result summaries
- document normalized CSV import clearly
- evaluate whether previous exported spreadsheet formats should become importable

Parsing options should evolve in this order:

- raw Revolut CSV
- normalized CSV template
- backup JSON restore
- optional future import adapters for other banks/cards

### Phase B: Budgeting and analysis depth

Goal: make the core spending workflow stronger before broadening the product.

Priority work:

- budgeting v2 polish
- better monthly comparisons
- improved filters and search
- recurring detection improvements
- clearer forecast assumptions and explanations

### Phase C: Adjacent finance modules

Goal: broaden carefully without losing the product identity.

Potential later modules:

- manual stocks tracking
- manual crypto tracking
- cost basis snapshots
- separate asset dashboard cards

These should remain secondary to the spending and budgeting workflow.

## Monetization direction

### Core idea

Use the public GitHub project as a trust and acquisition channel, then monetize a more polished consumer product.

### Preferred business path

Build toward a paid consumer app or premium edition rather than a backend-heavy SaaS.

Possible premium value:

- advanced import adapters
- richer forecasting
- investment tracking modules
- advanced reports and export packs
- encrypted backup/sync features
- more powerful filtering and analytics

### Important constraint

Do not undermine the local-first trust model just to monetize.

Avoid monetization that depends on:

- forced cloud storage of financial data
- mandatory account linking
- surveillance-style analytics

### Near-term validation

Watch for signals from users and GitHub traffic around:

- privacy-first expense tracking
- multi-currency budgeting
- Revolut-specific convenience

Those signals should decide which premium features are worth building first.
