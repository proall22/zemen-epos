#!/bin/sh
# Make Linux bind mounts writable by the Vault image's `vault` account.
# Docker Desktop commonly masks this ownership mismatch, while bare Linux does
# not. Keep this UID/GID in sync with the pinned hashicorp/vault image.

set -eu

vault_user="100:1000"

mkdir -p /data /audit /approle
chown -R "$vault_user" /data /audit /approle

echo "vault-permissions: chowned data, audit, and approle to $vault_user"
