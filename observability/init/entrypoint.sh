#!/bin/sh
# Idempotent permission fixer for the observability bind-mounts. Runs as
# root in a tiny busybox sidecar and chowns the three host-mounted data
# directories to match the uid each upstream container expects.
#
# Why this exists: when host directories under ./observability/*/data are
# bind-mounted, the in-container user (uid 65534 / 10001 / 472) does not
# own the path and can't write to it. macOS / Docker Desktop's VFS layer
# silently maps ownership for the developer; bare Linux does not.
#
# Adjust the uid → service map below if you bump any image version that
# changes its runtime user.

set -eu

prom_dir=/data/prometheus
loki_dir=/data/loki
grafana_dir=/data/grafana

# uid:gid for each upstream image's runtime user.
prom_user="65534:65534"   # prom/prometheus → nobody:nogroup
loki_user="10001:10001"   # grafana/loki    → loki
grafana_user="472:0"      # grafana/grafana → grafana:root

mkdir -p "$prom_dir" "$loki_dir" "$grafana_dir"
chown -R "$prom_user"    "$prom_dir"
chown -R "$loki_user"    "$loki_dir"
chown -R "$grafana_user" "$grafana_dir"

echo "observability-init: chowned prometheus=$prom_user loki=$loki_user grafana=$grafana_user"
