#!/usr/bin/env bash

set -u

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_dir="$repo_root/private-data/dev-sync"
pid_file="$runtime_dir/local.pid"
log_file="$runtime_dir/local.log"
launcher="$repo_root/scripts/startPersonalDev.mjs"
app_url="http://127.0.0.1:5173/app"

is_managed_process_running() {
  [[ -f "$pid_file" ]] || return 1

  local pid command
  read -r pid < "$pid_file"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1

  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command" == *"startPersonalDev.mjs"* && "$command" == *"--use-saved-token"* ]]
}

start_app() {
  mkdir -p "$runtime_dir"

  if is_managed_process_running; then
    echo "SimpleSafeBanking is already running at $app_url"
    return 0
  fi

  rm -f "$pid_file"
  if curl -fsS "$app_url" >/dev/null 2>&1; then
    echo "SimpleSafeBanking is already running outside ssb start; stop its original terminal first." >&2
    return 1
  fi

  nohup node "$launcher" --use-saved-token --open > "$log_file" 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" > "$pid_file"
  chmod 600 "$pid_file" "$log_file"

  for _ in {1..100}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "SimpleSafeBanking failed to start. See $log_file" >&2
      rm -f "$pid_file"
      return 1
    fi
    if curl -fsS "$app_url" >/dev/null 2>&1; then
      sleep 0.25
      if is_managed_process_running && curl -fsS "$app_url" >/dev/null 2>&1; then
        echo "SimpleSafeBanking started at $app_url"
        return 0
      fi
    fi
    sleep 0.1
  done

  echo "SimpleSafeBanking did not become ready. See $log_file" >&2
  return 1
}

stop_app() {
  if ! is_managed_process_running; then
    rm -f "$pid_file"
    echo "SimpleSafeBanking is not running under ssb start."
    return 0
  fi

  local pid
  read -r pid < "$pid_file"
  kill "$pid"

  for _ in {1..50}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "SimpleSafeBanking stopped."
      return 0
    fi
    sleep 0.1
  done

  echo "SimpleSafeBanking is still stopping; check $log_file" >&2
  return 1
}

case "${1:-}" in
  start)
    start_app
    ;;
  stop)
    stop_app
    ;;
  *)
    echo "Usage: ssb start | ssb stop" >&2
    exit 2
    ;;
esac
