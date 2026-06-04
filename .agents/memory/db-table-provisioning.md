---
name: New DB table provisioning
description: Where new Drizzle tables must be created so they exist in BOTH dev and production.
---

# Adding a new Postgres table to this project

A new table needs THREE things, not just the schema definition:

1. Define it in `shared/schema.ts` (table + `createInsertSchema` + select/insert types).
2. Create it in the **dev** DB via raw SQL using the `pg` package (a one-off `.mjs` run from the workspace root so `node_modules` resolves). `npm run db:push` does NOT work non-interactively — drizzle-kit prompts for new-table-vs-rename and there is no TTY, and `--force` does not bypass it.
3. Add a matching `CREATE TABLE IF NOT EXISTS ...` block to the startup migrations in `server/index.ts` (the `await pool.query(...)` blocks near the other table bootstraps).

**Why:** Production (Autoscale) has no `db:push` step on deploy — schema is materialized only by the `CREATE TABLE IF NOT EXISTS` blocks that run on server boot in `server/index.ts`. Skip step 3 and the table is missing in prod even though dev works.

**How to apply:** Any time you add a table to `shared/schema.ts`, immediately add its bootstrap block to `server/index.ts` and run the dev raw-SQL create.
