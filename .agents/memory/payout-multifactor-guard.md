---
name: Multi-factor payout guard
description: Anti-fraud invariant for Stripe capture/transfer — GPS proximity must never alone release a payout.
---

# Multi-factor payout guard

**Invariant:** a Stripe `paymentIntents.capture`/transfer may only proceed when ALL THREE factors hold:
1. **GPS proximity verified** — an arrival/geofence timestamp exists, OR the job has no real coords (`(0,0)` or null = online/legacy, exempt).
2. **Provider submitted completion** (`helperConfirmed`).
3. **Confirmation factor** — customer confirmed OR a real (non-"not encountered") photo/video proof artifact.

**Why:** GPS/geofence is verification + telemetry ONLY; it must never auto-trigger money movement. Legit dual-confirm flows already satisfy all three (helper must arrive → arrival stamped → before confirming), so the guard is defense-in-depth with no regression to normal payouts.

**How to apply:**
- Any NEW code path that captures/transfers must run the guard first.
- In the cron auto-confirm path, evaluate the guard BEFORE marking the job finalized (`completed_paid`) and clear the auto-confirm timer when held — otherwise a held payout leaves the job finalized-but-on-hold and re-fires every cron tick.
- **Deliberate exception:** admin dispute-resolution captures bypass the guard because a human admin adjudication IS the authorizing factor — but they must write an explicit override audit entry. Do NOT "fix" this by blocking them; that breaks dispute resolution.
