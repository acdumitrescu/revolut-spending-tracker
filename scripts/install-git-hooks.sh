#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
HOOKS_DIR="$(git rev-parse --git-path hooks)"
HOOK="$HOOKS_DIR/pre-push"
. "$SCRIPT_DIR/git-privacy-guards.sh"

mkdir -p "$HOOKS_DIR"
personal_oid="$(git show-ref --verify --hash "$SSB_PERSONAL_REF" 2>/dev/null || true)"
public_oid="$(git show-ref --verify --hash "$SSB_PUBLIC_REF" 2>/dev/null || true)"
remote_public_oid="$(git show-ref --verify --hash refs/remotes/origin/main 2>/dev/null || true)"

if ! git show-ref --verify --quiet "$SSB_PUBLIC_MARKER_REF"; then
  if [ -n "$remote_public_oid" ]; then
    git update-ref "$SSB_PUBLIC_MARKER_REF" "$remote_public_oid"
    printf 'Seeded trusted public-history marker from origin/main.\n'
  elif [ -n "$personal_oid" ] || git for-each-ref --format='%(refname)' "$SSB_PRIVATE_MARKER_PREFIX/" | grep -q .; then
    printf 'Refusing to guess a public baseline while private history exists and origin/main is unavailable.\n' >&2
    exit 1
  elif [ -n "$public_oid" ]; then
    git update-ref "$SSB_PUBLIC_MARKER_REF" "$public_oid"
  fi
fi

if [ -n "$public_oid" ] && ssb_commit_contains_private_history "$public_oid"; then
  recorded_public_oid="$(git show-ref --verify --hash "$SSB_PUBLIC_MARKER_REF" 2>/dev/null || true)"
  if [ "${SSB_TRUST_INITIAL_MAIN:-0}" = '1' ] \
    && [ -n "$remote_public_oid" ] \
    && [ "$recorded_public_oid" = "$remote_public_oid" ] \
    && git merge-base --is-ancestor "$remote_public_oid" "$public_oid" \
    && [ -n "$personal_oid" ] \
    && git merge-base --is-ancestor "$public_oid" "$personal_oid"; then
    printf 'Explicitly trusting verified local main as the initial public baseline.\n'
  else
    printf 'Refusing to trust current main because it contains history beyond the recorded public baseline.\n' >&2
    exit 1
  fi
fi

if [ -n "$public_oid" ]; then
  git update-ref "$SSB_PUBLIC_MARKER_REF" "$public_oid"
  printf 'Recorded trusted public-history marker at %s\n' "$SSB_PUBLIC_MARKER_REF"
else
  printf 'Warning: no main branch exists, so no trusted public-history marker was recorded.\n' >&2
fi

if [ -n "$personal_oid" ]; then
  private_marker_ref="$SSB_PRIVATE_MARKER_PREFIX/$personal_oid"
  git update-ref "$private_marker_ref" "$personal_oid"
  printf 'Recorded local-only history marker at %s\n' "$private_marker_ref"
elif ! git for-each-ref --format='%(refname)' "$SSB_PRIVATE_MARKER_PREFIX/" | grep -q .; then
  printf 'Warning: no personal branch exists, so no local-only history marker was recorded.\n' >&2
fi

cp "$SCRIPT_DIR/pre-push" "$HOOK"
chmod +x "$HOOK"
printf 'Installed pre-push privacy hook at %s\n' "$HOOK"
