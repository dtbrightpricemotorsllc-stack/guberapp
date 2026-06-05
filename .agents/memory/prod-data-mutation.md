---
name: Mutating production data
description: How to change PROD data given the agent's prod DB is read-only, plus the job-deletion fan-out.
---

# Mutating production data in GUBER

**DEV and PROD are SEPARATE databases.** The Replit `executeSql` / code-execution
sandbox connects to DEV, and PROD is **read-only** to the agent — you cannot
DELETE/UPDATE prod rows directly.

**Pattern to mutate prod:** build an admin-only HTTP endpoint (guard with
`requireAdmin` + a typed/confirmation body) that the user triggers from the live
app *after deploying*. Validate the SQL first by running it inside a
`BEGIN … ROLLBACK` transaction against DEV so nothing is actually changed.

**Why:** Prod data lives in a different DB the agent can only read, so the only
safe write path is code that runs inside the deployed server process.

## Job/marketplace deletion fan-out
There are **no DB-level FK constraints** on `jobs` / `marketplace_items`
(verified via `information_schema.table_constraints`), so deleting a job leaves
orphaned child rows unless you clean them explicitly.

- Child tables keyed by `job_id` (delete these first): query
  `information_schema.columns WHERE column_name='job_id'` for the live list —
  it includes assignments, proof_submissions, reviews, finance/dispute/ledger
  tables, notifications, logs, pings, etc. `timesheets` links via
  `assignment_id` → delete before `assignments`.
- Records to PRESERVE but null their dangling pointer:
  `observations.converted_to_job_id`, `load_board_addons.linked_job_id`,
  `marketplace_items.vi_job_id`.
- Drizzle `db.transaction` runs all `tx.execute` on one connection, so
  `CREATE TEMP TABLE … ON COMMIT DROP` for the target id set persists across
  statements and auto-cleans on commit.
