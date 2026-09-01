# Cinematic Team GUBER Entry Flow

**Status:** Approved design  
**Date:** 2026-09-01

## Goal

Restore the full-screen cinematic homepage entry scene without changing unrelated
GUBER functionality. Every web refresh begins with the closed futuristic TEAM
GUBER doors. Native builds keep their existing bypass behavior.

The scene must open into one continuous JAC experience: JAC initializes while the
doors open, automatically reveals and greets once when the reveal finishes, and
keeps voice, text input, transcript, and conversation state in the same homepage
session. Initial conversation never requires signup. Explore remains optional.

## Approved approach

Repair the existing `GuberDoorSplash` in place rather than creating a second
homepage experience or synchronizing two JAC implementations.

`GuberDoorSplash` is the only owner of the JAC session while the entry scene is
active. The separate post-door `JacLiveExperience` mount is removed from this
path so there is only one visible JAC, one transcript, one greeting claim, and
one voice transport owner.

The existing homepage remains behind the entry scene and becomes available only
through the existing optional `explore →` escape. `TALK TO JAC`, `TYPE INSTEAD`,
transcript updates, and text/voice switching do not navigate away.

## Scene architecture

### Closed state

- Show a full-screen closed TEAM GUBER door composition.
- Render exactly one visible `ENTER GUBER` control.
- Do not show JAC, Gubee, D.D., transcript, or duplicate homepage JAC controls.
- Use the closed-door artwork as one aligned composition split into two physical
  panels. The left and right panels must each reveal the correct half of the
  same artwork rather than rendering two complete copies side by side.
- Keep the scene above the underlying homepage with stable clipping and no
  transparent flash-through.

### Opening and reveal

- The Enter gesture unlocks audio and begins the existing unlock/open sequence.
- The two door panels slide outward as one continuous physical opening.
- The reveal uses the actual project asset `/splash/hq-reveal.png`.
- Characters settle into fixed responsive roles:
  - JAC: front-center
  - Gubee: behind/right
  - D.D.: behind/left
- Absolute scene layers, stable dimensions, and responsive clamps prevent layout
  jumps on desktop and mobile.

### Conversation surface

- JAC text/context/session initialization begins without requesting microphone
  permission.
- At reveal completion, JAC automatically adds the welcome message and greets
  exactly once for that entry mount; no second button is required.
- `TALK TO JAC` attaches the existing primary voice transport. OpenAI Realtime
  remains primary, with one bounded signed ElevenLabs fallback when appropriate.
- `TYPE INSTEAD` activates the existing text-first JAC flow.
- Both modes use the same transcript and guest session. Auth hydration preserves
  the conversation rather than replacing it with a second visible JAC.
- A voice failure never replays the greeting, loops retries, blocks text, mounts
  multiple transports, or forces signup.
- Only the optional `explore →` control exposes the broader current homepage.

## Access and continuity rules

- No microphone prompt occurs on cold load.
- Voice may attach after the Enter gesture only under the existing capability and
  permission rules.
- Initial JAC conversation remains available to unauthenticated guests.
- Existing campaign/referral attribution, guest session continuity, onboarding
  behavior, authentication, dashboard routes, payments, and native billing
  boundaries remain unchanged.
- The personal dashboard concept remains compatible with this design: future JAC
  actions can use collected context to guide a user to a focused dashboard, while
  this fix retains the current-page Explore escape and adds no new dashboard
  routing.

## Accessibility and responsive behavior

- Decorative artwork is hidden from assistive technology.
- Enter, Talk, Type, text input, send, voice state, transcript, and Explore have
  accessible labels and keyboard access.
- Reduced-motion users receive the same state progression with shortened
  nonessential animations.
- The portrait door artwork remains visually coherent on mobile; desktop uses
  the full-screen scene without duplication or accidental cropping that hides
  the entry control.

## Verification

Focused browser coverage will verify:

1. A fresh web refresh starts closed with exactly one Enter control.
2. Enter causes a physical split-door opening with no duplicate door artwork.
3. The correct HQ reveal asset is used.
4. JAC, Gubee, and D.D. occupy the expected front/back positions.
5. JAC reveals and greets automatically exactly once.
6. Talk and Type remain in-scene and share one transcript/session.
7. No second JAC or TEAM GUBER layer is mounted.
8. No navigation or forced signup occurs before initial conversation.
9. Explore remains optional and is the only broader-page escape.
10. Desktop and mobile layouts have no visible flash or layout jump.

After implementation, restart the application workflow, inspect browser and
server logs, run the focused door/JAC acceptance coverage plus the existing
state-bleed, Android permission, promo, and relevant auth/onboarding checks, and
inspect both desktop and mobile Replit previews. The project must not be
published as part of this work.