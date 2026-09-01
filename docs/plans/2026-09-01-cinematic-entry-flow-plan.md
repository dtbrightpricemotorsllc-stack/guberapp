# Cinematic Team GUBER Entry Flow — Implementation Plan

**Design:** `docs/plans/2026-09-01-cinematic-entry-flow-design.md`

## 1. Normalize homepage entry ownership

**Files:** `client/src/pages/home.tsx`,
`client/src/components/guber-door-splash.tsx`

- Keep the native bypass.
- Change web initialization so each refresh starts the door scene; do not use
  `guberDoorSplashSeen` to bypass the web entry.
- Keep the existing `doortest=1` behavior as a harmless explicit test override.
- Ensure the canonical `JacLiveExperience` is not mounted at the same time as the
  door scene.
- Keep the canonical surface available only after the explicit Explore escape,
  preserving the broader current-page experience without creating an in-scene
  duplicate.
- Preserve the existing campaign, guest-session, and auth handoff behavior.

## 2. Correct the closed-door composition and reveal asset

**File:** `client/src/components/guber-door-splash.tsx`

- Point the HQ layer at `/splash/hq-reveal.png`.
- Rework the two door-panel image layers so both use the same full-scene
  coordinate system and clip the correct left/right half of one source
  composition.
- Keep the panel transforms and seam animation as one opening sequence.
- Prevent the closed-state HQ/characters and the underlying homepage from
  showing through before the doors open.
- Keep exactly one accessible Enter control over the printed asset control.
- Preserve the selected responsive character roles and remove any positioning
  changes that cause jumps when conversation controls appear.

## 3. Make automatic greeting and in-scene controls deterministic

**File:** `client/src/components/guber-door-splash.tsx`

- Start lightweight JAC context/session setup as the scene mounts and unlock
  audio only from the Enter gesture.
- Trigger the welcome message and approved greeting at the reveal completion
  boundary, exactly once per entry mount.
- Keep ElevenLabs `firstMessage` behavior and current no-replay error handling
  intact; do not introduce a second TTS path.
- Leave `TALK TO JAC` and `TYPE INSTEAD` in the mounted scene. They should only
  select the existing voice/text mode and focus or connect the matching control.
- Keep text and voice callbacks flowing through the same messages, guest session,
  campaign session, action handling, and signup-card logic.
- Make Explore the only scene exit. Stop active voice cleanly at that boundary
  and preserve any existing current-page handoff behavior.

## 4. Preserve continuity across the optional Explore escape

**Files:** `client/src/components/guber-door-splash.tsx`,
`client/src/components/jac/jac-live-experience.tsx` (only if required by the
existing handoff contract), relevant homepage tests

- Reuse the existing shared homepage transcript/session handoff if the canonical
  surface is shown after Explore.
- Avoid adding a second active voice transport during the handoff.
- Do not alter dashboard routing, signup gating, campaign claiming, payments,
  native billing, or account behavior.
- Verify that initial conversation remains available without authentication and
  that signup is offered only by the existing JAC action rules.

## 5. Update focused browser coverage

**File:** `e2e/door-entry-regressions.spec.ts`, plus a focused new spec or
fixtures if the current file becomes too broad

- Replace first-visit/localStorage assumptions with the approved every-refresh
  web behavior.
- Assert one Enter control and no canonical JAC surface while the doors are
  closed.
- Assert the correct reveal asset and stable character layer presence after
  opening.
- Assert the automatic greeting appears once without a second user action.
- Assert Talk and Type do not change the URL, and text messages reach the same
  in-scene transcript.
- Assert the door scene owns one JAC surface/voice boundary and no duplicate
  TEAM GUBER layer is visible.
- Assert Explore remains optional and preserves the existing canonical-page
  destination.
- Keep campaign, signup continuity, auth return, and existing JAC live tests
  passing; update only their entry helper assumptions where needed.

## 6. Verify in the Replit workflow

- Run focused door/JAC browser coverage.
- Run the state-bleed audit and Android permission guard.
- Run the promo render and round-trip checks that are part of the configured
  release baseline.
- Restart `Start application` after code changes and inspect workflow/browser
  logs for route, asset, React, and voice errors.
- Capture desktop and mobile Replit preview screenshots and inspect for:
  duplicate doors, ghost JAC layers, wrong character order, flashes,
  overflow, and layout jumps.
- Do not publish.