#!/bin/sh
# ds-lint.sh [app]: every colour in apps/<app> (default mouka = the official app; archived looks: archive/<name>) comes
# from a token. Literal hex / rgb() colours may only live in ds/tokens.css and ds/themes.css; anywhere else a line needs a
# "ds-lint: allow" comment on it or the line above.
# For the official app it also checks the breakpoints: an @media width may only be one of the four frame breakpoints
# (max-width 1279 / 1023 / 899 / 599px, min-width 1280 / 1024 / 900 / 600px; apps/mouka/ds/layout.css).
APP=${1:-mouka}
cd "$(dirname "$0")/../../apps/$APP" || exit 2
hits=$(find . -name '*.css' -o -name '*.js' -o -name '*.html' | grep -v -e '^./ds/tokens.css$' -e '^./ds/themes.css$' | sort | while read -r f; do
  awk -v f="$f" '
    /ds-lint: allow/ { allow = NR + 1; next }
    NR != allow && /#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?([^0-9a-zA-Z_-]|$)|rgba?\(/ { print f ":" NR ": " substr($0, 1, 140) }' "$f"
done)
if [ -n "$hits" ]; then echo "$hits"; echo "ds-lint $APP: FAIL ($(echo "$hits" | wc -l | tr -d ' ') literal colour(s) outside ds/tokens.css + ds/themes.css)"; exit 1; fi
if [ "$APP" = mouka ]; then
  bp=$(find . -name '*.css' | sort | while read -r f; do
    grep -n '@media' "$f" | grep -o '[mx][ai][xn]-width: *[0-9]*px' | grep -v -E '^max-width: *(1279|1023|899|599)px$|^min-width: *(1280|1024|900|600)px$' | sed "s#^#$f: #"
  done)
  if [ -n "$bp" ]; then echo "$bp"; echo "ds-lint $APP: FAIL (an @media width that is not one of the four breakpoints)"; exit 1; fi
  echo "ds-lint $APP: PASS (no literal colours outside ds/tokens.css + ds/themes.css; @media widths = the four breakpoints)"
else
  echo "ds-lint $APP: PASS (no literal colours outside ds/tokens.css + ds/themes.css)"
fi
