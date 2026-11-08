#!/bin/sh
set -eu

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

fail=0
tmp_files="$(mktemp)"
trap 'rm -f "$tmp_files"' EXIT

{
  git diff --cached --name-only
  git ls-files --others --exclude-standard
} | sort -u > "$tmp_files"

if [ -s "$tmp_files" ]; then
  if grep -Ei '(^|/)(private-data|personal-data|backups|exports|imports|tmp-data|XTB)(/|$)|(^|/)PRIVATE_NOTES\.md$|(^|/)[^/]*(revolut|transactions?|statements?|banking)[^/]*\.(csv|tsv|json|xlsx|xls|pdf|zip)$|simple_safe_banking_backup_.*\.(json|xlsx|xls)$|\.(qfx|ofx|qif|numbers)$' "$tmp_files"; then
    printf '\nPrivacy scan failed: private-looking staged or untracked paths were found.\n' >&2
    fail=1
  fi
fi

if git ls-files | grep -Ei '(^|/)(private-data|personal-data|backups|exports|imports|tmp-data|XTB)(/|$)|(^|/)PRIVATE_NOTES\.md$'; then
  printf '\nPrivacy scan failed: a private-only path is tracked by git.\n' >&2
  fail=1
fi

if rg -n --glob '*.{js,jsx,ts,tsx}' "(from|import\\()[[:space:]]*['\\\"][^'\\\"]*(private-data|personal-data|backups|XTB)/" src backend 2>/dev/null; then
  printf '\nPrivacy scan failed: source code imports a private-only path.\n' >&2
  fail=1
fi

for built in dist; do
  if [ -d "$built" ] && rg -n '(portfolioSnapshot|Add positions from screenshots|personal-data/|private-data/)' "$built" 2>/dev/null; then
    printf '\nPrivacy scan failed: %s contains private-development markers.\n' "$built" >&2
    fail=1
  fi
done

if git rev-parse --abbrev-ref HEAD | grep -qx 'personal'; then
  printf 'Privacy scan note: you are on local-only branch "personal"; do not push it.\n' >&2
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

printf 'Privacy scan passed.\n'
