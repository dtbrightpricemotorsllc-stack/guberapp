---
name: JAC guest + persuasion system
description: In-memory guest session store, guest draft accumulation, post-signup transfer, 14-principle persuasion layer, and business onboarding mode added to all JAC prompts.
---

## Guest Session Store

- **Location**: `server/routes.ts`, declared after `_pendingDraftCards` Map
- **Type**: `Map<string, _GuestSession>` — **in-memory only**, cleared on server restart (ephemeral by design)
- **TTL**: 24 hours; cleaned by hourly `setInterval`
- **Key helper**: `ensureGuestSession(id)` — creates or refreshes a session, returns it
- **Draft entry shape**: `{ type: string, data: Record<string,any>, savedAt: number }`

## Endpoints Added

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/jac/guest-session` | None | Create or re-validate a guest session; returns `guest_session_id` |
| `POST /api/jac/guest-draft` | None | Save/replace a draft by type in guest session |
| `POST /api/jac/guest-transfer` | `requireAuth` | Merge all guest drafts into the authenticated account; deletes session |

## Guest Draft Types & Transfer Behavior

| type | What gets created on transfer |
|---|---|
| `job` | Creates a real job draft via `storage.createJob` + queues `_pendingDraftCards` |
| `worker_profile` | Updates `users.capabilitiesDescription` |
| `business_onboarding` | Builds a cap-description string from name/type/provides/needs and saves it |

## Onboard Endpoint Changes

- `POST /api/jac/onboard` now accepts `guest_session_id` in the request body
- LLM can return `guestDraft: { type, cta, data }` in JSON (only for unauthenticated users)
- Server **auto-saves** the draft to the guest session immediately after parsing
- The full `guestDraft` object is forwarded to the client in the response

## Action Gateway Extensions (`/api/jac/action`)

- `business_onboarding_draft`: stores a business_onboarding entry in guest session (requires `guest_session_id` in `data`)
- `worker_profile_draft`: stores a worker_profile entry in guest session

## Client Changes

- **`client/src/hooks/use-guest-jac-session.ts`**: new hook — `getGuestSessionId()` (localStorage UUID under key `jac_guest_session_id`), `clearGuestSessionId()`, `useGuestJacSession()` (returns `{ guestSessionId, transferGuestSession, saveGuestDraft }`)
- **`client/src/lib/auth-context.tsx`**: calls `transferJacGuestSession()` (fire-and-forget) in both `loginMutation.onSuccess` and `signupMutation.onSuccess`
- **`client/src/components/jac-homepage.tsx`**:
  - `JacMsg` interface gains `guestDraft?: JacGuestDraft`
  - `processInput` passes `guest_session_id` to `/api/jac/onboard` body
  - Response handling calls `saveGuestDraft()` client-side if `guestDraft` is present
  - Chat panel renders a green "DRAFT READY" card above the regular CTA when `guestDraft` is present, with a signup link carrying `?intent=<type>&gsid=<id>`

## Prompt Additions

### All anonymous JAC surfaces (onboard + voice)
- **Guest mode section**: when enough info is collected, return `guestDraft` rather than routing to `/signup` empty-handed
- **Business onboarding mode**: triggered by "I own a business" signals; gathers name → type → provides → needs one question at a time
- **14-principle persuasion layer** (embedded, invisible to user):
  1. Reciprocity — give value first
  2. Commitment & consistency — small "yes" moments
  3. Social proof — real activity references
  4. Authority — domain expertise before pitching
  5. Liking — match energy
  6. Scarcity — only when genuinely true
  7. Unity — "Team GUBER" in-group framing
  8. Loss aversion — frame inaction as cost near decision
  9. Curiosity gap — one useful detail just out of reach
  10. Effort justification — acknowledge how much they've shared
  11. Momentum — micro-agreements keep moving forward
  12. Concreteness — specific numbers, not vague promises
  13. Identity alignment — mirror their stated role back
  14. Soft landing — lower friction immediately before CTA

**Why**: Anonymous visitors who feel helped before being asked to sign up convert at significantly higher rates than those who hit a signup wall immediately. The guest draft system bridges that gap — visitors can get real value built up before committing an email address.

**How to apply**: Keep the persuasion principles listed in the system prompt but not the numbered labels — they're style guides, not scripts. Never name them aloud. Scarcity and loss aversion go last (near decision), never first.
