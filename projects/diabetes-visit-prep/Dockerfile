# syntax=docker/dockerfile:1
#
# The node, host and anfra pins are holistics/anfra-demo-data's, so the app runs on the same host
# and anfra as demo.anfra.ai. The host's @holistics/anfra-sdk must match anfra's version: bump the two together.

FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS host
ADD https://github.com/holistics/anfra-host-example.git#6bc9a4a270f94eb10f130fc3f0cc23cf8d00b97d /host
WORKDIR /host
# The metric tooltips read their text through Anfra.lineage(), which this host doesn't offer until
# its SDK 0.11 commit c22db31: its server refuses core.lineage, and the inspector's wrapper around
# the frame's backend drops lineage, so the SDK tells the app it can't trace. Let core.lineage
# through as that commit does, held to the query limit, and keep lineage on the wrapped backend.
# The greps fail the build if the host's source no longer matches what the seds expect.
RUN sed -i \
      -e "s/new Set(\['core.query', 'core.query.export', 'core.show'\])/new Set(['core.lineage', 'core.query', 'core.query.export', 'core.show'])/" \
      -e "/api.use('\/core.query.export'/a\\  api.use('/core.lineage', rateLimit(config.queryRateLimit, clientOf));" \
      server/anfra.ts && \
    sed -i "/record: (backend) => ({/a\\      ...(backend.lineage \&\& { lineage: backend.lineage })," src/inspector/model/requests.ts && \
    grep -q "new Set(\['core.lineage'" server/anfra.ts && \
    grep -q "api.use('/core.lineage'" server/anfra.ts && \
    grep -q "lineage: backend.lineage" src/inspector/model/requests.ts
RUN corepack enable && CI=true pnpm install --frozen-lockfile && pnpm build && \
    rm -rf node_modules && CI=true pnpm install --frozen-lockfile --prod --ignore-scripts

FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS data
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY scripts/generate.mjs scripts/
RUN node scripts/generate.mjs

FROM ghcr.io/holistics/anfra:0.10.2@sha256:ddf02ede39bff1b7a6236f5a8cac3d7d2aea822edf3e4c7add04b5752794b4a0
COPY --from=host /usr/local/bin/node /usr/local/bin/node
COPY --from=host /host/package.json /opt/anfra-host/package.json
COPY --from=host /host/dist /opt/anfra-host/dist
COPY --from=host /host/node_modules /opt/anfra-host/node_modules
# Root owns the repo: a query that reaches the file system (DuckDB's profiling_output can
# write any path) cannot rewrite the data or the apps. anfra writes only its own .anfra/.
COPY . /repo
COPY --from=data /build/data/health.duckdb /repo/data/health.duckdb
COPY docker/data_sources.yml /repo/.anfra/data_sources.yml
USER root
RUN chown root:root /repo && chown anfra:anfra /repo/.anfra
USER anfra
EXPOSE 5173
ENTRYPOINT ["tini", "-g", "--", "sh", "/repo/docker/start.sh"]
