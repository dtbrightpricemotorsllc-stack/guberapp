#!/usr/bin/env bash
# Regenerate the investor-deck and executive-summary PDFs from their HTML sources.
# Run this whenever you edit either HTML file.
#
# Usage: ./investor-materials/build-pdfs.sh
#
# Requires: chromium (or google-chrome) on PATH. On Replit/NixOS this is already provisioned.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v chromium >/dev/null 2>&1; then
  CHROME=chromium
elif command -v google-chrome >/dev/null 2>&1; then
  CHROME=google-chrome
elif command -v chrome >/dev/null 2>&1; then
  CHROME=chrome
else
  echo "Error: chromium/google-chrome not found on PATH." >&2
  exit 1
fi

render() {
  local src="$1"
  local out="$2"
  echo "→ Rendering $(basename "$src") → $(basename "$out")"
  "$CHROME" \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --disable-dev-shm-usage \
    --no-pdf-header-footer \
    --print-to-pdf-no-header \
    --hide-scrollbars \
    --window-size=1280,720 \
    --force-device-scale-factor=2 \
    --virtual-time-budget=30000 \
    --print-to-pdf="$out" \
    "file://$src" >/dev/null 2>&1
}

render "$DIR/investor-deck.html"      "$DIR/GUBER-Investor-Deck.pdf"
render "$DIR/executive-summary.html"  "$DIR/GUBER-Executive-Summary.pdf"

echo "Done. PDFs written to $DIR"
ls -la "$DIR"/*.pdf
