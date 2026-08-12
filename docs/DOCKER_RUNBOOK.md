# Docker deployment runbook

## Required configuration

Docker Compose reads interpolation variables from the repository-root `.env`.
Keep `DATABASE_URL` there as the single authoritative Neon URL. The API's
`apps/api/.env` remains useful for the other application settings, but its
`DATABASE_URL` is deliberately overridden by Compose.

Recommended pooled Neon URL shape for this single API container:

```dotenv
DATABASE_URL=postgresql://USER:URL_ENCODED_PASSWORD@ep-XXXX-pooler.REGION.aws.neon.tech/neondb?sslmode=require&connect_timeout=15&pool_timeout=20&connection_limit=5
PRISMA_MIGRATE_RETRIES=6
```

Do not add quotes or shell `export` syntax. Percent-encode `@`, `:`, `/`, `?`,
`#`, and `%` when they occur in the password. Obtain a fresh connection string
from the exact Neon project and branch intended for this deployment.

## Build and start

```bash
docker compose config --quiet
docker compose build --pull api web
docker compose up -d redis vault vault-init
docker compose up -d api web
docker compose ps
docker compose logs --tail=200 api
```

The API entrypoint applies pending Prisma migrations before starting Nest. A
transient Neon P1017 is retried six times with incremental delays. An actual
bad URL still fails after the bounded retry instead of looping forever inside
one container.

## Verification

```bash
curl --fail http://127.0.0.1:4899/livez
curl --fail http://127.0.0.1:4899/healthz
curl --fail http://127.0.0.1:4999/healthz
docker compose ps
```

`/livez` checks only the API process. `/healthz` checks PostgreSQL and Redis;
use it to verify the full runtime. The startup log prints a sanitized database
host/database identity so it can be compared with psql without exposing the
password.

## Explicit migration or diagnostics

The normal entrypoint migrates automatically. To run Prisma explicitly while
bypassing the entrypoint:

```bash
docker compose run --rm --entrypoint node api \
  node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma
```

Inspect the built artifacts without starting the API:

```bash
docker run --rm --entrypoint sh zemen-epos-api:latest -c \
  'test -f /app/dist/main.js && test ! -f /app/.env'

docker run --rm --entrypoint nginx zemen-epos-web:latest -t
```

## Clean recovery

Use this when a previous partial build left confusing cache output. It does not
delete volumes or database data.

```bash
docker compose down --remove-orphans
docker compose build --no-cache api web
docker compose up -d
```

Do not run `docker compose down -v` unless deleting Redis/Vault state is
intentional.
