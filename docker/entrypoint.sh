#!/bin/sh
# Container entrypoint: apply pending database migrations, then start the server.
# `prisma migrate deploy` only applies migrations that were already generated and committed
# (prisma/migrations); it never resets or drops anything.
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

PRISMA="node /opt/prisma-cli/node_modules/prisma/build/index.js"

echo "[daftar] applying database migrations"
attempt=1
until $PRISMA migrate deploy --schema=/app/prisma/schema.prisma; do
  if [ "$attempt" -ge 20 ]; then
    echo "[daftar] database still not ready after $attempt attempts, giving up" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  echo "[daftar] database not ready (or migration failed), retrying in 3s ($attempt/20)"
  sleep 3
done

echo "[daftar] starting"
exec "$@"
