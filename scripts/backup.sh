#!/bin/sh
# Dump the Postgres DB to a timestamped gzip and prune old copies.
# Runs inside the `backup` sidecar (postgres:16-alpine, matching server version).
# Connection comes from PG* env vars; pg_dump reads them implicitly.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/eirms-$TS.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[backup] $(date) dumping '$PGDATABASE' -> $OUT"

# --clean --if-exists makes the dump restorable over an existing database.
tmp="$OUT.partial"
if pg_dump --clean --if-exists --no-owner --no-privileges | gzip -c > "$tmp"; then
  mv "$tmp" "$OUT"
  echo "[backup] ok: $(du -h "$OUT" | cut -f1)"
else
  rm -f "$tmp"
  echo "[backup] FAILED" >&2
  exit 1
fi

# Retention: delete dumps older than RETENTION_DAYS.
find "$BACKUP_DIR" -name 'eirms-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete
