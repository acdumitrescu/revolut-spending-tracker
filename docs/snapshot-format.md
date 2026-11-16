# Snapshot file format (`.ssbsnap`)

A `.ssbsnap` file carries one whole workspace from the Mac app to the phone web app (AirDrop, then
the Files sheet). It is the JSON backup, compressed and encrypted with a password. Nothing about the
workspace can be read without the password: not the counts, not the dates, not the source label.

Code: `src/lib/snapshotFile.js`. Tests: `src/test/snapshotFile.test.js`. Change the code, this
document and the tests together.

## Byte layout (format version 1)

All integers are unsigned, big-endian.

| Offset | Size | Field      | Value                                                          |
| -----: | ---: | ---------- | -------------------------------------------------------------- |
|      0 |    8 | magic      | `53 53 42 53 4E 41 50 00` ("SSBSNAP" and a zero byte)          |
|      8 |    1 | version    | `1`                                                            |
|      9 |    1 | flags      | bit 0 = body is gzip-compressed; every other bit must be 0     |
|     10 |    1 | kdf id     | `1` = PBKDF2-HMAC-SHA-256                                      |
|     11 |    4 | iterations | PBKDF2 round count (default 600,000)                           |
|     15 |   16 | salt       | random, new for every file                                     |
|     31 |   12 | iv         | random AES-GCM nonce, new for every file                       |
|     43 |    n | ciphertext | AES-256-GCM output: encrypted body followed by the 16-byte tag |

The header is the first 43 bytes. The whole header is passed to AES-GCM as additional
authenticated data, so changing any header byte (for example clearing the compression flag) makes
decryption fail, even for fields that do not feed the key.

## Body

Plaintext before encryption: the UTF-8 JSON below, gzip-compressed when flag bit 0 is set.

```json
{
  "meta": {
    "kind": "ssb-snapshot",
    "createdAt": "2026-11-16T09:30:00.000Z",
    "source": "MacBook",
    "schemaVersion": 1,
    "summary": { "transactions": 4, "accounts": 3, "...": "..." }
  },
  "appState": { "schemaVersion": 1, "exportedAt": 1794821400000, "data": { "...": "..." } }
}
```

`appState` is exactly the envelope the JSON backup writes (`serializeBackupState`), with
`exportedAt` set to the snapshot time. On create it is first put through the strict backup-import
check (`validateStoredAppState`: migrate, schema check, no repair) and sanitized, so the file
always holds the current schema version and restore can never refuse what the Mac wrote.

On read the same check runs again on the phone, so the phone applies its own migrations and its
own "newer version" refusal. The summary the phone shows is recomputed from what will actually be
restored; the stored summary is informational only.

## Crypto choices and why

- **AES-256-GCM** (WebCrypto): authenticated encryption, available in Safari, the Tauri webview and
  Node with no dependency. One key per file (fresh salt), one message per key, random 96-bit IV.
- **PBKDF2-HMAC-SHA-256, 600,000 rounds** (OWASP 2023+ guidance for this hash). It is the only
  slow password hash WebCrypto offers; Argon2 or scrypt would need a dependency. The round count is
  stored in the header so it can rise later without a format change. About 70 ms on an M-series
  Mac in Node; expect a few hundred ms on a phone.
- **Password normalized to Unicode NFC** before hashing, so letters with diacritics typed on the
  Mac and on the iPhone keyboard give the same key.
- **Compress, then encrypt.** Compression after encryption gains nothing. Compression before
  encryption leaks only the overall length, and there is no attacker-chosen content mixed with
  secrets in this file, so the CRIME/BREACH class of attack does not apply.
- **Wrong password and damaged file look the same.** GCM only says "the tag does not match". The
  error message says so and suggests checking the password, then sending a fresh file.

## Limits enforced

| Limit                      | Value              | Where                                               |
| -------------------------- | ------------------ | --------------------------------------------------- |
| Minimum password length    | 10 characters      | create (code points after NFC)                      |
| PBKDF2 rounds accepted     | 100,000–10,000,000 | create and read; checked before any key derivation  |
| Maximum file size          | 256 MB             | create and read                                     |
| Maximum unpacked JSON size | 512 MB             | read; decompression stops as soon as it is exceeded |
| Source label               | 200 characters     | create (trimmed, longer labels cut)                 |

The round-count range on read stops a tampered header from either weakening the check or freezing
the phone with billions of rounds.

## Compression fallback

Compression uses `CompressionStream('gzip')`, present in Safari 16.4+, current Chromium/WebKit
webviews and Node 18+. Where it is missing the file is written uncompressed with flag bit 0
cleared. A compressed file opened where `DecompressionStream` is missing is refused with
`unsupported-version` and a message to update the browser.

## Errors

Every refusal is a `SnapshotError` with a stable `code` and a message fit to show the user.

| Code                        | When                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| `not-a-snapshot`            | magic bytes missing (any other file, including a `.json` backup)                |
| `unsupported-version`       | newer/unknown format version, unknown flag bit, unknown KDF, or no gzip support |
| `invalid-header`            | header cut short, or round count outside the accepted range                     |
| `wrong-password-or-damaged` | GCM check failed (wrong password, changed or truncated file), empty password    |
| `newer-app-version`         | the workspace inside has a newer schema version (`migrations.js` message)       |
| `invalid-contents`          | decrypts, but is not valid JSON, has no `meta`, or fails workspace validation   |
| `password-too-short`        | create with fewer than 10 characters                                            |
| `too-large`                 | over the file or unpacked size limit                                            |
| `crypto-unavailable`        | no WebCrypto in this environment                                                |

## Versioning rules

- The magic never changes.
- Any change to the header layout, the cipher, the AAD rule or the body framing bumps the format
  version byte. Readers refuse versions they do not know with `unsupported-version`; they never
  guess.
- A new KDF gets a new kdf id. Its parameters may need a different header layout, which is a new
  format version.
- Raising the default round count needs no version bump: the count is in the header and old files
  stay readable while their count is inside the accepted range.
- A new optional body feature that old readers must not ignore takes a new flag bit; old readers
  refuse unknown bits.
- The workspace schema inside has its own version (`APP_STATE_SCHEMA_VERSION`) and migrations; it
  is independent of the file format version.

## Measured size (synthetic data, Node 26 on the dev Mac)

20,000 generated transactions on top of the v1 synthetic fixture:

| What                                        | Bytes     |
| ------------------------------------------- | --------- |
| JSON backup as exported (pretty-printed)    | 9,620,890 |
| Compact JSON of the same state              | 6,139,394 |
| Decrypted snapshot JSON (`meta`+`appState`) | 6,139,810 |
| `.ssbsnap`, compressed                      | 437,505   |
| `.ssbsnap`, uncompressed                    | 6,139,869 |

Create about 220 ms and read about 210 ms in total at 600,000 rounds. Generated data repeats more
than real data, so a real file will compress less well. The unpacked JSON (6.1 MB here) is over
the roughly 5 MB `localStorage` cap, so a workspace of this size needs the IndexedDB storage of
plan 04 task 2.1 on the phone.
