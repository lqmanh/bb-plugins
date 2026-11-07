#!/usr/bin/env bash
set -euo pipefail

command="${1:?usage: run-all.sh <install|check|build|test>}"

for dir in plugins/*/; do
  [ -f "${dir}package.json" ] || continue
  printf '\n==> %s\n' "${dir%/}"
  if [ "$command" = "install" ]; then
    (cd "$dir" && npm install)
  else
    (cd "$dir" && npm run "$command")
  fi
done
