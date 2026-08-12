# syntax=docker/dockerfile:1.7
# Build context: repo root. Build with: docker build -f apps/api/Dockerfile .

ARG NODE_VERSION=22-alpine

# ---------- Base: corepack + pnpm ----------
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# ---------- Install workspace deps ----------
FROM base AS install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/web/package.json ./apps/web/
COPY packages/i18n-strings/package.json ./packages/i18n-strings/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
RUN pnpm --filter @eirms/api exec prisma generate

# ---------- Build API + extract production deploy bundle ----------
FROM install AS build
# The shared translation bundle must be built first — the API imports its
# compiled CJS output (`@eirms/i18n-strings`) at build + runtime.
COPY packages/i18n-strings ./packages/i18n-strings
RUN pnpm --filter @eirms/i18n-strings build
COPY apps/api ./apps/api
RUN cd /repo/apps/api \
 && pnpm exec nest build \
 && cp -R /repo/apps/api/dist /tmp/api-dist \
 && cd /repo \
 && pnpm --filter @eirms/api --legacy deploy --prod /deploy/api

# pnpm deploy copies package sources/dependencies but deliberately omits the
# gitignored build output. Stage it explicitly and assert the runtime contract.
RUN cp -R /tmp/api-dist /deploy/api/dist \
 && rm -f /deploy/api/.env /deploy/api/.env.* \
 && cd /deploy/api \
 && node node_modules/prisma/build/index.js generate --schema=./prisma/schema.prisma \
 && test -f /deploy/api/dist/main.js

# ---------- Runtime ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4899

# openssl needed by the Prisma query engine on Alpine
RUN apk add --no-cache openssl

COPY --from=build /deploy/api/node_modules ./node_modules
COPY --from=build /deploy/api/dist ./dist
COPY --from=build /deploy/api/package.json ./
COPY --from=build /repo/apps/api/prisma ./prisma
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod 755 ./docker-entrypoint.sh

USER node
EXPOSE 4899
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:4899/livez || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
