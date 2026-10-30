# Live demo: the metric log in front of `anfra serve`, on the e-commerce demo repo.
# Build from the repo root:
#   docker buildx build --platform linux/amd64 -f deploy/Dockerfile -t anfra-metric-log .
# trixie, not bookworm: the canal-query sidecar needs glibc 2.38 or newer
FROM debian:trixie-slim

# ANFRA_BIN is the linux binary in deploy/bin (anfra-linux-x64 for amd64, anfra-linux-arm64 for local arm64 tests)
ARG ANFRA_BIN=anfra-linux-x64

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini git nodejs npm \
 && rm -rf /var/lib/apt/lists/*

COPY deploy/bin/${ANFRA_BIN} /usr/local/bin/anfra

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY bin /app/bin
COPY src /app/src
COPY docs /app/docs
COPY demo /app/demo
COPY deploy/anfra-metric-log.yml /app/anfra-metric-log.yml
# the container's own data source config: same name, container path. No credentials (DuckDB file).
COPY deploy/data_sources.yml /app/demo/.anfra/data_sources.yml

# anfra writes its logs and sidecars under $HOME, and the platform may run this as any user id,
# so HOME and the app are writable by everyone.
ENV HOME=/tmp/home
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p /tmp/home \
 && chmod -R a+rwX /tmp/home /app \
 && chmod a+rx /usr/local/bin/entrypoint.sh \
 && chmod a+w /etc/passwd \
 && git config --system safe.directory '*' \
 && git config --system user.name "Metric log demo" \
 && git config --system user.email "demo@anfra-metric-log.invalid"

EXPOSE 8080
# tini is PID 1: anfra-node reads "my parent is PID 1" as "the host died"
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "bin/anfra-metric-log.js", "serve", "--config", "anfra-metric-log.yml"]
