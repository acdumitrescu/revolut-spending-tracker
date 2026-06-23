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
  if grep -Ei '(^|/)(private-data|personal-data|backups|exports|imports|tmp-data)(/|$)|(^|/)PRIVATE_NOTES\.md$|revolut|transactions|statement|banking|simple_safe_banking_backup_.*\.(json|xlsx|xls)$|\.(qfx|ofx|qif|numbers)$' "$tmp_files"; then
    printf '\nPrivacy scan failed: private-looking staged or untracked paths were found.\n' >&2
    fail=1
  fi
fi

if git rev-parse --abbrev-ref HEAD | grep -qx 'personal'; then
  printf 'Privacy scan note: you are on local-only branch "personal"; do not push it.\n' >&2
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

printf 'Privacy scan passed.\n'
