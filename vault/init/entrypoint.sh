#!/bin/sh
# Idempotent Vault bootstrap. Runs as a one-shot sidecar after the `vault`
# service is healthy. Each step checks the current state before mutating, so
# `docker compose up` is safe to run repeatedly and existing state (unseal
# keys, policies, AppRole secret_id files) is preserved across restarts.
#
# Outputs on the shared volume:
#   /vault/data/init.json       — unseal key(s) + root token (gitignored)
#   /vault/approle/role-id      — AppRole role_id, mounted RO into the api
#   /vault/approle/secret-id    — AppRole secret_id (long-lived, unlimited use)
#
# All three contain secrets in plaintext. The directories are bind-mounts on
# the host so the host owner sees the same files; treat them like the rest of
# `.env` material — restricted to the developer's account.

set -eu

export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"

INIT_FILE=/vault/data/init.json
APPROLE_DIR=/vault/approle
AUDIT_DIR=/vault/audit
POLICY_FILE=/vault/config/api-policy.hcl
ROLE_NAME=eirms-api
POLICY_NAME=eirms-api

mkdir -p "$APPROLE_DIR" "$AUDIT_DIR"

# `jq` keeps the rest of the script grep-free and reliable across vault output
# changes. The vault image is alpine-based so apk works; suppress noise if it's
# already installed.
if ! command -v jq >/dev/null 2>&1; then
  apk add --no-cache jq >/dev/null 2>&1 || {
    echo "vault-init: failed to install jq; falling back to grep parsing." >&2
  }
fi

# Wait until the vault server answers. `vault status` exits 2 when sealed, 0
# when ready — both mean "the server is up", which is all we need to proceed.
for _ in $(seq 1 30); do
  if vault status >/dev/null 2>&1 || [ "$?" = "2" ]; then
    break
  fi
  echo "vault-init: waiting for vault to listen..."
  sleep 1
done

read_json_field() {
  # $1 = file, $2 = jq path. Falls back to grep when jq isn't installable.
  if command -v jq >/dev/null 2>&1; then
    jq -r "$2" "$1"
    return
  fi
  case "$2" in
    *\[0\]*)
      # Array-first-element form, e.g. `.unseal_keys_b64[0]` → matches
      # `"unseal_keys_b64": ["XXXX"`.
      key="$(echo "$2" | sed 's/^\.//; s/\[0\]$//')"
      grep -o "\"$key\":[[:space:]]*\[\"[^\"]*\"" "$1" | head -1 \
        | sed 's/.*\["\([^"]*\)".*/\1/'
      ;;
    *)
      key="$(echo "$2" | sed 's/^\.//')"
      grep -o "\"$key\":[[:space:]]*\"[^\"]*\"" "$1" | head -1 \
        | sed 's/.*:[[:space:]]*"\(.*\)"/\1/'
      ;;
  esac
}

status_field() {
  # $1 = field name ("initialized" or "sealed"). Tolerant of `vault status`
  # exiting non-zero when sealed.
  out="$(vault status -format=json 2>/dev/null || true)"
  if command -v jq >/dev/null 2>&1; then
    echo "$out" | jq -r ".${1}"
  else
    echo "$out" | grep -o "\"${1}\":[[:space:]]*[a-z]*" | head -1 \
      | sed "s/.*:[[:space:]]*\([a-z]*\)/\1/"
  fi
}

# ----- 1. init ---------------------------------------------------------------
if [ "$(status_field initialized)" != "true" ]; then
  echo "vault-init: initialising (1-of-1 unseal key, dev defaults)..."
  vault operator init -format=json -key-shares=1 -key-threshold=1 > "$INIT_FILE"
  chmod 600 "$INIT_FILE"
else
  echo "vault-init: already initialised."
fi

if [ ! -s "$INIT_FILE" ]; then
  echo "vault-init: $INIT_FILE missing or empty — vault was initialised out-of-band; cannot continue." >&2
  exit 1
fi

UNSEAL_KEY="$(read_json_field "$INIT_FILE" '.unseal_keys_b64[0]')"
ROOT_TOKEN="$(read_json_field "$INIT_FILE" '.root_token')"

if [ -z "$UNSEAL_KEY" ] || [ -z "$ROOT_TOKEN" ]; then
  echo "vault-init: could not parse unseal key / root token from $INIT_FILE." >&2
  echo "vault-init: install jq in the image or extract the values manually." >&2
  exit 1
fi

# ----- 2. unseal -------------------------------------------------------------
if [ "$(status_field sealed)" = "true" ]; then
  echo "vault-init: unsealing..."
  vault operator unseal "$UNSEAL_KEY" >/dev/null
else
  echo "vault-init: already unsealed."
fi

export VAULT_TOKEN="$ROOT_TOKEN"

# ----- 3. file audit device --------------------------------------------------
if ! vault audit list -format=json 2>/dev/null | grep -q '"file/"'; then
  echo "vault-init: enabling file audit device → /vault/audit/vault.log"
  vault audit enable file file_path=/vault/audit/vault.log
else
  echo "vault-init: file audit device already enabled."
fi

# ----- 4. policy -------------------------------------------------------------
echo "vault-init: writing policy '$POLICY_NAME'."
vault policy write "$POLICY_NAME" "$POLICY_FILE"

# ----- 5. AppRole auth + role -----------------------------------------------
if ! vault auth list -format=json 2>/dev/null | grep -q '"approle/"'; then
  echo "vault-init: enabling AppRole auth."
  vault auth enable approle
fi

# Token is periodic so the api can renew indefinitely with renew-self instead
# of re-AppRole-logging-in on every TTL boundary. secret_id is unlimited for
# dev; production should rotate it.
vault write auth/approle/role/"$ROLE_NAME" \
  token_policies="$POLICY_NAME" \
  token_ttl=1h \
  token_max_ttl=24h \
  token_period=1h \
  secret_id_ttl=0 \
  secret_id_num_uses=0 >/dev/null

# ----- 6. role-id / secret-id materialisation -------------------------------
if [ ! -s "$APPROLE_DIR/role-id" ] || [ ! -s "$APPROLE_DIR/secret-id" ]; then
  echo "vault-init: minting role-id + secret-id under $APPROLE_DIR."
  ROLE_ID="$(vault read -field=role_id auth/approle/role/"$ROLE_NAME"/role-id)"
  SECRET_ID="$(vault write -field=secret_id -f auth/approle/role/"$ROLE_NAME"/secret-id)"
  printf '%s' "$ROLE_ID"   > "$APPROLE_DIR/role-id"
  printf '%s' "$SECRET_ID" > "$APPROLE_DIR/secret-id"
  # 644 because the api container runs as `node` (uid 1000) while we run as
  # `vault` (uid 100) — group access wouldn't help. The files live in a host
  # bind-mount the developer already controls.
  chmod 644 "$APPROLE_DIR/role-id" "$APPROLE_DIR/secret-id"
else
  echo "vault-init: existing AppRole credentials in $APPROLE_DIR — leaving alone."
fi

echo "vault-init: done."
