#!/bin/sh
set -eu
export TSX_TSCONFIG_PATH=/app/tsconfig.json
mode=${1:-app}
[ "$#" -eq 0 ] || shift
case "$mode" in
  cli)
    exec node --import /app/node_modules/tsx/dist/loader.mjs --conditions=react-server \
      --env-file-if-exists=.env.local /app/scripts/sourced.ts "$@"
    ;;
  app)
    # D-137: on failure this writes .sourced/startup-error.* for ./sourced dev and
    # prints one startup.failed line instead of a stack trace.
    node --import /app/node_modules/tsx/dist/loader.mjs --conditions=react-server \
      --env-file-if-exists=.env.local /app/scripts/app-startup.ts || exit 1
    # T-88: without a provider key the app opens in setup mode (local profile only).
    SOURCED_SETUP_MODE=1 exec node /app/node_modules/next/dist/bin/next start /app --hostname 0.0.0.0 --port 3000
    ;;
  *) printf '%s\n' 'Expected app or cli.' >&2; exit 2 ;;
esac
