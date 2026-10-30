#!/bin/sh
# Needs docker buildx, `proto login`, and Docker logged in to ghcr.io with a token that can write
# packages (README: "Deploy").
# IMAGE: where to push, by default a package under your own GitHub account.
set -eu
cd "$(dirname "$0")/.."
app=diabetes-visit-prep
site=https://$app.pages.holistics.dev

fail() { echo "deploy: $*" >&2; exit 1; }
for cmd in git gh docker proto curl; do
  command -v "$cmd" >/dev/null || fail "$cmd not found"
done
# The image is built from the working tree, and its tag names the commit.
[ -z "$(git status --porcelain -- . ':(exclude)notes')" ] || fail 'uncommitted changes: commit them first'
image=${IMAGE:-ghcr.io/$(gh api user --jq .login)/$app}

tag=$(git describe --always)-$(date +%Y%m%d%H%M)
echo "deploy: building and pushing $image:$tag"
docker buildx build --platform linux/amd64 --push -t "$image:$tag" .
echo "deploy: deploying $tag to $site"
# --port: the base image also exposes anfra's 7878. --yes keeps the site public.
proto deploy --image "$image:$tag" --name "$app" --port 5173 --yes
echo "deploy: $site/health (the old version may answer for a minute or two):"
curl -fsS "$site/health" && echo
