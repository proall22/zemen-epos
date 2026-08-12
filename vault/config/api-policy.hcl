# Policy granted to the EIRMS API's AppRole. The API needs to:
#   1. Create / list / inspect kv-v2 mounts named "m-<merchantId>" (one per
#      merchant). Vault policy globs match a whole path segment with `+`, so
#      `sys/mounts/+` covers any single-segment mount name. The application
#      is the gatekeeper of the naming convention.
#   2. Read / write / soft-delete kv-v2 secrets under those mounts. Paths
#      look like `m-<merchantId>/data/branches/<branchId>/eirms`.
#   3. Renew its own periodic token so a long-running API doesn't have to
#      re-AppRole-login on every leased TTL boundary.

path "sys/mounts/+" {
  capabilities = ["create", "read", "update", "delete", "sudo"]
}

path "+/data/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "+/metadata/*" {
  capabilities = ["read", "delete", "list"]
}

path "+/delete/*" {
  capabilities = ["update"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
