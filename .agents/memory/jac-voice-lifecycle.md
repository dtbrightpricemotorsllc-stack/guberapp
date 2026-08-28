---
name: JAC voice session lifecycle
description: Root causes of greeting replay + mic restart bugs, and how they were fixed
---

## Root causes of "greeting replays on mic tap" (fixed Aug 2026)

### 1. ElevenLabs firstMessage override — the #1 cause
`jac-convai-session.tsx` was setting `overrides.agent.firstMessage = "Hey, I'm Jack…"` on EVERY `startSession()` call.
Every mic tap → new session → ElevenLabs speaks that greeting.
**Fix**: always set `firstMessage: ""`. Greeting is text-only, shown instantly in React state.

### 2. Auto-start on any gesture triggered voice on text input click
The `startOnGesture` effect registered click/touchstart/keydown at document level.
Clicking the text box → voice session attempted → often timed out → `handleConvaiError` was
then calling `jacSpeak(GREETING_TTS)` → user heard greeting for seemingly no reason.
**Fix**: Removed the document-level auto-start-on-gesture effect entirely. It remains
important that text input and ordinary page gestures never trigger voice.

### 2a. Public and signed-in JAC are text-first
Web and installed-PWA JAC must initialize text, conversation state, routing,
memory, and actions without minting or starting an ElevenLabs session. Voice
starts only from the explicit voice control so audio unlock and microphone access
remain inside the user's gesture. Native may auto-start only when the platform
supports it and microphone permission was already granted.

**Why:** External voice initialization and mobile browser gesture rules made the
homepage appear stuck or drop immediately from Listening to Ended. Voice failure
must not delay or disable the core JAC experience.

**How to apply:** Keep document-level gesture listeners removed. Treat voice as a
single-flight optional attachment. A failed initial start must return to the
single Start voice control without automatic retries. Only a session that
previously connected may use the bounded recovery budget, and successful
reconnects must not reset that budget. Preserve the shared transcript, campaign
context, and greeting claim across voice disconnects; never substitute browser
speech or static audio for the approved JAC voice.

### 3. handleConvaiError replayed the greeting via TTS
Any voice failure called `jacSpeak(GREETING_TTS)` — the greeting text spoken aloud.
Combined with #2, this meant: click text box → voice attempt → fails → TTS speaks greeting.
**Fix**: Removed `jacSpeak()` from error handler. Shows a short inline chat message instead.

### 4. Mic button was stop/start, not mute/unmute
When `liveMode=true`, tapping mic called `stopLiveMode()` → session torn down → next tap
starts NEW session → ElevenLabs would have played firstMessage (fixed by #1, but latency remains).
**Fix**: When session is connected (`convaiSessionRef.current?.connected`), mic tap calls
`convaiSessionRef.current.toggleMute()` to mute/unmute the existing session without a cold reconnect.

### 5. Pre-existing brace collapse in jac-convai-session.tsx
Task #742 merge collapsed the `window.addEventListener("error", _jacElevenLabsGuard, true)` call
and the `if (navigator.mediaDevices) {` wrapper — causing an "Unexpected }" build error at line 146.
Build was already broken before our changes. Fixed by restoring both missing lines.

## What these changes did NOT touch
- Production ElevenLabs agent ID
- guber_action webhook tool
- D.D., Gubee, Stripe, any non-JAC features
- ElevenLabs dashboard "First Message" field (must be cleared manually in the dashboard)

## ElevenLabs dashboard note
The ElevenLabs agent dashboard has its OWN "First Message" field that is SEPARATE from
the `overrides.agent.firstMessage` in code. Even with the code override set to `""`, if
the dashboard field is non-empty, ElevenLabs may send it. The code override takes precedence
when the SDK sends it as an override — but confirm by testing and clearing the dashboard field
if greeting still plays on first connect.

## JacConvaiSessionHandle — added fields (Aug 2026)
`connected: boolean` and `isMuted: boolean` added to the imperative handle so the parent
can make connect-vs-mute decisions without relying on its own liveMode state alone.

## Mic diagnosis wait time
Reduced from 600ms to 150ms — faster mic validation before ElevenLabs session starts.

## Authentication hydration changes voice identity
The public homepage initially renders before the authenticated user finishes hydrating. If its ConvAI endpoint changes from the anonymous endpoint to the authenticated one, key the voice wrapper by endpoint (or explicitly end and recreate it).

**Why:** A one-time boot guard otherwise leaves signed-in visitors in the anonymous voice session, without account context.

**How to apply:** Preserve transcript continuity separately from the voice connection so the endpoint change can safely remount only the session layer.

## Public/auth voice identity

Ordinary anonymous homepage sessions use the canonical app-mode JAC identity, not
the investor identity; signing in replaces that anonymous connection with the
authenticated app-mode connection while retaining the same configured ConvAI agent.

**Why:** Sending ordinary visitors through investor mode makes the assistant sound
and behave differently immediately after sign-in, even though they are continuing
the same JAC journey.

**How to apply:** Keep investor mode exclusive to actual investor experiences.
The anonymous homepage and authenticated application should both identify as
canonical app-mode JAC; only the authenticated connection adds account context.
