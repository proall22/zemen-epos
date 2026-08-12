#!/bin/sh
set -eu

attempt=1
max_attempts="${PRISMA_MIGRATE_RETRIES:-6}"

while ! node node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Prisma migration failed after ${attempt} attempts; refusing to start." >&2
    exit 1
  fi

  delay=$((attempt * 5))
  echo "Prisma migration attempt ${attempt}/${max_attempts} failed; retrying in ${delay}s." >&2
  sleep "$delay"
  attempt=$((attempt + 1))
done

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/main.js
