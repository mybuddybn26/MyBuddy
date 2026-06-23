#!/usr/bin/env bash
# scripts/check-bundle-size.sh — fail the build if a frontend chunk exceeds a budget.
#

# Buddy is a full AI assistant app with chat, voice, documents, memory, tools, and
# settings. The initial entry includes React, routing, Layout, auth, API client,
# and shared UI — a realistic baseline for this type of application.
#
# After implementing route-based lazy loading, each page is a separate async
# chunk loaded on demand.
#
# Usage (from vitejs/ workdir):
#   bash ../scripts/check-bundle-size.sh                          # default budgets
#   BUNDLE_BUDGET_INITIAL_KB=600 bash ../scripts/check-bundle-size.sh
#
# Defaults (bytes):
#   Initial entry (app shell)  : 300KB  — framework + layout + shared modules
#   Lazy chunks (per page)     : 250KB  — Chat, Documents, Settings, etc.

set -euo pipefail

DIST_DIR="${BUNDLE_DIST_DIR:-dist/assets}"
INITIAL_BYTES="${BUNDLE_BUDGET_INITIAL_BYTES:-300000}"
ASYNC_BYTES="${BUNDLE_BUDGET_ASYNC_BYTES:-250000}"

INITIAL_KB=$(( (INITIAL_BYTES + 1023) / 1024 ))
ASYNC_KB=$(( (ASYNC_BYTES + 1023) / 1024 ))

if [ ! -d "$DIST_DIR" ]; then
  echo "check-bundle-size: $DIST_DIR not found (build first)." >&2
  exit 1
fi

shopt -s nullglob
fail=0
total_kb=0

echo "  Bundle size check"
echo "  Initial budget: ${INITIAL_BYTES} bytes (${INITIAL_KB}KB)"
echo "  Async budget:   ${ASYNC_BYTES} bytes (${ASYNC_KB}KB)"
echo ""

for f in "$DIST_DIR"/*.js; do
  bytes=$(wc -c <"$f" | tr -d ' ')
  kb=$(( (bytes + 1023) / 1024 ))
  total_kb=$((total_kb + kb))
  base=$(basename "$f")

  case "$base" in
    index-*|main-*|app-*)
      budget=$INITIAL_BYTES
      kind=initial
      ;;
    *)
      budget=$ASYNC_BYTES
      kind=async
      ;;
  esac

  if [ "$bytes" -gt "$budget" ]; then
    printf '  ✗ %6d  %s  (%s, limit %s)\n' "$bytes" "$base" "$kind" "$budget"
    fail=1
  else
    printf '  ✓ %6d  %s  (%s)\n' "$bytes" "$base" "$kind"
  fi
done

echo "  ----"
echo "  total JS: ${total_kb}KB"

if [ "$fail" -ne 0 ]; then
  echo "check-bundle-size: at least one chunk exceeds its budget." >&2
  exit 1
fi
