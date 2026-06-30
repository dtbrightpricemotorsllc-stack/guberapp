---
name: JAC Deep Profile system
description: How JAC auto-syncs user profile data from DB and surfaces proactive intelligence (briefing + opportunities).
---

# JAC Deep Profile System

## The rule
`syncJacProfile(userId)` reads from 9 sources in parallel (users, wallet_transactions, jobs, load_board_listings, tow_vehicle_verifications, trailer_verifications, marketplace_listings, wallet balance, active jobs count) and upserts structured entries into `jac_memory` under categories: `profile`, `vehicle`, `work`, `certifications`.

**Why:** JAC should know the user without them re-explaining. Sync runs fire-and-forget on every `/api/jac/context` call.

## Briefing daily gate
`buildMorningBriefing` is gated server-side: checks `jac_memory(system, last_briefing_date)` vs UTC today. Returns `null` if already shown. Upserts the date before returning a valid briefing.

**Why:** sessionStorage-only gating fails across devices and violates the spec's per-user contract.

## Frontend behavior
- `useJacOpportunities` has `refetchInterval: 300_000` (5 min) when the assistant is open
- Briefing injection **replaces** the greeting message (not appends) via `setMessages([briefing])`
- One unified panel driven by `jacOpportunities`: pending_action items → "Needs Your Attention"; job/load_board items → "Live Opportunities". Old `jacContext.alerts` panel removed.

## Opportunities cap and scope
`scanOpportunities` returns max 5 items: pending actions (disputes, offers, proof, on_the_way >4h, wallet ≥$50) first, then V&I jobs by `job_type='vi'`, then category-matched jobs with adjacent ZIP (`LEFT(zip,3) = LEFT(userZip,3)`), then load board by trailer type.

## Key files
- `server/jac-profile.ts` — all server-side functions
- `client/src/lib/use-jac-context.ts` — hooks
- `client/src/components/guber-assistant.tsx` — briefing injection + unified panel
- `client/src/lib/jac-memory.ts` — `extractAndSaveMemory()` with 12+ regex patterns
