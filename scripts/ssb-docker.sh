#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="ssb-personal"
APP_URL="http://127.0.0.1:3176"

cd "$REPO_ROOT"

case "${1:-}" in
  start)
    scripts/personal-app.sh start
    ;;
  stop)
    scripts/personal-app.sh stop
    ;;
  restart)
    scripts/personal-app.sh restart
    ;;
  status)
    scripts/personal-app.sh status
    ;;
  logs)
    scripts/personal-app.sh logs
    ;;
  *)
    cat <<EOF
Usage: scripts/ssb-docker.sh start|stop|restart|status|logs

Commands:
  start    Build and start the private personal deployment.
  stop     Stop containers without deleting the private sync volume.
  restart  Rebuild and restart the deployment.
  status   Show container status and health.
  logs     Follow recent container logs.

Open: $APP_URL
Docker project: $PROJECT_NAME

This wrapper delegates to scripts/personal-app.sh.
EOF
    exit 1
    ;;
esac
