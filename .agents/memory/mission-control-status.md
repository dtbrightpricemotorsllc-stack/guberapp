---
name: Mission Control /status endpoint — what actually drives GREEN/RED
description: The GREEN/RED of the mission-control status endpoint depends only on the watchdog's 3 checks, NOT on DB columns or env vars.
---

# What makes `/api/internal/mission-control/status` GREEN vs RED

The endpoint (`handleMissionControlStatus` in `server/routes.ts`) spawns `scripts/automated-watchdog.mjs --json` and maps its `status` to HTTP (GREEN→200, RED→503). The watchdog's `status` is computed from **exactly three** error sources:
1. state-bleed audit (`scripts/audit-statebleed.mjs`)
2. the 7 `PROTECTED_TEST_SUITES` (vitest)
3. `MANIFEST_REQUIREMENTS` — native Android/iOS manifest/plist/entitlement keys only

**It never queries the database and never reads env vars like `VITE_GOOGLE_MAPS_API_KEY`.**

**Why this matters:** A request to "make mission-control GREEN by adding a DB column or env var" is based on a false premise — neither affects this endpoint. There is a *separate* health surface (`server/os/health-checks.ts`, e.g. `checkNativeMapsKey`) that DOES inspect env vars and run live API/DB probes; don't confuse the two. To verify the endpoint locally: `curl -H "x-cron-secret: $CRON_SECRET" localhost:5000/api/internal/mission-control/status` (the code_execution sandbox has no `process.env`, so use bash).

# Google Maps key wiring (non-obvious)

- Client gets its Maps JS key at **runtime** from `GET /api/config` (`{ googleMapsApiKey }`), which returns `process.env.GOOGLE_MAPS_API_KEY`. **No client code reads `VITE_GOOGLE_MAPS_API_KEY`** — maps work without it.
- Therefore `GOOGLE_MAPS_API_KEY` is already public (served to browsers) and must be HTTP-referrer-restricted. `GOOGLE_GEOCODING_API_KEY` is the separate *unrestricted server* key; server code prefers it for geocoding/Places because the Maps key may be referrer-locked.
- Setting `VITE_GOOGLE_MAPS_API_KEY` only flips the `checkNativeMapsKey` line in health-checks.ts from warn→ok; it does not change app behavior or the watchdog endpoint.
