# Production-mode Vault config used by docker-compose. The `file` backend keeps
# storage on a host-mounted volume so secrets survive container restarts. The
# listener is plain HTTP because everything stays on the internal docker
# network; a real deployment would terminate TLS at the listener.

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = "true"
}

# Cluster address is required when running with the file backend even though
# we don't run HA — it's used to construct internal URLs.
api_addr     = "http://0.0.0.0:8200"
cluster_addr = "http://0.0.0.0:8201"

ui = true

# mlock is unavailable in some container hosts; disabling keeps boot reliable
# in dev. We compensate by relying on the host's swap discipline.
disable_mlock = true
