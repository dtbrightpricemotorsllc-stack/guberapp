---
name: Atomic payment fulfillment
description: Why Stripe checkout fulfillment must flip "paid" and apply entitlements in one DB transaction
---

# Atomic payment fulfillment

Stripe checkout fulfillment (webhook + success-redirect both fire) must flip the
purchase row to `paid` AND apply every entitlement side effect inside a SINGLE
DB transaction.

**Why:** If the row is flipped to `paid` first and effects run after (separate
statements / separate `db` calls), a crash between them leaves a paid-but-unentitled
row. The next Stripe retry sees `paid`, treats it as `alreadyDone`, and skips the
effects forever — permanent silent entitlement loss. A reviewer will (correctly)
reject this as a money/state-integrity blocker.

**How to apply:**
- Use one `pool.connect()` client: `BEGIN` → `SELECT ... FOR UPDATE` on the purchase
  row (serializes concurrent webhook+redirect) → flip status + all effects → `COMMIT`.
  Any throw → `ROLLBACK` leaves status `pending`, so the retry converges cleanly.
- Because status flip and effects share the tx, observing `status='paid'` GUARANTEES
  effects landed, so the `alreadyDone` short-circuit is safe (nothing to reconcile).
- Fold dependent grants (e.g. founders enrollment under advisory lock 987654321 +
  conditional cap increment) into the SAME tx — never a separate post-payment call
  gated on a `fulfilled` boolean (that reintroduces skip-forever on partial retry).
- Effects done via raw SQL on the tx client (not the global drizzle `db`) so they are
  actually inside the transaction. `custody_events` is INSERT-only (DB rule blocks
  UPDATE/DELETE), which is fine inside the tx.
