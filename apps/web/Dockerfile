# syntax=docker/dockerfile:1.7
# Build context: repo root. Build with: docker build -f apps/web/Dockerfile .

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
COPY apps/web/package.json ./apps/web/
COPY packages/i18n-strings/package.json ./packages/i18n-strings/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- Build web (static assets) ----------
FROM install AS build
# VITE_ vars are inlined at build time, so Sentry config must arrive as build
# args. Empty by default → Sentry self-disables (see src/instrument.ts).
ARG VITE_SENTRY_DSN_WEB=""
ARG VITE_SENTRY_ENVIRONMENT=""
ARG VITE_SENTRY_TRACES_SAMPLE_RATE="0.1"
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_SENTRY_DSN_WEB=$VITE_SENTRY_DSN_WEB \
    VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT \
    VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
# The shared translation bundle must be built first — Vite resolves its
# compiled CJS output (`@eirms/i18n-strings`) at build time.
COPY packages/i18n-strings ./packages/i18n-strings
RUN pnpm --filter @eirms/i18n-strings build
COPY apps/web ./apps/web
RUN pnpm --filter @eirms/web build

# ---------- Runtime: static file server ----------
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 4999
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
  CMD wget --spider -q http://127.0.0.1:4999/healthz || exit 1
