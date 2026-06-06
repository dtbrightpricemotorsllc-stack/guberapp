---
name: Witness payout authorization
description: Eligibility + single-report invariants on the Asset Custody witness verification payout path
---

# Witness verification payout authorization

The Asset Custody Engine pays witnesses 80/20 via Stripe Connect when they file a
verification report. Two invariants must hold on this funds-moving path:

## 1. Witness work requires a verified identity
Accepting a witness assignment AND filing a witness report both gate on
`user.idVerified` (demo users exempt via `isDemoUser`). Without this, any
authenticated user could claim an open assignment and trigger a transfer.

**Why:** the whole platform requires `idVerified` before any paid work
(load-board carriers, V&I workers all do this); witnessing is paid work and was
the one custody path that originally skipped the gate. Broken access control
directly tied to money movement.

**How to apply:** any new witness/payout route must call the same
`requireWitnessEligible`-style check before touching the assignment.

## 2. One report (and one payout) per assignment — enforced atomically
`fileWitnessReport` does the status transition FIRST:
`UPDATE ... SET status='completed' WHERE id=? AND status='accepted' RETURNING *`.
If no row comes back, it throws — the report insert and Stripe transfer never run.

**Why:** doing the insert/payout before the status flip let a witness file two
reports / two transfer attempts. Stripe idempotency key `witness-payout-${id}`
is a second line of defense, but the atomic accepted→completed transition is the
real guard. Don't reorder it.

## High-value (>= $50k) tow/trailer changes
`highValueChangeGuard` requires an owner/sender-side actor (or `emergency=true`,
which is audited in the append-only custody trail) for high-value changes. The
tow-vehicle/trailer routes therefore allow roles
`carrier|driver|owner|sender|authorized_contact` — NOT carrier-only — otherwise a
non-emergency high-value change is impossible (carrier can't satisfy the guard and
owner/sender can't pass a carrier-only route gate).
