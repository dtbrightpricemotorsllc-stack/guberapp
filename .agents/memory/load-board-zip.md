---
name: Load Board ZIP migration
description: pickup_zip/delivery_zip columns added to DB; correct migration pattern for this project.
---

## Rule
`pickup_zip` and `delivery_zip` TEXT (nullable) columns exist in `load_board_listings` as of May 2026. They are optional — existing rows have NULL. The schema.ts reflects them.

**Why:** Audit required ZIP-first UX on the Load Board posting wizard. Columns added to support persisting ZIP alongside city/state.

## How to apply
- Raw SQL migrations: use `require('pg')` not `@neondatabase/serverless` (that package is not installed).
- ZIP auto-fill uses the free public API `https://api.zippopotam.us/us/{zip}` — returns `places[0]["place name"]` and `places[0]["state abbreviation"]`.
- "Use My Location" calls `/api/places/reverse-geocode?lat=X&lng=Y` (server returns `{ address, zip }`).
