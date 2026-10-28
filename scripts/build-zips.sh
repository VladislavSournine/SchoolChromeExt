#!/usr/bin/env bash
# Packs every extensions/<name>/ into dist/<name>.zip (tests and docs excluded).
# The zip holds a top-level <name>/ folder — that is the folder users pick in Chrome.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/dist"
cd "$root/extensions"
for dir in */; do
  name="${dir%/}"
  [ -f "$name/manifest.json" ] || continue
  rm -f "$root/dist/$name.zip"
  zip -qr "$root/dist/$name.zip" "$name" -x "$name/tests/*" "$name/docs/*" "*.DS_Store" "*.sha256"
  echo "dist/$name.zip"
done
