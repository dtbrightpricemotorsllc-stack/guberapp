---
name: jobs table column traps + latent broken queries
description: The jobs table's real column names for assignment/soft-delete/etc., and a warning that copying nearby queries propagates non-existent-column bugs.
---

When writing raw SQL against `jobs` (and related marketplace/load-board tables) in this repo, do NOT trust nearby queries — several existing ones reference columns that don't exist and would throw at runtime. Verify column names against the live DB / `shared/schema.ts` before shipping.

Confirmed real column names:
- `jobs`: assignment column is **`assigned_helper_id`** (NOT `assigned_worker_id` — that name lives on a *different* table). `jobs` has **no `deleted_at`** soft-delete timestamp; exclude admin-removed rows with `removed_by_admin`. Test rows filtered via `is_test_job`.
- `load_board_listings`: the hauled-item description field is **`commodity_type`** (there is no `cargo_type`).
- `marketplace_offers`: FK to `marketplace_items.id` is **`listing_id`** (not `item_id`).

**Why:** The JAC D.D. planner (`buildDDPlan` in `server/routes.ts`) shipped with `assigned_worker_id`, `deleted_at`, `cargo_type`, and `item_id` copied from other spots — every authenticated D.D. request 500'd until fixed. Several pre-existing jac/context queries in the same file STILL reference `assigned_worker_id`/`deleted_at` on `jobs` (latent bugs, wrapped in try/catch so they silently return defaults).

**How to apply:** Any new/edited raw `jobs` query — run it against `$DATABASE_URL` with psql (or check schema.ts) before trusting it. Guest/unauthenticated JAC paths skip these SQL queries, so smoke test with an authenticated session (`POST /api/demo-login {"type":"consumer"}` gives a cookie) to actually exercise them.
