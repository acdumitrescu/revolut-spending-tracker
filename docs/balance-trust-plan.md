# Balance trust improvements

1. Balance-entry safeguards: implemented. Large changes require explicit confirmation; clearing an existing balance requires confirmation. Undo restores the last balance edit while that account editor remains open, and rejects undo if the value has changed again.
2. Explicit account groups: implemented. Legacy names seed an initial group; Accounts → Balances → Account settings allows editing it. Saved choices drive overview grouping and Excel exports.
3. Net-worth audit: implemented. Expand “How net worth is calculated” on Overview for signed contributions, original currencies, configured FX rates, balance dates, and missing/older/future-entry warnings. Brokerage balances may include brokerage cash. Portfolio holdings and instalment schedules are not counted twice.
4. Recovery: existing password-protected recovery folder successfully reverified on 2026-10-05 without Keychain decryption. Off-device copying remains pending a user-selected destination. This verifies the existing backup snapshot, not subsequent changes to the live database.

Validation: npm run check passed: 283 frontend, 42 backend, 8 Git privacy tests; lint, production build, bundle budget and privacy scan passed. All work remains local on personal; no push.
