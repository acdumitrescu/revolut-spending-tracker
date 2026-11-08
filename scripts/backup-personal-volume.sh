#!/bin/sh
set -eu
umask 077

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="${SSB_PERSONAL_PROJECT_NAME:-ssb-personal}"
VOLUME_NAME="${PROJECT_NAME}_app-state"
BACKUP_DIR="$REPO_ROOT/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="ssb-personal-app-state-${STAMP}.tar.gz"

install -d -m 700 "$BACKUP_DIR"
TEMP_FILE="$(mktemp "$BACKUP_DIR/.ssb-backup.XXXXXX")"
trap 'rm -f "$TEMP_FILE"' EXIT

docker volume inspect "$VOLUME_NAME" >/dev/null
docker run --rm \
  -v "$VOLUME_NAME:/data:ro" \
  alpine:3.20 \
  tar -czf - -C /data . > "$TEMP_FILE"

tar -tzf "$TEMP_FILE" >/dev/null
chmod 600 "$TEMP_FILE"
mv "$TEMP_FILE" "$BACKUP_DIR/$BACKUP_FILE"
trap - EXIT

printf 'Wrote private volume backup to %s/%s\n' "$BACKUP_DIR" "$BACKUP_FILE"
