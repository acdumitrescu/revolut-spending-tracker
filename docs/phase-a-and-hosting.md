# Phase A and Hosting Notes

## Scope

This document captures two decisions:

1. what Phase A means for SimpleSafeBanking
2. which website architecture to evaluate after Phase A is complete

Phase A stays focused on import trust and vendor intelligence only. It does not include building a hosted web product yet.

## Phase A goals

Phase A exists to make the app safer and more trustworthy with real-world Revolut exports.

Priority outcomes:

- support multiple Revolut CSV families through explicit import profiles
- improve localized header handling
- normalize data through one canonical parser path
- show clear import warnings and skip reasons
- expand built-in vendor intelligence for common EU and US merchants

## Implemented direction

The current implementation moves the parser toward a profile-based registry with support for:

- normalized CSV
- Revolut personal raw CSV
- Revolut business transaction statement CSV
- Revolut business expense CSV

The import result now exposes:

- detected profile
- processed row count
- skipped row count
- warnings
- human-readable skip details

Vendor matching now uses structured built-in rules instead of a tiny flat map, while keeping custom user mappings as the highest-priority override.

## What still belongs in Phase A

Even after the current parser hardening pass, Phase A should continue with:

- broader localized header coverage as more real CSV samples appear
- more sample fixtures for edge-case exports
- improved normalized CSV documentation
- import summary UX polish beyond toast-level feedback
- more vendor rules for large merchants, especially by region and category

## Sample collection rule

If new real-world CSV examples are used to improve parsing:

- never commit personal exports
- reproduce the structure with synthetic data before adding tests or fixtures
- document which export family changed, not the private source file

## Hosting options after Phase A

Website delivery should be evaluated only after import reliability feels solid.

### Option 1: Static client-only site

Architecture:

- React app deployed as static files
- all parsing and analytics stay in the browser
- no backend, no database, no auth

Pros:

- strongest fit for the privacy-first promise
- cheapest operational model
- easiest public launch
- lowest maintenance burden

Cons:

- no cross-device sync
- no server-side jobs
- limited premium feature surface early on

Best use:

- first public website launch
- validating demand at minimal cost

### Option 2: Static site plus tiny serverless helpers

Architecture:

- static frontend
- a few optional serverless endpoints for non-sensitive helpers
- still no default storage of user financial data on a server

Pros:

- still low cost
- allows small convenience features later
- keeps the local-first core intact

Cons:

- more moving parts
- more monitoring and deployment complexity
- easy to overbuild too early

Best use:

- second step only if there is clear demand for helper features

### Option 3: Full web app with backend

Architecture:

- frontend plus auth, API, and database
- user data stored remotely

Pros:

- enables sync-heavy or premium account features
- supports broader SaaS-like product paths

Cons:

- highest cost
- highest privacy and legal burden
- weakest match for the current trust story

Best use:

- only after product demand and business model are proven

## Recommended decision

Start with Option 1.

If public usage grows and a lightweight helper becomes clearly valuable, move carefully to Option 2.

Avoid Option 3 unless the product direction changes substantially and the economics justify the added complexity.

## Cost framing

Expected rough cost profile:

- Option 1: near-zero to very low for early usage
- Option 2: still low, but depends on serverless invocations
- Option 3: meaningfully higher and ongoing

For the current product, the cheapest trustworthy path is also the best architectural fit.
