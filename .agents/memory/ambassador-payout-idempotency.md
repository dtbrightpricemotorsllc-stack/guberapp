---
name: Ambassador bounty payout idempotency
description: How COUNT-based milestone payouts avoid double-paying under concurrency in this repo.
---

# Ambassador / milestone wallet payouts — idempotency rule

When a wallet payout is "idempotent" because it compares **milestones earned**
(derived from a COUNT of some qualifying rows) against **milestones already paid**
(a COUNT of prior `wallet_transactions` of that reward type), that read-then-write
is NOT safe on its own. Two concurrent triggers for the same beneficiary can both
read the same paid-count and both insert the same milestone → double credit.

**Rule:** wrap the recount + insert in a single `db.transaction` and take a
**transaction-scoped Postgres advisory lock keyed by the beneficiary id**
(`SELECT pg_advisory_xact_lock(<class>, <userId>)`), then recount paid milestones
*inside* the lock and insert the new reward rows **through the transaction client
(`tx`)** so they commit atomically with lock release. A waiting caller blocks until
commit, then sees the freshly committed rows and pays nothing extra. Different
beneficiaries use different lock keys and run fully in parallel.

**Why:** there is no unique constraint enforcing "one row per (user, milestone)",
so the lock + in-transaction insert is the only guard against duplicate payouts.

**How to apply:** any future COUNT-vs-COUNT wallet/ledger payout (referral,
ambassador, bonus milestones) must follow this pattern. Do the inserts via `tx`,
not the global-`db` storage helpers, or the atomicity guarantee is lost. Keep
non-financial side effects (notifications) outside the lock.

Triggers must also fire on **every** path that flips the qualifying condition. For
ID-verification-gated rewards that means both the admin verification-approval route
and the generic admin user-edit (`PATCH /api/admin/users/:id`) path that can set
`idVerified` directly.
