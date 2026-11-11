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
    if [ ! -f .env.local ]; then
      printf '%s\n' 'Run ./sourced init first.' >&2
      exit 2
    fi
    node --import /app/node_modules/tsx/dist/loader.mjs --conditions=react-server \
      --env-file-if-exists=.env.local /app/scripts/sourced.ts config:snapshot >&2
    node --import /app/node_modules/tsx/dist/loader.mjs --conditions=react-server \
      --env-file-if-exists=.env.local --input-type=module <<'JS'
import { initializeDatabase } from '/app/lib/cli/commands/database.ts';
import { getKitConfig } from '/app/lib/kit/runtime-config.ts';
await initializeDatabase(getKitConfig());
JS
    exec node /app/node_modules/next/dist/bin/next start /app --hostname 0.0.0.0 --port 3000
    ;;
  *) printf '%s\n' 'Expected app or cli.' >&2; exit 2 ;;
esac
