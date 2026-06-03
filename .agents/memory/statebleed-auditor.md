---
name: State-bleed in mode-selector forms + Contextual Logic Auditor
description: Convention for multi-mode forms (changing the mode must reset its scoped fields) and the static auditor that guards it.
---

# Mode-selector forms must reset scoped state on change

A "mode selector" is a state field compared to several string literals to render
different branches of one form (e.g. `freightTrailerType === "car_hauler"` in the
Post-a-Load flow). Each branch has its own inputs.

**Rule:** When the selector changes, reset *every* field that only belongs to the
old branch, and any async callback (e.g. VIN decode) must discard results that
resolve after the mode changed (guard with a live ref to the current mode/input).
Otherwise stale values from one mode leak into another mode's UI **and** into the
submitted payload (handlers that always include every field will ship them).

**Why:** This is a real bug class — a reefer temperature or freight commodity
could ride along on a car-hauler post. Re-selecting the *same* mode must be a
no-op so the user doesn't lose what they typed.

**How to apply:** Adding a new branch or field to such a form means adding its
setter to the mode-change reset handler. Don't reset cross-mode/accumulating
state (route, add-ons, pricing, generic notes, wizard steps, tabs).

# Contextual Logic Auditor

`scripts/audit-statebleed.mjs` (TypeScript AST) flags selectors whose
mode-scoped setters aren't fully reset on change. It only treats **string-literal**
JSX-gated comparisons as selectors, so **numeric wizard indices (`step === 1`) are
ignored** — numeric/linear wizards are meant to preserve data. It evaluates the
*worst* reset path and requires a complete reset (threshold 1.0).

- Run: `node scripts/audit-statebleed.mjs` (also a registered `statebleed`
  validation command). Regression test: `server/tests/audit-statebleed.test.ts`
  with a deliberately-broken fixture under `server/tests/fixtures/`.
- **Escape hatch:** a `statebleed-allow: <reason>` comment on/above the selector's
  `useState` line. Used for intentional accumulation patterns — e.g. tabs that
  edit different sections of one record, or string-keyed linear wizards.
- Known limitation: it counts setter *presence*, not whether the value truly
  clears the field; treat it as a smoke alarm, not a proof.
