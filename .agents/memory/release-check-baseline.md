---
name: Release check baseline
description: Policy for keeping App Store release validation actionable while legacy TypeScript debt remains.
---

The release TypeScript check may quarantine only explicitly documented, pre-existing diagnostic fingerprints; all other diagnostics must fail validation.

**Why:** A permanently red compiler check hides new submission regressions, while a blanket suppression removes the signal entirely.

**How to apply:** When a legacy diagnostic is cleaned up, remove its fingerprint from the baseline. Never add a fingerprint just to make a new error pass; fix the error or obtain an explicit decision to classify it as legacy debt.