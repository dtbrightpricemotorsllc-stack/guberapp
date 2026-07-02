---
name: Wallet transaction status enum consistency
description: wallet_transactions.status must exactly match the values wallet.tsx filters on, or balances silently show $0
---

`wallet.tsx` computes Available/Pending balances by filtering `wallet_transactions` on exact `status` string values ("available" / "pending"), separately from the unfiltered Total Earned sum. If any code path (including seed/demo data) writes a different status string (e.g. "completed"), the transaction still counts toward the total but silently drops out of Available/Pending — no error, just $0.00 next to a nonzero total.

**Why:** This happened with 100% of `wallet_transactions` rows (all demo-seeded) using "completed" instead of "available", making the wallet look completely broken for anyone testing on the demo account, even though the totals math was correct.

**How to apply:** When adding any new wallet-transaction write path (seed scripts, payout code, admin tools), check the exact status strings `wallet.tsx` filters on before assuming a new status enum value is safe to introduce. Also: don't assume a user-reported "X doesn't work" bug is a demo-mode/reviewer artifact — verify against real data first (e.g. `SELECT status, count(*) GROUP BY ...`) before dismissing it.
