# Local users on one computer

The encrypted personal launcher now opens a user login screen. This release is local-only; it is not a remote-access server or an operating-system security boundary.

## First use

Open SSB and choose a name and a password of at least 16 characters (maximum 256 UTF-8 bytes). Save the password in your password manager. On a computer with an existing single-user workspace, the first setup must preserve that workspace. No other user can be created before that step.

First-user setup unlocks the original database through the existing Keychain helper, verifies it, creates a verified backup with its original encryption key, and copies its finances and vendor observations into the first user's database under a new random key. The copied state and a separate backup are verified before the user registry is activated. The original database and earlier backups are retained. From then on the launcher does not unlock the old Keychain database at startup. Incomplete setup directories are never published as users.

Subsequent users start empty. User names are unique without regard to case. User selection and names are visible at the login screen; financial data requires the corresponding password.

## Locking and switching

Use **Lock / Switch user** in the top bar. The workspace is hidden and made noninteractive while pending changes save. Successful locking revokes that window's server session, closes its database connection once in-flight requests finish, clears its key buffer, and reloads the document to release application state and caches. Session tokens exist only in browser memory; a page reload requires a password again. JavaScript cannot guarantee that every freed memory page is overwritten.

After about 14 minutes without interaction, the browser starts the same save-and-lock flow. The server independently expires sessions after 15 minutes without a request and after 12 hours regardless of activity. Background polling alone does not prevent the browser's inactivity lock. Multiple windows have independent sessions: lock each window you leave open.

Exception: the trusted loopback development launcher (`ssb start`) disables both
idle and maximum-duration expiry using `SSB_DEV_DISABLE_AUTO_LOCK=true` alongside
`SSB_TRUSTED_DEV_PROXY=true`, accepted only on `127.0.0.1`. An unattended open
development window stays unlocked. Manual Lock / Switch user, browser close/reload
locking and server-restart invalidation remain active. Other deployments retain
the default timers.

If a save fails, the hidden window retains its unsaved edits. Retry saving and locking, or enter that same user's password to resume. If the saved database changed in another window, the pending draft is backed up before the current server state is loaded. These recovery snapshots are available through Import & backup. Do not close a window reporting unsaved changes until they are saved or backed up.

## Recovery

While unlocked, choose **Download recovery copy**. This first saves pending edits, creates and verifies an encrypted snapshot, then downloads a `.ssbuser` file containing that encrypted database and its password-wrapped key. Keep it off this computer. The user name and snapshot date are readable metadata; financial data and the database key remain encrypted.

Keep the user's password separately in Apple Passwords or your chosen password manager. There is no password-reset bypass. A recovery file without its password is not enough, and a password without a database or recovery file is not enough. Recovery covers the downloaded snapshot, not future edits.

From the login screen choose **Restore recovery copy**, select the `.ssbuser` file, choose a new unique user name, and enter the password used for the copy. SSB authenticates the file, checks database integrity and the backup digest, then creates a separate profile with a fresh random database key. It does not overwrite another user's finances. On a computer with unclaimed legacy data, first preserve that data in the initial profile. On a fresh installation without a legacy database, recovery can create the first profile directly.

The older `recovery:password` and `recovery:setup` creation commands refuse to create stale single-user recovery copies once users are active. `recovery:password -- --verify ...` can still verify an older recovery folder. Old recovery folders remain valid for their original snapshots.

## Storage and isolation

- Registry: `private-data/dev-sync/users/users.json` contains UUIDs, display names, creation dates and password-wrapped keys.
- Per-user database: `private-data/dev-sync/users/<uuid>/workspace.ssbdb`.
- Per-user backups: `private-data/dev-sync/users/<uuid>/backups/`.
- Private directories are 0700 and database/registry files are 0600. These paths and `.ssbuser` downloads are ignored by Git.
- Each profile has an independent random SQLCipher key, wrapped with the existing scrypt/AES-256-GCM recovery format. No plaintext passwords or keys are saved in the registry.
- Every financial API, including vendor observations, quotes, imports and backups, requires a session. Its server-side identity selects the database through an async request context. Browser-supplied user IDs never select financial storage.
- Creation/unlock attempts are rate-limited, and expensive password operations are serialized. Corrupt user registries fail closed.

Someone controlling the shared macOS account, modifying the application, or accessing another user's unlocked session is outside this isolation boundary. Use separate macOS accounts for stronger separation. Do not expose this release on a network; the personal launcher and local-user server require loopback binding.

## Validation

Synthetic tests cover first-user migration, unchanged source database, empty second users, independent keys, per-user observations and backups, spoofed user IDs, wrong passwords, rate limits, session expiry and revocation, in-flight request leases, restart persistence, corrupt registry handling, recovery authentication and restore into a fresh profile. Frontend tests cover the login gate, repeated-password validation and password-protected resumption after a failed save. All 339 tests, lint, build, bundle budget and privacy checks passed. Browser checks used a separate synthetic database and ports, confirmed an empty second user and verified an immediate balance edit survived locking and switching. No real balance was changed for testing.

Next stages can build on the stable user IDs and request boundary, but remote login, shared finances, administration, user deletion and password changes are outside this first release.

## Temporary password testing mode

The ignored marker `private-data/dev-sync/weak-passwords.testing` enables a four-character minimum in the personal launcher. The login screen labels this testing mode. Remove the marker and restart SSB to require strong passwords for newly created users again. Existing test passwords remain valid, including their recovery copies; disabling the mode does not change an existing password. Password encryption and user isolation are unchanged.

## Optional auto-unlock

Off by default. `npm run auto-unlock -- on "<user name>"` stores that user's password in the macOS Keychain (entered on the terminal, never written to a file) and the loopback launcher then signs in automatically. `npm run auto-unlock -- off` deletes the Keychain item and restores the login screen; `-- status` shows the state. Start with `--no-auto-unlock` to see the login screen once without changing the setting. Auto-unlock applies only to the trusted `127.0.0.1` development launcher and does not weaken the stored encryption; anyone with access to your unlocked Mac session can open the workspace while it is on.
