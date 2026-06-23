#!/usr/bin/env bash
# scripts/validate-nginx-config.sh — validates nginx.conf syntax.
#
# Validates the nginx server block used in production against a real nginx
# binary. On CI (GitHub Actions), nginx is installed via apt and the config
# is wrapped in a minimal http block for validation.
#
# Usage: bash scripts/validate-nginx-config.sh

set -euo pipefail

NGINX_CONF="vitejs/nginx.conf"
NGINX_SECURITY="vitejs/security-headers.inc"

if [ ! -f "$NGINX_CONF" ]; then
  echo "validate-nginx-config: $NGINX_CONF not found." >&2
  exit 1
fi

if [ ! -f "$NGINX_SECURITY" ]; then
  echo "validate-nginx-config: $NGINX_SECURITY not found." >&2
  exit 1
fi

# Ensure nginx is available (CI installs it, local dev may use Docker)
ensure_nginx() {
  if command -v nginx &>/dev/null; then
    return 0
  fi

  if command -v docker &>/dev/null; then
    echo "Installing nginx via apt..." >&2
    if command -v sudo &>/dev/null; then
      sudo apt-get update -qq && sudo apt-get install -y -qq nginx
    else
      apt-get update -qq && apt-get install -y -qq nginx
    fi
  fi
}

ensure_nginx

if ! command -v nginx &>/dev/null; then
  echo "validate-nginx-config: nginx is not available (install nginx or docker)." >&2
  exit 1
fi

echo "Validating $NGINX_CONF ..."

# The vitejs/nginx.conf is a server block — wrap it in a minimal http
# block so nginx -t can parse it. Use /tmp to avoid permission issues.
TMPDIR=$(mktemp -d)
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

cat > "$TMPDIR/nginx.conf" <<'HEADER'
worker_processes 1;
error_log /dev/stderr;
pid /tmp/nginx-test.pid;
events { worker_connections 1; }
http {
  access_log off;
HEADER

# Include the security headers (referenced by the server block)
cp "$NGINX_SECURITY" "$TMPDIR/security-headers.inc"

# Include the server block with paths adjusted to the temp dir
cat "$NGINX_CONF" >> "$TMPDIR/nginx.conf"
echo "}" >> "$TMPDIR/nginx.conf"

if nginx -t -c "$TMPDIR/nginx.conf" -p "$TMPDIR" 2>&1; then
  echo "nginx config is valid."
else
  echo "nginx config validation FAILED." >&2
  exit 1
fi