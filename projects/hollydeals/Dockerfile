# anfra serve for HollyDeals on the sample DuckDB file, built from this folder for linux/amd64:
#   docker buildx build --platform linux/amd64 -t hollydeals --load .
# The version matches the anfra whose canal-query was tested against the file (0.13.3 reads files built by DuckDB
# 1.4.4); DuckDB is pinned in requirements.txt. Bump both together and check the file still opens.
FROM ghcr.io/holistics/anfra:0.13.3@sha256:7466b3a7af77dc6853fcc37c26a73189672b78a975169684ad8275b0fd4776ba
COPY --chown=anfra:anfra apps /repo/apps
COPY --chown=anfra:anfra models /repo/models
COPY --chown=anfra:anfra datasets /repo/datasets
COPY --chown=anfra:anfra data/funnel.duckdb /repo/data/funnel.duckdb
COPY --chown=anfra:anfra .anfra/context_sources.yml /repo/.anfra/context_sources.yml
COPY --chown=anfra:anfra .anfra/data_sources.yml /repo/.anfra/data_sources.yml
COPY --chown=1000:1000 --chmod=755 entrypoint.sh /usr/local/bin/entrypoint.sh
# Serves other people: an error must not show SQL, paths or connection details.
ENV ANFRA_HIDE_ERROR_CAUSES=1
EXPOSE 7878
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
