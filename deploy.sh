#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_HOST="${SSB_REMOTE_HOST:?Set SSB_REMOTE_HOST before deploying}"
REMOTE_PATH="${SSB_REMOTE_PATH:-/srv/docker/ssb}"

if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "Expected a deployment .env file next to the repo root. Copy .env.example and adjust it first." >&2
  exit 1
fi

docker compose -f "$SCRIPT_DIR/docker-compose.yml" config >/dev/null

rsync -az --exclude={node_modules,dist,.git} "$SCRIPT_DIR"/ "$REMOTE_HOST":"$REMOTE_PATH"/
ssh "$REMOTE_HOST" "cd \"$REMOTE_PATH\" && docker compose config >/dev/null && docker compose up -d --build"
echo "Deployed to $REMOTE_HOST:$REMOTE_PATH"
