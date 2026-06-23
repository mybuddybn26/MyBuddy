#!/usr/bin/env bash
# scripts/validate-nginx-config.sh — validates nginx.conf against the runtime image.
#
# Uses the same nginx image declared in vitejs/Dockerfile so unknown or
# module-dependent directives (e.g. "brotli on;" on stock nginx:alpine) are
# caught BEFORE deploy.
#
# Usage: bash scripts/validate-nginx-config.sh

set -euo pipefail

NGINX_IMAGE="public.ecr.aws/docker/library/nginx:1.27-alpine"
NGINX_CONF="vitejs/nginx.conf"
NGINX_SECURITY="vitejs/security-headers.inc"

if [ ! -f "$NGINX_CONF" ]; then
  echo "validate-nginx-config: $NGINX_CONF not found." >&2
  exit 1
fi

echo "Validating $NGINX_CONF against $NGINX_IMAGE ..."

docker run --rm \
  -v "$(pwd)/$NGINX_CONF:/etc/nginx/conf.d/default.conf:ro" \
  -v "$(pwd)/$NGINX_SECURITY:/etc/nginx/conf.d/security-headers.inc:ro" \
  "$NGINX_IMAGE" \
  nginx -t

echo "nginx config is valid."
