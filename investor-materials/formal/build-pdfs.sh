#!/usr/bin/env bash
# Regenerate all "formal" GUBER PDF package documents from their HTML sources.
# Usage: ./investor-materials/formal/build-pdfs.sh
# Requires: chromium (or google-chrome) on PATH. On Replit/NixOS this is already provisioned.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/pdf"
mkdir -p "$OUT"

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
  echo "-> Rendering $(basename "$src") -> $(basename "$out")"
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

render "$DIR/investor-deck.html"                "$OUT/01-GUBER-Investor-Deck.pdf"
render "$DIR/executive-summary.html"            "$OUT/02-GUBER-Executive-Summary.pdf"
render "$DIR/business-partnership-packet.html"  "$OUT/03-GUBER-Business-Partnership-Packet.pdf"
render "$DIR/loi.html"                          "$OUT/04-GUBER-Letter-of-Intent.pdf"
render "$DIR/nda.html"                          "$OUT/05-GUBER-Mutual-NDA.pdf"
render "$DIR/one-sheet.html"                    "$OUT/06-GUBER-One-Sheet.pdf"
render "$DIR/investor-term-sheet.html"          "$OUT/07-GUBER-Investor-Term-Sheet.pdf"
render "$DIR/sponsorship-opportunities.html"    "$OUT/08-GUBER-Sponsorship-Opportunities.pdf"

echo "Done. PDFs written to $OUT"
ls -la "$OUT"/*.pdf
