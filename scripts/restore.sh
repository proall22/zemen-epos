#!/usr/bin/env bash
# Restore a gzipped pg_dump into the running postgres container.
# Stops api/web first to drop live connections, restores, then restarts them.
# Usage: scripts/restore.sh backups/eirms-YYYYMMDD-HHMMSS.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

# Pick up the same POSTGRES_* values compose uses (root .env), if present.
[ -f .env ] && set -a && . ./.env && set +a

FILE="${1:-}"
DB="${POSTGRES_DB:-eirms}"
USER="${POSTGRES_USER:-eirms}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <backup-file.sql.gz>" >&2
  echo "Available backups:" >&2
  ls -1t backups/eirms-*.sql.gz 2>/dev/null | sed 's/^/  /' || echo "  (none in ./backups)" >&2
  exit 1
fi

echo "WARNING: this overwrites database '$DB' with $FILE"
printf "Type the database name '%s' to confirm: " "$DB"
read -r CONFIRM
[ "$CONFIRM" = "$DB" ] || { echo "Aborted."; exit 1; }

echo "[restore] stopping api/web to release DB connections..."
docker compose stop api web || true

echo "[restore] streaming $FILE -> postgres/$DB ..."
gunzip -c "$FILE" | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB"

echo "[restore] restarting api/web..."
docker compose start api web || true
echo "[restore] done."
