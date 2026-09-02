---
name: JAC voice session lifecycle
description: Root causes of greeting replay + mic restart bugs, and how they were fixed
---

## Root causes of "greeting replays on mic tap" (fixed Aug 2026)

### 1. ElevenLabs firstMessage override — the #1 cause
An explicit first-message override is replayed on every new session. Do not send
`firstMessage: ""` either: ElevenLabs treats the empty override as a disconnect.
Let the configured agent greeting own audible welcome and deduplicate only the
displayed transcript.

### 2. Auto-start on any gesture triggered voice on text input click
The `startOnGesture` effect registered click/touchstart/keydown at document level.
Clicking the text box → voice session attempted → often timed out → `handleConvaiError` was
then calling `jacSpeak(GREETING_TTS)` → user heard greeting for seemingly no reason.
**Fix**: Removed the document-level auto-start-on-gesture effect entirely. It remains
important that text input and ordinary page gestures never trigger voice.

### 2a. Public and signed-in JAC load text first; voice may attach automatically
Web, installed-PWA, and native JAC must initialize text, conversation state,
routing, memory, and actions immediately. Voice may attach automatically on any
platform only when existing microphone permission and an audio input can be
confirmed without prompting. Otherwise the explicit Start voice control remains.

**Why:** This preserves the approved hands-free returning-user experience without
surprising first-time visitors with a permission prompt. External voice startup
and mobile gesture rules must never make the homepage appear stuck or disable JAC.

**How to apply:** Query readiness without requesting permission; never call
getUserMedia automatically unless readiness was already confirmed. Keep
document-level gesture listeners removed. Treat voice as a single-flight optional
attachment. A failed initial start must return to the single Start voice control
without automatic retries. Only a session that previously connected may use the
bounded recovery budget, and successful reconnects must not reset that budget.
Preserve the shared transcript, campaign context, and greeting claim across voice
disconnects; never substitute browser speech or static audio for the approved
JAC voice.

The web entry door is the deliberate exception: ENTER is already an explicit
voice activation gesture, so it must request microphone permission and start the
signed ConvAI session immediately. It must not reveal a second Start Voice
control. Any startup failure stops the lifecycle and exposes one explicit Retry
control plus text fallback; provider callbacks must never schedule reconnects.
Connection state must remain truthful throughout.

### One public voice owner across the auth boundary
The web door owns the only public ConvAI connection and remains mounted after
optional Explore. The canonical post-Explore and dashboard surfaces are text-only
and resume the shared transcript. A full-page OAuth navigation necessarily ends
the socket, so continuity across authentication comes from an awaited guest
session transfer and persisted transcript—not a second automatic voice owner.

**Why:** Independent door, homepage, and dashboard controllers created duplicate
greetings, overlapping microphone leases, and Connecting/Reconnecting loops.

**How to apply:** Never mount a second public/dashboard voice transport beside
the door. After authentication is established, transfer the guest session before
navigating and keep authenticated refreshes out of the door route.

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
