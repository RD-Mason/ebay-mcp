#!/bin/sh
set -eu
unset NODE_OPTIONS NODE_PATH DYLD_INSERT_LIBRARIES LD_PRELOAD
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ ! -f "$PROJECT_DIR/.local/node-path" ]; then
  echo 'Local runtime has not been built, tested and sealed yet.' >&2
  exit 1
fi
NODE_BINARY=$(cat "$PROJECT_DIR/.local/node-path")
exec "$NODE_BINARY" "$PROJECT_DIR/scripts/run-local.mjs" "$@"
