#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.public.yml"
PROJECT_NAME="ssb-public-test"
APP_URL="http://127.0.0.1:3178"

cd "$REPO_ROOT"

compose() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

case "${1:-}" in
  start)
    compose config >/dev/null
    compose up -d --build
    printf 'Public-safe client-only test app is starting at %s\n' "$APP_URL"
    ;;
  stop)
    compose down
    ;;
  restart)
    compose down
    compose up -d --build
    printf 'Public-safe client-only test app restarted at %s\n' "$APP_URL"
    ;;
  status)
    compose ps
    ;;
  logs)
    compose logs -f --tail=100
    ;;
  *)
    cat <<EOF
Usage: scripts/public-test.sh start|stop|restart|status|logs

Runs the GitHub-safe client-only app on $APP_URL.
This profile does not start the private-sync API and does not mount an app-state volume.
EOF
    exit 1
    ;;
esac
