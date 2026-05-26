---
name: Load Board PATCH route
description: Existing PATCH /api/load-board/:id — what it allows and guards.
---

## Rule
`PATCH /api/load-board/:id` (server/routes.ts) was already present. It allows the poster (or admin) to update: `postedPrice`, `notes`, `status`, `urgent`, `trailerPreference`, `pricingMode`.

**Why:** The Load Board edit page (load-board-edit.tsx) was built on top of this existing route — do not create a duplicate PATCH handler.

## How to apply
To extend editable fields, add the field name to the `allowed` array in the PATCH handler and update the Drizzle schema if needed.
