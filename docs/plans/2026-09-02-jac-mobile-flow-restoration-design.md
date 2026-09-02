# JAC Mobile Flow Restoration

## Goal

Restore the Samsung-stable JAC experience without rolling back later door,
campaign, signup, safety, or product work.

## Voice lifecycle

- Keep the August 11 signed ElevenLabs ConvAI WebSocket transport.
- ENTER is the only initial activation gesture on the web door.
- The door is the sole public voice owner.
- Only a confirmed provider connection may display listening, speaking, muted,
  or live-microphone UI.
- A parent-owned mobile connection deadline covers failures where the SDK emits
  neither success nor error.
- Startup failure cannot fall back to an idle/waiting state. It transitions to
  usable text automatically with a plain message and one Retry Voice control.
- ElevenLabs owns the audible greeting and voice replies. Local text-to-speech
  is limited to explicit text mode so JAC cannot speak twice.
- Existing echo suppression and interruption handling remain intact.

## Entrance and authentication lifecycle

- The door appears once per signed-out browser visit.
- Entering the door records that the entrance has been completed for the
  current tab session.
- Navigating to login/signup, returning from authentication, refreshing an
  authenticated session, and moving between protected routes cannot remount the
  entrance.
- Login/signup continue to route individuals to `/dashboard` and businesses to
  `/biz/dashboard`.
- Logout clears the authenticated query synchronously, resets the signed-out
  entrance marker, and navigates to `/`, beginning a new signed-out visit.

## Individual dashboard

- Preserve the existing `/dashboard` page and its design system.
- Keep all data user-scoped through authenticated endpoints.
- Add a prominent personal activity summary using existing data and routes:
  posted/accepted jobs, active work, earnings/spending access, notifications,
  profile/availability, recent or saved activity, and module shortcuts.
- Do not alter the business dashboard.

## Error handling

- Remove the indefinite “Waiting for voice connection” terminal state.
- Before the connection deadline: show “Connecting to JAC…”.
- After failure: show “Voice couldn’t connect. You can keep chatting here.”
- Keep the text composer enabled and expose one Retry Voice control.
- Log sanitized categories only: microphone, session issuance, transport, and
  provider.

## Acceptance

Validate the running mobile preview, not only isolated tests:

1. Fresh signed-out open shows the door once.
2. One ENTER tap starts the real signed-provider path.
3. JAC reaches a confirmed live state, greets once, listens, replies, and can be
   interrupted.
4. Failure reaches usable text by the mobile deadline and never remains waiting.
5. Login lands an individual on the personal dashboard.
6. Protected navigation and authenticated refresh do not show the door.
7. Logout returns to a fresh entrance.
