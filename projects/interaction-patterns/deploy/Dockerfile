# syntax=docker/dockerfile:1
#
# The interaction gallery, live: the official anfra image serving anfra/ (the ecommerce
# Dataset and its DuckDB file) on loopback, and the gallery's Node server on :8080 in front.
#   docker build -f deploy/Dockerfile -t anfra-interaction-patterns .
#
# Pins, each by tag and digest:
# - anfra: docker buildx imagetools inspect ghcr.io/holistics/anfra:<version> | grep Digest
# - node:  docker buildx imagetools inspect node:<version>-trixie-slim | grep Digest
# Both are Debian trixie, so the node binary runs on the anfra image.

FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS node

# The page: one self-contained HTML file, plus index.html and the trailer media.
FROM node AS page
WORKDIR /src
COPY gallery gallery
COPY assets assets
COPY sdk sdk
COPY timeline/timeline.svg timeline/
COPY deploy/index.html deploy/
RUN node gallery/build.mjs

FROM ghcr.io/holistics/anfra:0.10.2@sha256:ddf02ede39bff1b7a6236f5a8cac3d7d2aea822edf3e4c7add04b5752794b4a0
COPY --from=node /usr/local/bin/node /usr/local/bin/node
USER root
# Root owns the data: a query that reaches the file system cannot rewrite it. anfra writes only .anfra/.
COPY anfra /repo
RUN chown -R root:root /repo && chown anfra:anfra /repo/.anfra
COPY deploy/server.mjs deploy/start.sh /opt/gallery/
COPY --from=page /src/site /opt/gallery/site
USER anfra
# Fail the build if the committed DuckDB file is stale against its seed.
RUN sh /repo/db/duckdb_stamps.sh

LABEL org.opencontainers.image.source=https://github.com/holistics/anfra-interaction-patterns
EXPOSE 8080
ENTRYPOINT ["tini", "-g", "--", "sh", "/opt/gallery/start.sh"]
CMD []
