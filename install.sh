#!/usr/bin/env bash
# Thin wrapper around install.js for POSIX systems.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required but not found on PATH" >&2
  echo "       install from https://nodejs.org/ then re-run." >&2
  exit 1
fi
exec node "$DIR/install.js" "$@"
