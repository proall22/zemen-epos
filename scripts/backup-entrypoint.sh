#!/bin/sh
# Entrypoint for the backup sidecar: schedule backup.sh via busybox cron and
# take one immediate baseline dump so a fresh deploy isn't unprotected until
# the first scheduled run.
set -eu

CRON="${BACKUP_CRON:-0 2 * * *}"

# Route cron job output to PID 1 (crond) so it shows up in `docker logs`.
echo "$CRON /usr/local/bin/backup.sh >/proc/1/fd/1 2>/proc/1/fd/2" > /etc/crontabs/root
echo "[backup] scheduled '$CRON' (retention ${BACKUP_RETENTION_DAYS:-14}d)"

/usr/local/bin/backup.sh || echo "[backup] baseline dump failed; will retry on schedule" >&2

exec crond -f -l 8
