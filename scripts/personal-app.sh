#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.yml"
PROJECT_NAME="ssb-personal"
APP_URL="http://127.0.0.1:3176"

cd "$REPO_ROOT"

compose() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

case "${1:-}" in
  start)
    compose config >/dev/null
    compose up -d --build
    printf 'Personal private-sync app is starting at %s\n' "$APP_URL"
    ;;
  stop)
    compose down
    ;;
  restart)
    compose down
    compose up -d --build
    printf 'Personal private-sync app restarted at %s\n' "$APP_URL"
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs -f --tail=100
    ;;
  volume)
    docker volume inspect "${PROJECT_NAME}_app-state"
    ;;
  *)
    cat <<EOF
Usage: scripts/personal-app.sh start|stop|restart|status|logs|volume

Runs the private personal app on $APP_URL using Docker Compose project "$PROJECT_NAME".
Personal server state is stored in the "${PROJECT_NAME}_app-state" Docker volume.

This script intentionally does not provide a delete-volume command.
EOF
    exit 1
    ;;
esac
