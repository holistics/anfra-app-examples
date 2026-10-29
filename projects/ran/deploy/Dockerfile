# Ran as one read-only demo container: the sample database (deploy/dump-db.sh), anfra and Ran's
# host. Every page reads through AQL, the Race planner included (db/views.d/60_scenario.sql): no
# Python at run time, nothing written back. Debian trixie throughout: anfra's sidecars need its glibc (2.38+). Built from the repo root:
#
#   deploy/dump-db.sh
#   docker buildx build --platform linux/amd64 -f deploy/Dockerfile -t ran-demo .   (the deploy; linux/arm64 to try it on a Mac)
#   docker run --rm -p 8080:8080 ran-demo          # http://localhost:8080
#
# The page is the host's production build, with the three Data Apps: Overview, Activities, Race planner.

FROM node:22-trixie-slim AS host
RUN corepack enable
WORKDIR /host
COPY host/package.json host/pnpm-lock.yaml host/pnpm-workspace.yaml host/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY host/ ./
RUN pnpm build && CI=1 pnpm prune --prod

FROM ghcr.io/holistics/anfra:0.9.0 AS anfra

FROM postgres:15-trixie
COPY --from=host /usr/local/bin/node /usr/local/bin/node
COPY --from=anfra /usr/local/bin/anfra /usr/local/bin/anfra
ENV PGDATA=/var/lib/ran/pg HOME=/home/ran ANFRA_NO_UPDATE_NOTIFIER=1 PORT=8080 TZ=Asia/Ho_Chi_Minh
RUN mkdir -p /var/lib/ran /home/ran /srv/ran && chown -R postgres:postgres /var/lib/ran /home/ran /srv/ran
USER postgres

# The sample database, restored at build so the container starts in seconds. The reader role anfra
# connects as can only read, and a runaway query stops after 30 s. JIT off: it costs seconds on the
# planner's big views (race_limiter: 7 s with it, 0.4 s without).
COPY --chown=postgres deploy/build/demo.dump /tmp/demo.dump
RUN initdb -D "$PGDATA" --auth=trust --username=postgres >/dev/null \
 && printf "listen_addresses = '127.0.0.1'\ntimezone = 'Asia/Ho_Chi_Minh'\njit = off\n" >> "$PGDATA/postgresql.conf" \
 && pg_ctl -D "$PGDATA" -w -l /tmp/postgres.log start \
 && createdb garmin \
 && psql -q -v ON_ERROR_STOP=1 -d garmin -c "create role anfra_reader login password 'anfra_reader'" \
 && pg_restore --no-owner --no-privileges --exit-on-error -d garmin /tmp/demo.dump \
 && psql -q -v ON_ERROR_STOP=1 -d garmin \
      -c "grant usage on schema raw, garmin, app to anfra_reader" \
      -c "grant select on all tables in schema raw, garmin, app to anfra_reader" \
      -c "alter role anfra_reader set default_transaction_read_only = on" \
      -c "alter role anfra_reader set statement_timeout = '30s'" \
      -c "vacuum analyze" \
 && pg_ctl -D "$PGDATA" -w stop \
 && rm /tmp/demo.dump

# The Data Folder anfra serves: models, datasets and the apps.
COPY --chown=postgres models /srv/ran/models
COPY --chown=postgres datasets /srv/ran/datasets
COPY --chown=postgres apps /srv/ran/apps
COPY --chown=postgres deploy/data_sources.yml /srv/ran/.anfra/data_sources.yml
COPY --from=host --chown=postgres /host/package.json /srv/ran/host/package.json
COPY --from=host --chown=postgres /host/node_modules /srv/ran/host/node_modules
COPY --from=host --chown=postgres /host/dist /srv/ran/host/dist
COPY --chown=postgres deploy/start.sh /usr/local/bin/ran-start

EXPOSE 8080
CMD ["ran-start"]
