---
name: Rebase brace collapse
description: Why an additive rebase can leave one branch's function missing its closing brace
---

When rebasing an additive feature onto a main that also appended code at the
same insertion point, both branches typically end their new block right before
a pre-existing shared closing `}` at (or near) end of file. Git's 3-way merge
keeps that trailing `}` as **common context after the `>>>>>>>` marker**, so
each side's conflict region ends with its last function's `return ...;` but
**without** that function's own closing brace.

If you naively keep both sides, the single shared `}` can only close one of the
two final functions — the other is left unclosed (or the two blocks nest
incorrectly). 

**How to apply:** When resolving "keep both" rebase conflicts, check brace
balance at the seam. Add an explicit `}` to close the first side's last
function before the second side's block begins, and let the shared trailing `}`
close the second side's last function. Verify with a syntax/typecheck pass that
the merged file has no markers and balances.

Also watch for **duplicate helper declarations**: if your branch added a local
helper that already exists project-wide (e.g. a second `viewerIsAdmin`), drop
the duplicate and repoint its call sites at the existing one to avoid a
redeclaration error.
