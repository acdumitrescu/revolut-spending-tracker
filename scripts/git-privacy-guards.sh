#!/bin/sh

SSB_PERSONAL_REF='refs/heads/personal'
SSB_PRIVATE_MARKER_PREFIX='refs/ssb/private/history'
SSB_PUBLIC_MARKER_REF='refs/ssb/public/main'
SSB_PUBLIC_REF='refs/heads/main'
SSB_PRIVATE_PATH_PATTERN='(^|/)(private-data|personal-data|backups|exports|imports|tmp-data|XTB)(/|$)|(^|/)PRIVATE_NOTES\.md$'

ssb_is_zero_oid() {
  case "$1" in
    ''|*[!0]*) return 1 ;;
    *) return 0 ;;
  esac
}

ssb_resolve_commit() {
  if git cat-file -e "$1^{commit}" 2>/dev/null; then
    git rev-parse --verify "$1^{commit}" 2>/dev/null
  fi
}

ssb_resolve_public_commit() {
  remote_name="${1:-}"

  public_oid="$(git show-ref --verify --hash "$SSB_PUBLIC_MARKER_REF" 2>/dev/null || true)"
  if [ -n "$public_oid" ]; then
    printf '%s\n' "$public_oid"
    return 0
  fi

  case "$remote_name" in
    *[!A-Za-z0-9._-]*|'') ;;
    *)
      public_oid="$(git show-ref --verify --hash "refs/remotes/$remote_name/main" 2>/dev/null || true)"
      if [ -n "$public_oid" ]; then
        printf '%s\n' "$public_oid"
        return 0
      fi
      ;;
  esac

  public_oid="$(git show-ref --verify --hash refs/remotes/origin/main 2>/dev/null || true)"
  if [ -n "$public_oid" ]; then
    printf '%s\n' "$public_oid"
    return 0
  fi

  git show-ref --verify --hash "$SSB_PUBLIC_REF" 2>/dev/null || true
}

ssb_protected_history_tips() {
  git for-each-ref --format='%(objectname)' "$SSB_PRIVATE_MARKER_PREFIX/"
  git show-ref --verify --hash "$SSB_PERSONAL_REF" 2>/dev/null || true
}

ssb_commit_contains_private_history() {
  candidate_commit="$(ssb_resolve_commit "$1")"
  [ -n "$candidate_commit" ] || return 1

  protected_tips="$(ssb_protected_history_tips)"
  [ -n "$protected_tips" ] || return 1

  public_commit="$(ssb_resolve_public_commit "${2:-}")"
  if [ -z "$public_commit" ]; then
    echo 'Unable to resolve public main while private history exists; refusing the operation.' >&2
    return 0
  fi

  for protected_tip in $protected_tips; do
    merge_bases="$(git merge-base --all "$candidate_commit" "$protected_tip" 2>/dev/null || true)"
    for merge_base in $merge_bases; do
      if ! git merge-base --is-ancestor "$merge_base" "$public_commit"; then
        return 0
      fi
    done
  done

  return 1
}

ssb_outgoing_commits() {
  local_commit="$1"
  remote_oid="$2"
  remote_name="${3:-}"
  remote_commit=''

  if ! ssb_is_zero_oid "$remote_oid"; then
    remote_commit="$(ssb_resolve_commit "$remote_oid")"
  fi

  if [ -n "$remote_commit" ]; then
    git rev-list "$local_commit" "^$remote_commit"
    return
  fi

  case "$remote_name" in
    *[!A-Za-z0-9._-]*|'') ;;
    *)
      if git for-each-ref --format='%(refname)' "refs/remotes/$remote_name/" | grep -q .; then
        git rev-list "$local_commit" --not --remotes="$remote_name"
        return
      fi
      ;;
  esac

  git rev-list "$local_commit"
}

ssb_find_private_path_in_outgoing_history() {
  local_commit="$1"
  remote_oid="$2"
  remote_name="${3:-}"

  for commit_oid in $(ssb_outgoing_commits "$local_commit" "$remote_oid" "$remote_name"); do
    private_path="$(git ls-tree -r --name-only "$commit_oid" | grep -Ei "$SSB_PRIVATE_PATH_PATTERN" | head -n 1 || true)"
    if [ -n "$private_path" ]; then
      printf '%s:%s\n' "$commit_oid" "$private_path"
      return 0
    fi
  done

  return 1
}
