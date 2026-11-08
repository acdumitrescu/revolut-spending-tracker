#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"
. "$SCRIPT_DIR/scripts/git-privacy-guards.sh"

if ssb_commit_contains_private_history HEAD; then
  echo 'Refusing to deploy local-only personal history.' >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Refusing to deploy with uncommitted tracked changes.' >&2
  exit 1
fi

scripts/privacy-scan.sh

REMOTE_HOST="${SSB_REMOTE_HOST:?Set SSB_REMOTE_HOST before deploying}"
REMOTE_PATH="${SSB_REMOTE_PATH:-/srv/docker/ssb}"

ssh "$REMOTE_HOST" "test -f \"$REMOTE_PATH/.env\"" || {
  echo "Expected a pre-provisioned $REMOTE_PATH/.env on the remote host." >&2
  exit 1
}

# Only committed, Git-tracked files are eligible for deployment. Private and
# ignored local data never enters the transfer manifest.
git ls-files -z | rsync -az --from0 --files-from=- ./ "$REMOTE_HOST":"$REMOTE_PATH"/
ssh "$REMOTE_HOST" "cd \"$REMOTE_PATH\" && docker compose config >/dev/null && docker compose up -d --build"
echo "Deployed to $REMOTE_HOST:$REMOTE_PATH"
