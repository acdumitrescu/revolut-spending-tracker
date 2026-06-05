# Normalized CSV Format

The normalized CSV format is the stable manual import option for SimpleSafeBanking.

Use it when:

- you want a predictable import shape
- you cleaned data outside the app
- you want to transform another bank export into the app format manually

## Required columns

- `Date`
- `Description`
- `Category`
- `Subcategory`
- `Amount`

## Optional columns

- `Flow`
- `Type`
- `Currency`
- `Reference`

## Column rules

- `Date` must be a valid date; `YYYY-MM-DD` is recommended
- `Description` should be the merchant or transaction label
- `Category` and `Subcategory` are used as-is if present
- `Amount` must be numeric; expenses are negative and credits are positive
- `Flow` should be `Credit` or `Debit`; if missing, the app falls back to the amount sign
- `Currency` is optional; if missing, the app treats the row as `RON`
- `Reference` is optional but helpful for dedupe and traceability

## Example

```csv
Date,Description,Category,Subcategory,Amount,Flow,Type,Currency,Reference
2026-01-05,Salary,Income,Income,6500,Credit,Bank Transfer,RON,salary-jan
2026-01-06,Uber,Transport,Taxi,-45,Debit,Card Payment,RON,ride-001
2026-01-07,Netflix,Subscriptions,Entertainment,-55,Debit,Card Payment,RON,sub-001
```

## Notes

- normalized CSV is parsed locally in the browser
- this format is intended for clean manual imports, not raw Revolut export preservation
- if you are importing a raw Revolut export, use the CSV directly and let the profile parser detect it
