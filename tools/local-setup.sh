#!/bin/sh
set -eu
# Compatibility entry point; the Node implementation also supports Windows.
exec node "$(dirname "$0")/local-setup.mjs"
