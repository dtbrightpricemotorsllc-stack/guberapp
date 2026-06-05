---
name: Multi-factor payout guard
description: Anti-fraud invariant for Stripe capture/transfer — GPS proximity must never alone release a payout.
---

# Multi-factor payout guard

`evaluatePayoutMultiFactor({job, proofs, helperConfirmed, customerConfirmed})` in `server/payout-guard.ts` enforces that a Stripe `paymentIntents.capture`/transfer only proceeds when ALL THREE factors hold:
1. **GPS proximity verified** — job has `arrivedAt | workerArrivedAt | geofenceVerifiedAt`, OR the job has no real coords (null/undefined or `(0,0)` → online/legacy, exempt).
2. **Provider submitted completion** — `helperConfirmed`.
3. **Confirmation factor** — `customerConfirmed` OR a non-`notEncountered` photo/video proof artifact.

**Why:** GPS/geofence is verification + telemetry ONLY; it must never auto-trigger money movement. The location-batch route (`/api/jobs/:id/location-batch`) computes 250m haversine, stamps `geofenceVerifiedAt` once, writes a `geofence_proximity_verified` audit log, and returns telemetry — no payout side effects.

**How to apply:** Any NEW code path that calls `stripe.paymentIntents.capture` must run the guard first (manual confirm path + cron auto-confirm path already do). In cron, evaluate the guard BEFORE setting `status: completed_paid` and clear `autoConfirmAt` when held, or a held payout leaves the job finalized-but-on-hold and re-loops every cron tick.

**Deliberate exception:** admin dispute-resolution captures (`/api/admin/jobs/:id/resolve-dispute`, `worker_favor` + `partial`) intentionally bypass the guard because a human admin adjudication IS the authorizing factor — but they log a `payout_guard_admin_override` audit entry. Don't "fix" this by blocking them; that breaks dispute resolution.

Legit dual-confirm flows already satisfy all 3 factors (helper must arrive → `arrivedAt` set → before `helperConfirmed`), so the guard is defense-in-depth with no regression to normal payouts.
