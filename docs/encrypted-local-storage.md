# Encrypted local storage

> For the current encrypted personal launcher, see [Local users](local-users.md). It uses separate password-unlocked profiles and per-user recovery downloads. The single-user paths and commands below describe the earlier workflow.

The personal macOS launcher uses SQLCipher when `private-data/dev-sync/encrypted-storage.enabled` exists. The database is `private-data/dev-sync/workspace.ssbdb`. The 32-byte random key is held in macOS Keychain, retrieved through the local native helper over a pipe, never through a browser variable, URL, command argument or log. Keychain may request approval. Unlocking the macOS login session is still required.

The browser loads the database before allowing edits and does not write new financial state to localStorage in this profile. Existing browser copies are deliberately not erased. The API uses revision-checked transactions, schema validation, parameterized SQL, account/credit foreign keys and integer monetary columns. API changes are field-scoped; the initial implementation still rewrites normalized collections within one SQL transaction. This is not a multi-user server or a same-user-malware defense.

## Backups and recovery

Confirmed real imports and Create backup now produce encrypted `.ssbdb` files under `backups/automatic/`, with private directory/file permissions. Import batch IDs provide idempotency. Import & backup can list these files and preview/restore their app state. Before restoring, the current app state is backed up. Vendor observations are retained in encrypted backup documents; the app-state restore preview does not replace those observations.

Migration keeps the original JSON and legacy backups untouched. These copies and manual JSON/XLSX downloads are **not encrypted**. Existing browser data also remains until explicitly cleared. Do not publish or commit any private data, database, helper runtime, key or backup.

The Keychain key is device-local. Losing both this Mac and its key makes encrypted backups unreadable. An off-device key recovery arrangement must be chosen before deleting legacy recovery copies. Never store an unencrypted key beside the database. There is no automatic key rotation or backup deletion.

## Setup and migration

Install backend dependencies, run `node scripts/buildKeychain.mjs`, create the key once using `private-data/runtime/ssb-keychain create`, stop the local launcher, then run `node scripts/migrateEncrypted.mjs --activate`. Migration refuses an existing destination and verifies full app-state reconciliation, integrity and an encrypted recovery backup before enabling the launcher marker. Do not run the helper's `read` action in a terminal: it outputs secret key bytes for the parent process only.

Start normally with `ssb start`. If migration or Keychain access fails, do not delete or overwrite any database/key. Inspect the failure first. Removing the activation marker after new database edits would expose stale JSON, not safely roll back those edits.

## Other deployments

Public/client-only behavior is unchanged. Docker private sync retains its original JSON mode; the macOS Keychain profile is not enabled there. For a custom reverse-proxy deployment set `SSB_ALLOWED_HOSTS` to the exact forwarded Host values and `ALLOWED_ORIGINS` to the trusted origins. The local development token-injecting proxy is restricted to loopback, allowed origins and the application's custom request header. Direct API access still requires its bearer token.

## Save a recovery key in Apple Passwords

Run `npm run recovery:setup` from the personal checkout. A native local window copies a versioned recovery key after you click Copy. Create a **private** Apple Passwords entry for `ssb-recovery.invalid`, username `local-personal-v1`, and paste the value into its Password field. The `.invalid` address is only a label, not a website to visit. Keep the entry out of shared groups.

Save the entry, return to the recovery window and click Saved. The original clipboard copy is cleared; copy the password from the saved entry and paste it into the verification field. The tool authenticates and reconciles a disposable copy of the newest encrypted backup with that pasted key. It never changes the live database or existing Keychain key. Cancellation or a mismatch records no new success. Clipboard clearing preserves unrelated copies; the initial copy expires after two minutes while the window is running. Clipboard managers may retain copies despite the concealed/transient hints.

Only a non-secret receipt is saved at `private-data/dev-sync/recovery-verification.json`. This proves a pasted key opened the named backup at that time, not that iCloud sync or disaster recovery on another device is available. Confirm the entry is visible on another trusted Apple device with Passwords sync enabled, and keep an encrypted `.ssbdb` backup off this Mac. Do not remove the old recovery copies yet.

The key format is `SSB1-` followed by 64 lowercase hex characters, a hyphen, and an eight-character SHA-256 checksum. The middle field encodes the original 32 SQLCipher key bytes; the checksum is the first four SHA-256 bytes. It is not an app login password. Recovery on a replacement Mac must decode and validate this value, authenticate a backup copy, and feed those 32 bytes privately to the existing `ssb-keychain restore` helper. The helper refuses to replace an existing key. Do not paste the key into a terminal command, chat, source file, or environment variable.

The recovery setup requires the same Node/backend dependencies and Xcode command-line compiler as the encrypted personal profile. It does not install tools or change macOS system files.

## Password-protected recovery copy

Run `npm run recovery:password`. Choose a unique recovery password (16–256 UTF-8 bytes) in the native window and type it twice. Save that password separately in Apple Passwords. No long database key needs to be copied. Existing app unlock, Keychain items, and live data are unchanged.

The tool copies the most recent encrypted backup and protects the database key with AES-256-GCM and a random salt/nonce, using scrypt (N=131072, r=8, p=1) to derive the wrapping key. It rereads the encrypted key file, decrypts it with the password, and authenticates and reconciles the copied database before writing a success receipt. Wrong passwords and tampering fail closed. There is no plaintext key file.

The resulting unique folder under `backups/recovery/` contains `recovery-key.ssbkey`, `backup.ssbdb`, a non-secret verification receipt, and instructions. Finder opens the folder after success. Copy the **entire folder** to a separate trusted device or offline drive; the initial folder is still on this Mac. This protects the selected backup snapshot, not later edits. Create a fresh app backup and repeat when a current recovery snapshot is needed.

To test a copied folder independently of Keychain, run `npm run recovery:password -- --verify "/path/to/recovery-folder"`. This prompts for the password locally and verifies a temporary backup copy. It never installs or replaces a Keychain key or restores over live data. Preserve original recovery copies until off-device file storage and password availability are confirmed. An interrupted setup may leave an encrypted folder without a verification receipt; do not treat that as verified.
