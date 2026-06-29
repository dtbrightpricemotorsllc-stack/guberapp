---
name: JAC Deep Profile system
description: How JAC auto-syncs user profile data from the DB and surfaces proactive intelligence (briefing + opportunities).
---

# JAC Deep Profile System

## The rule
`syncJacProfile(userId)` is a fire-and-forget call that reads from `users`, `job_applications`, `jobs`, `marketplace_listings`, and `wallet_transactions` and upserts structured entries into `jac_memory` under categories: `profile`, `vehicle`, `work`, `certifications`.

**Why:** JAC should know the user's data without them re-explaining it. The sync runs on every `/api/jac/context` call so profile data stays fresh, but never blocks the response.

## How to apply
- `buildJacProfileContext(userId)` — reads back from `jac_memory` for prompt enrichment in `/api/jac/onboard`
- `buildMorningBriefing(userId)` — reads `jac_memory` (work.earnings_7d, etc.) + live job/action counts; returns a briefing string + action chips; **does NOT gate on calendar day server-side** (frontend gates via sessionStorage key `jac_briefing_shown_v1`)
- `scanOpportunities(userId)` — reads profile zip + categories from `jac_memory`, queries open jobs, load board, pending proof; returns `JacOpportunity[]` (up to 8)
- `GET /api/jac/briefing` and `GET /api/jac/opportunities` — both `requireAuth`
- Frontend injects briefing as JAC's first turn only on first open per session (sessionStorage gate)
- Live Opportunities panel (purple-bordered) filters to `type !== 'pending_action'` job/load_board items

## Key files
- `server/jac-profile.ts` — all server-side functions
- `client/src/lib/use-jac-context.ts` — `useJacBriefing()`, `useJacOpportunities()` hooks
- `client/src/components/guber-assistant.tsx` — briefing injection + opportunities panel
- `client/src/lib/jac-memory.ts` — `extractAndSaveMemory()` with 12+ regex patterns
