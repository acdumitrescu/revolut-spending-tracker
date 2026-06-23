#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
HOOKS_DIR="$(git rev-parse --git-path hooks)"
HOOK="$HOOKS_DIR/pre-push"

mkdir -p "$HOOKS_DIR"

cat > "$HOOK" <<'EOF'
#!/bin/sh
set -eu

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" = "personal" ]; then
  echo 'Refusing to push local-only branch "personal".' >&2
  exit 1
fi

if [ -x "scripts/privacy-scan.sh" ]; then
  scripts/privacy-scan.sh
fi
EOF

chmod +x "$HOOK"
printf 'Installed pre-push privacy hook at %s\n' "$HOOK"
