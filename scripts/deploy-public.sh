#!/bin/sh
# Deploy the public, no-data, client-only build (docker-compose.public.yml) to a VPS.
#
# Required:  SSB_PUBLIC_REMOTE_HOST   ssh destination (host alias or user@host); never stored in git
# Optional:  SSB_PUBLIC_REMOTE_PATH   remote directory, default /srv/docker/ssb-public
#
# Usage: scripts/deploy-public.sh [--dry-run]
#
# This is separate from deploy.sh (the private deployment). It refuses the private
# directory, refuses branches other than main or public/*, and transfers only
# git-tracked files. The public compose file needs no .env on the remote.
set -eu

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR/.."
. "$SCRIPT_DIR/git-privacy-guards.sh"

PRIVATE_DEFAULT_PATH='/srv/docker/ssb'
COMPOSE_FILE='docker-compose.public.yml'

if [ "$DRY_RUN" -eq 1 ]; then
  REMOTE_HOST="${SSB_PUBLIC_REMOTE_HOST:-<SSB_PUBLIC_REMOTE_HOST>}"
else
  REMOTE_HOST="${SSB_PUBLIC_REMOTE_HOST:?Set SSB_PUBLIC_REMOTE_HOST before deploying}"
fi
REMOTE_PATH="${SSB_PUBLIC_REMOTE_PATH:-/srv/docker/ssb-public}"

# Normalise trailing slashes before comparing with the private deployment path.
CLEAN_PATH="$REMOTE_PATH"
while :; do
  case "$CLEAN_PATH" in
    */) [ "$CLEAN_PATH" = '/' ] && break; CLEAN_PATH="${CLEAN_PATH%/}" ;;
    *) break ;;
  esac
done
if [ "$CLEAN_PATH" = "$PRIVATE_DEFAULT_PATH" ]; then
  echo "Refusing: $REMOTE_PATH is the private deployment directory." >&2
  exit 1
fi
case "$CLEAN_PATH" in
  /*) ;;
  *)
    echo 'Refusing: SSB_PUBLIC_REMOTE_PATH must be an absolute path.' >&2
    exit 1
    ;;
esac
case "$CLEAN_PATH" in
  *[!A-Za-z0-9._/-]*)
    echo 'Refusing: SSB_PUBLIC_REMOTE_PATH has unexpected characters.' >&2
    exit 1
    ;;
esac

BRANCH="$(git symbolic-ref --short -q HEAD || true)"
case "$BRANCH" in
  main|public/*) ;;
  *)
    echo "Refusing to deploy from branch '${BRANCH:-detached HEAD}': use main or public/*." >&2
    exit 1
    ;;
esac

if ssb_commit_contains_private_history HEAD; then
  echo 'Refusing to deploy local-only personal history.' >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Refusing to deploy with uncommitted tracked changes.' >&2
  exit 1
fi

scripts/privacy-scan.sh

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing $COMPOSE_FILE." >&2
  exit 1
fi

FILE_COUNT="$(git ls-files | wc -l | tr -d ' ')"

if [ "$DRY_RUN" -eq 1 ]; then
  echo 'Dry run: nothing is contacted or changed.'
  echo "  branch:        $BRANCH ($(git rev-parse --short HEAD))"
  echo "  remote host:   $REMOTE_HOST"
  echo "  remote path:   $CLEAN_PATH"
  echo "  files to sync: $FILE_COUNT (git ls-files only)"
  echo "  would run:     rsync -az --from0 --files-from=- ./ <host>:<path>/"
  echo "  would run:     ssh <host> 'cd <path> && docker compose -f $COMPOSE_FILE config >/dev/null && docker compose -f $COMPOSE_FILE up -d --build'"
  exit 0
fi

# Only committed, Git-tracked files are eligible for deployment. Private and
# ignored local data never enters the transfer manifest.
ssh "$REMOTE_HOST" "mkdir -p \"$CLEAN_PATH\""
git ls-files -z | rsync -az --from0 --files-from=- ./ "$REMOTE_HOST":"$CLEAN_PATH"/
ssh "$REMOTE_HOST" "cd \"$CLEAN_PATH\" && docker compose -f $COMPOSE_FILE config >/dev/null && docker compose -f $COMPOSE_FILE up -d --build"
echo "Deployed the public build ($FILE_COUNT files) to $REMOTE_HOST:$CLEAN_PATH"
