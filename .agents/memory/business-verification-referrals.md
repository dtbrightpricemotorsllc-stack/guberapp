---
name: Business verification and referral rail
description: Durable rules for official business verification and distributor rewards.
---

Official business access must remain requirement-based: business type determines registration/EIN, licensing, insurance, bonding, and credential requirements; evidence is submitted and an authorized administrator approves or rejects it with an audit reason. A submitted document is not automatically an approval.

**Why:** The business handout promises official verification and regulator-aware guidance, so EIN-only approval would create a misleading trust signal.

**How to apply:** Keep requirement status/evidence separate from account status, show official source links and D.D. explanations, and only issue a referral reward after all required items are approved or explicitly overridden.

Distributor rewards are separate cash obligations rather than GUBER credits. Qualification must be idempotent per attributed business, self-referrals must be rejected, and code assignment, signup snapshotting, and late qualification must share one code-scoped lock.

**Why:** The approved offer is one $5 cash reward per verified business signup; reusing the credit ledger would misstate the obligation, while unsynchronized owner changes could pay the wrong distributor.

**How to apply:** Preserve a non-null signup-time owner snapshot; only fill an originally unassigned snapshot after locking the code. Keep cash-out distinct from credits, re-check ID plus active Connect at request and settlement, and use an idempotent transfer reference before marking paid.