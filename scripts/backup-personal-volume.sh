#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="${SSB_PERSONAL_PROJECT_NAME:-ssb-personal}"
VOLUME_NAME="${PROJECT_NAME}_app-state"
BACKUP_DIR="$REPO_ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="ssb-personal-app-state-${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

docker volume inspect "$VOLUME_NAME" >/dev/null
docker run --rm \
  -v "$VOLUME_NAME:/data:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3.20 \
  tar -czf "/backup/$BACKUP_FILE" -C /data .

printf 'Wrote private volume backup to %s/%s\n' "$BACKUP_DIR" "$BACKUP_FILE"
