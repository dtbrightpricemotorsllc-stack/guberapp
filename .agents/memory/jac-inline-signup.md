---
name: JAC in-scene signup card
description: How the door-scene signup action works and the traps around /api/jac/onboard action handling
---

# JAC in-scene signup card

- `/api/jac/onboard` accepts `surface:"door"`; only that surface gets the `{action:"show_signup"}` entry (prompt block, deterministic trigger, and once-per-guest-session guard via `ensureGuestSession().signupOffered`). The regular homepage chat must never consume the offer.
- Action normalization lives in `server/jac-onboard-actions.ts` (tested by `server/jac-onboard-actions.test.ts`, run with `npx tsx`). **Why:** naive `.slice(0,4)` filtering silently dropped special action entries when the model returned 4 ordinary actions — reserve the slot before truncating.
- The local-KB shortcut in `/api/jac/onboard` used to intercept detail-heavy GUEST messages with irrelevant high-confidence FAQ answers (the `_looksLikeActionDetail` bypass was logged-in-only). It now applies to guests too — don't re-add the `onboardUserId` gate.
- **How to apply:** any new special (non `{label,message}`) action must go through `normalizeOnboardActions`, and any new JAC surface that shouldn't show signup must not send `surface:"door"`.
