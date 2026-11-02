# Wanderleaf on proto: anfra serve with the repo and its synthetic DuckDB baked in,
# behind a Caddy password gate. Build context is staged by deploy/build.sh (anfra lives outside the repo).
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends tini ca-certificates curl caddy \
 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 10001 app
COPY --chown=app:app anfra/ /home/app/.anfra/
COPY --chown=app:app repo/ /srv/wanderleaf/
COPY Caddyfile /etc/caddy/Caddyfile
COPY gate/ /srv/gate/
COPY start.sh /usr/local/bin/start.sh
USER app
ENV HOME=/home/app XDG_DATA_HOME=/home/app/.local/share XDG_CONFIG_HOME=/home/app/.config
WORKDIR /srv/wanderleaf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fs http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["/usr/local/bin/start.sh"]
