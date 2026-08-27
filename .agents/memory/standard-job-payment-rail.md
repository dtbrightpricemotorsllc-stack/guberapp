---
name: Standard job payment rail
description: The financial invariant for public paid jobs and their Stripe settlement.
---

# Standard job payment rail

**Rule:** Standard public jobs settle as Stripe destination charges. Capture is
the one worker-payment rail; no normal confirmation, cron retry, wallet retry,
or admin payout sweep may add a standalone Connect transfer for that job.

**Why:** A destination charge already routes the worker share when Stripe
captures the authorization. A second transfer pays the worker twice even if
the job's status looks correct.

**How to apply:** Keep amount calculation snapshot-based and cents-based at
Checkout. Route browser confirmation and review-timer settlement through the
same durable claim before calling Stripe, then atomically record captured job
state, ledger effects, and the worker wallet earning. Failed captures must
remain retryable; pre-existing held public-job authorizations without a rail
snapshot should be treated as destination charges unless they explicitly name
another rail. Human dispute overrides remain separate, audited exceptions.