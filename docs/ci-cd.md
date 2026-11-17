# CI/CD and testing

GitHub Actions gates `main`; `npm run ci:local` runs the same steps on your machine, so green
locally means green in CI.

## Test layers

| Layer               | Command                    | What it covers                                                                                                                                               | Time  |
| ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Unit + coverage     | `npm run test:coverage`    | Vitest (jsdom) for `src/test` and `backend/*.test.js`; fails below the coverage floors in `vite.config.js`                                                   | ~20 s |
| Money properties    | part of the above          | `src/test/moneyInvariants.property.test.js` (fast-check, seeded): FX round trip, totals equal rows, re-import adds nothing, currency override keeps identity | —     |
| Parser golden files | part of the above          | `src/test/csvParserGolden.test.js`: one synthetic CSV per export profile with its expected parse in `src/test/fixtures/golden/`                              | —     |
| Git privacy guards  | `npm run test:git-privacy` | pre-push and pre-commit hooks, installer                                                                                                                     | ~3 s  |
| HTTP contract       | `npm run test:contract`    | Black-box tests against a real backend process                                                                                                               | ~7 s  |
| End-to-end          | `npm run test:e2e`         | Playwright, Chromium and WebKit, real backend on a throwaway folder, axe accessibility scan in both themes                                                   | ~40 s |

Rules: synthetic data only, `TZ=UTC`, no network in tests. A parser change shows up as a diff in
the golden files; after reviewing it, refresh with `npx vitest run csvParserGolden -u`.
First e2e run on a machine: `npx playwright install chromium webkit`.

### Coverage floors

Set on 2026-11-13 just below the baseline (statements 83.1%, branches 75.6%, functions 86.2%,
lines 85.2%) so coverage can only go up. Money logic (`fx`, `selectors`, `csvParser`, `appState`,
`workspaceChanges`, `localUsers`) has higher per-file floors. `backend/server.js` is excluded:
the contract suite covers it end to end. Raise a floor when coverage rises; never lower one to make
a change pass.

## GitHub Actions (public `main`)

`.github/workflows/ci.yml` runs on pushes and PRs to `main`, and weekly:

| Job        | Runs                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| `lint`     | eslint, Prettier check, privacy scan                                                         |
| `unit`     | tests with coverage (summary in the run page and as an artifact), git privacy tests          |
| `contract` | HTTP contract suite (builds the native SQLCipher module)                                     |
| `build`    | `vite build` and the bundle budget                                                           |
| `e2e`      | Playwright Chromium + WebKit; traces uploaded only on failure                                |
| `audit`    | `npm audit --omit=dev --audit-level=high` for both packages                                  |
| `docker`   | builds and starts the compose stack, checks `/`, `/healthz` and a 401; images are not pushed |
| `ci-ok`    | passes only if every job above passed: **the one required check**                            |

Also: `codeql.yml` (JavaScript, PRs, pushes and weekly), `secret-scan.yml` (gitleaks on PRs and
pushes), and `release.yml` (tag `v*` reruns CI, builds the images, creates a GitHub Release with
generated notes; the tag must equal `package.json`'s version). Every action is pinned to a commit
SHA, default permissions are read-only, and no workflow uses `pull_request_target`.

Dependabot groups minor and patch updates per ecosystem. Majors arrive as their own PRs and are
merged only by decision.

### Branch protection (a setting only the repository owner can change)

GitHub → repository → Settings → Branches → Add branch ruleset (or classic rule) for `main`:

1. Require a pull request before merging.
2. Require status checks to pass: add **`ci-ok`** (it appears after the workflow has run once).
3. Block force pushes and deletions.

Until this is on, CI reports but does not block.

### Public demo (Vercel)

Vercel's GitHub integration deploys every push to `main` to production. CI does not deploy
anything. With branch protection on, only commits that passed `ci-ok` reach `main`, so only those
reach Vercel.

## Local pipeline

| Command            | What it does                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| pre-commit hook    | Blocks private-looking paths, lints and format-checks the staged files, runs the privacy scan. Well under ten seconds.                               |
| pre-push hook      | Refuses to push local-only history (see `AGENTS.md`).                                                                                                |
| `npm run check`    | Lint, format, unit + coverage, git privacy tests, build, bundle budget, privacy scan. On a clean tree it writes a deploy stamp for `HEAD`.           |
| `npm run ci:local` | Everything GitHub runs except the Docker job, in the same order. `check:all` is an alias. `SSB_CI_SKIP_AUDIT=1` skips the network steps. About 80 s. |

Install or refresh the hooks with `scripts/install-git-hooks.sh`. Hooks live in the shared `.git`,
so they apply to every worktree of this repository.

## Delivery

| Target             | How                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo        | Vercel, automatic on push to `main` (see above).                                                                                                        |
| Public release     | Tag `vX.Y.Z` on `main` after bumping `package.json`; `release.yml` does the rest. Publishing Docker images to a registry is not set up (open decision). |
| Self-hosted server | `deploy.sh`, manual. Refuses unless `npm run check` (or `ci:local`) passed on exactly the current commit with a clean tree.                             |

The version lives in `package.json`; a release tag must match it.
