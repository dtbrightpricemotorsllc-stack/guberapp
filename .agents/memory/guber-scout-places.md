---
name: Guber Scout live data source
description: Which Google key has Places enabled, and the SSRF rule for website enrichment
---

# Guber Scout — Google Places + website enrichment

Admin tool `/admin/guber-scout` pulls real local businesses via the **official Google Places API** (legacy Text Search → Place Details), not scrapers. User explicitly rejected Apify/SerpApi/Instagram scrapers (ToS + cost + breakage = doesn't scale).

## Key precedence quirk
- `GOOGLE_MAPS_API_KEY` has the **Places API enabled**; `GOOGLE_GEOCODING_API_KEY` does **NOT** (returns `REQUEST_DENIED` for Places, though it works for Geocoding).
- So Scout's `MAPS_KEY` prefers `GOOGLE_MAPS_API_KEY` first — the opposite of the rest of the app, which prefers the geocoding key.
- **Why:** the two keys have different API restrictions on the Google Cloud project. Verify with a live `place/textsearch` call before assuming a key works for a given Google API; "geocoding works" ≠ "Places works".

## SSRF rule for website social-link extraction
- The tool fetches each business's OWN website (value comes from Place Details = attacker-influenceable) to scrape an IG/FB/TikTok link.
- Any server-side fetch of an externally-supplied URL MUST go through the SSRF guard: DNS-resolve the host and block private/loopback/link-local/CGNAT/multicast IPs (v4+v6 incl. IPv4-mapped), block localhost/.local/.internal, enforce http/https + port 80/443 only, re-validate every redirect hop (use `redirect: "manual"`), and cap the body via streamed reads (not `text().slice`).
- **Why:** architect flagged this as a critical SSRF (cloud-metadata 169.254.169.254 etc.). `sanitizeUrl` only guards client link schemes, not server fetches.
