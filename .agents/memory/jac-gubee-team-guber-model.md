---
name: JAC / Gubee / Team GUBER interaction model
description: The 4-part brand architecture + activation system implemented across the codebase.
---

## The Model

- **JAC** = conversation + coordination. Gathers info, builds proposals, hands off to human action gates.
- **Gubee** = visual mascot (loading-badger.png / loading-badger-aiming-up.png). Represents progress. Never physically acts. "Gubee made a drop" = Gubee represents the action, a real Team GUBER member did it.
- **Team GUBER** = real people (workers, businesses, verified members) executing real-world tasks.
- **User** = always keeps control at consequential gates: ACCEPT MISSION, APPROVE & POST, CONFIRM PICKUP, etc.

## Human-Control Boundary (CRITICAL)

JAC **may** handle autonomously: onboarding, question-gathering, form prep, matching, pricing suggestions, notifications, status updates.

JAC **must hand back** before: accepting jobs, spending money, physical actions, legal commitments, confirming pickup/completion, dispute resolution, any consequential decision.

## What Was Built

- `client/src/components/gubee-action-panel.tsx` — reusable human-action gate panel using badger assets
- `client/src/pages/cash-drop-mission.tsx` — worker-facing cash drop placement mission page
- `/cash-drop-mission/:id` route added to App.tsx
- `POST /api/cash-drop-mission/:id/accept` — sets cashDrop.status = "pending_placement"
- `POST /api/cash-drop-mission/:id/complete` — sets status = "pending_verification", records GPS + photo proof
- "Promote My Business" chip added to guber-assistant.tsx INITIAL_CHIPS
- "Promote My Business" quick action added to jac-dashboard-card.tsx QUICK_ACTIONS
- "ASK JAC TO PROMOTE MY BUSINESS" CTA added to home.tsx business section → links to /biz/sponsor-drop
- "Team Goober" typos fixed in server/routes.ts (2 occurrences in CACHE_CLIPS)
- JAC onboard prompt updated with GUBER Activations knowledge + Gubee model + transparent sponsorship rule
- In-app JAC coordinator prompt updated with GUBER ACTIVATIONS / PROMOTE MY BUSINESS intent routing

## GUBER Activations

Businesses fund community events (Cash Drops, QR hunts, store visits, grand-opening promos, giveaways, challenges, verification missions). JAC builds proposal conversationally. **Business must approve final campaign + financial commitment.** Sponsor funding ALWAYS attributed: "Presented by [BUSINESS]" / "Sponsored by [BUSINESS]" / "In partnership with [BUSINESS]".

## Cash Drop Placement Mission Flow

Worker (hostUserId on cashDrop) accepts mission → PICKUP → TRAVEL → DROP → VERIFY DROP (photo + GPS) → admin reviews → public activation releases. Status: draft → pending_placement → pending_verification → active (admin-released).

**Why:** The existing cashDrops table already had hostUserId + status + gpsLat/gpsLng. No new schema needed. Worker's photo stored in hostLogo field temporarily pending a dedicated proof_photo column.

## Known Gap

Worker photo proof stored in cashDrop.hostLogo (reused field). A dedicated `placementProofPhotoUrl` column on cashDrops would be cleaner — add in a future migration.

## D.D. Business Launch ($9.99 one-time)

D.D. is Team GUBER's Business Development specialist — strictly business-startup focused. NOT a general assistant. Separated from the existing "D.D." = Destination Determination (money-goal planner) which already existed. Naming collision: new feature uses `dd_launch_unlocked` / `dd_launch` type in Stripe metadata to stay distinct.

**What was built:**
- `shared/schema.ts`: `ddLaunchUnlocked`, `ddUnlockedAt`, `ddStripeSessionId` columns on users table
- `server/index.ts`: startup migration for the 3 new columns (`IF NOT EXISTS`)
- `server/routes.ts`: `GET /api/dd/status`, `POST /api/dd/checkout`, `POST /api/dd/chat` + Stripe webhook handler for `metadata.type === "dd_launch"`
- `client/src/pages/dd-launch.tsx`: paywall → Guided Chat page (step counter, cost cards, clickable links, Back to JAC)
- `client/src/App.tsx`: `/dd` route (ProtectedRoute)
- JAC onboard + in-app prompts updated: D.D. introduction script, intent triggers (LLC, EIN, business formation, etc.), route: /dd
- `DD_MODEL` env var controls the OpenAI model (default: gpt-4o-mini). Never hardcoded.

**Security fix (same session):** `jacToolAuth` was fail-open when `GUBER_SHARED_SECRET` unset. Now fails-closed in `NODE_ENV=production`; dev passthrough preserved.

**Stripe:** `metadata.type = "dd_launch"` in checkout session → webhook sets `ddLaunchUnlocked=true`. Double-charge protected: `already_unlocked` early-return on `/api/dd/checkout` + idempotent webhook check.

**Why Guided Chat:** Business setup involves official links, deadlines, and costs users need to look back at — not suitable for voice-first.
