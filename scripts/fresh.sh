#!/bin/sh
# Open a copy of Tembo as someone opening it for the first time sees it:
# no library, no attempts, no settings, and no downloaded Watering Hole.
#
#   npm run fresh                      # the app in /Applications
#   sh scripts/fresh.sh path/to/Tembo.app
#
# Your own data is not touched: this copy keeps everything in a new temporary
# folder (TEMBO_HOME), printed below. It runs beside your own Tembo; quit it
# with ⌘Q like any app.
set -eu
app="${1:-/Applications/Tembo.app}"
[ -x "$app/Contents/MacOS/Tembo" ] || { echo "fresh: no Tembo at $app" >&2; exit 1; }
home="$(mktemp -d "${TMPDIR:-/tmp}/tembo-fresh.XXXXXX")"
echo "Fresh copy; its files are in $home"
TEMBO_HOME="$home" exec "$app/Contents/MacOS/Tembo"
