# syntax=docker/dockerfile:1
# Kumquat Kite POC: the app server (Node 22) with its private anfra core, for a plain PostgreSQL 17 database.
# The image holds code, the migrations, the AML, the panels and the synthetic snapshot: no .env.local, no credential,
# no backup (.dockerignore). At start, deploy/start.sh applies new migrations (when the owner's password is given) and
# runs server/server.mjs on 0.0.0.0:8787, which writes anfra's data source from the environment. The anfra core listens
# on a private loopback port inside the container and is reached only through the server's checked proxy.
#
#   docker compose --env-file .env.local --profile container up --build app     (local test, http://127.0.0.1:8790)
#   docker buildx build --platform linux/amd64 -t kumquat-kite:local .
#
# Runtime environment (config/environment.example):
#   KK_DB_HOST, KK_DB_PORT, KK_DB_NAME, KK_DB_SSL (require or verify-full for a hosted database), KK_DB_OWNER
#   secrets: KK_APP_DB_PASSWORD (required), ANFRA_DB_PASSWORD (governed figures), KK_SESSION_SECRET (demo sessions that
#   survive a restart), KK_DB_OWNER_PASSWORD (optional: migrations at start)
#   KK_SEED_IF_EMPTY=1 (optional): load the demo data into a database that has no project yet; never a reset

ARG NODE_IMAGE=node:22-trixie-slim@sha256:154ba2f4d6fec323d28e4f4bb86bba4677f1223391a1979cf521304e03a98dfa
ARG ANFRA_IMAGE=ghcr.io/holistics/anfra:0.8.0@sha256:e8b34478c0d25890ea0e1fd52e7742cbc36f828338ec7cc993b5add2dbb3599f

# Stage 1, on the build machine's platform: the browser bundle (plain JavaScript output, so no emulation is needed).
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS bundle
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY web/ web/
COPY shared/ shared/
COPY server/build.mjs server/build.mjs
COPY scripts/lib/env.mjs scripts/lib/env.mjs
RUN node server/build.mjs

# Stage 2, on the build machine's platform: production dependencies (pg and the SDK: plain JavaScript).
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# Stage 3, the runtime: Debian trixie (the glibc anfra's sidecars need) with Node 22, plus the pinned official anfra
# 0.8.0 binary and tini from anfra's own image. Only COPY steps, so an amd64 build on Apple silicon needs no
# emulation. Runs as the image's `node` user (UID 1000): anfra's sidecars look their user up by name.
FROM ${ANFRA_IMAGE} AS anfra
FROM ${NODE_IMAGE}
COPY --from=anfra /usr/local/bin/anfra /usr/local/bin/anfra
COPY --from=anfra /usr/bin/tini /usr/bin/tini
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /build/node_modules node_modules/
COPY --chown=node:node server/ server/
COPY --chown=node:node shared/ shared/
COPY --chown=node:node db/ db/
COPY --chown=node:node scripts/lib/ scripts/lib/
COPY --chown=node:node scripts/seed/ scripts/seed/
COPY --chown=node:node scripts/configure_anfra.mjs scripts/migrate.mjs scripts/seed_demo.mjs scripts/import_snapshot.mjs scripts/
COPY --chown=node:node web/public/ web/public/
COPY --from=bundle --chown=node:node /build/web/dist/ web/dist/
COPY --chown=node:node anfra/ anfra/
COPY --chown=node:node config/ config/
COPY --chown=node:node data/ data/
COPY --chown=node:node content/ content/
COPY --chown=node:node deploy/start.sh deploy/start.sh
USER node
ENV NODE_ENV=production \
    KK_CONFIG_FROM_ENV=1 \
    HOST=0.0.0.0 \
    PORT=8787 \
    SKIP_BUILD=1 \
    KK_LOG_DIR=/home/node/logs \
    ANFRA_BIN=/usr/local/bin/anfra \
    ANFRA_NO_UPDATE_NOTIFIER=1 \
    ANFRA_HIDE_ERROR_CAUSES=1 \
    ANFRA_LOG_STDERR=1 \
    TZ=Etc/UTC
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "deploy/start.sh"]
