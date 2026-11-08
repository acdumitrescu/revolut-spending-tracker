# Manual BRD activity

In Accounts → Income & allocation, use Add income, Add expense or Add transfer
inside the BRD section. The transaction-type selector also supports refunds and
cash withdrawals. Amounts are positive RON values with at most two decimal places.

Manual and CSV entries share monthly totals, charts and transaction history.
Manual rows have Edit and Delete controls; deletion requires confirmation.
Saving uses the existing encrypted workspace sync and its save/error indicator.
Wait for Saved before closing. Existing portable backups and encrypted recovery
copies include manual rows and their notes.

Activity entries never change confirmed account balances or destination accounts.
The separate manual receipt/allocation planner is not copied into this ledger.

## Later statement imports

New statement rows with the same date, amount and money direction as a manual row
require a review decision: keep both or replace a specific manual row. Descriptions
are displayed to help decide, not used to silently merge. A manual row can replace
only one imported row. Replacement retains its notes while preserving statement
details. Recovery and import backups complete before the state is committed.

Matching uses exact dates; booking-date differences require manual review. The
statement has no unique bank transaction IDs, so occurrence-based CSV deduplication
cannot establish identity across exports containing different subsets of otherwise
identical payments. Reimporting the same statement remains idempotent.
