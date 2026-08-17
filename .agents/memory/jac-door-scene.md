---
name: JAC Live Interactive Character Experience
description: Architecture and key facts for the JAC two-surface homepage experience built per the spec.
---

# JAC Live Interactive Character Experience

## Entry flow (web)
`App.tsx` → `SplashWrapper` (while auth loads) → `home.tsx` → `<JacLiveExperience />` in a `max-w-5xl mx-auto` section. No door gate. No mascot loader for web.

## Core files
- `client/src/components/jac/jac-character-renderer.tsx` — animated JAC with 5 CSS states + canvas mouth overlay
- `client/src/components/jac/jac-live-experience.tsx` — two-surface layout; ConversationProvider wrapper + JacLiveInner

## JacCharacterRenderer
- Image: `/splash/char-jac-v2.png` (public path, 574×1046 RGBA)
- CSS animations injected once via module-level bool `_cssInjected`
- Mouth canvas: MOUTH_X_PCT=0.571, MOUTH_Y_PCT=0.296, MOUTH_W_PCT=0.190 (estimated from pixel analysis)
- Spring physics: k=22, b=8; multi-freq oscillator: [3.1, 5.7, 8.3, 11.2, 2.3] Hz
- Blink: random interval 2.8–6.3s; overlay div opacity 0→1→0 in 110ms
- JacState: `"idle" | "listening" | "thinking" | "speaking" | "interrupted"`

## JacLiveExperience architecture
- `ConversationProvider` (ElevenLabs) wraps `JacLiveInner`
- `JacLiveInner` uses `useConversation` hook directly (not JacConvaiSession)
- Session auto-boots on mount: parallel `getUserMedia` + session fetch
- If mic denied: `needGesture=true` → overlay with Allow/Skip buttons
- Phase mapping: `isSpeaking` → speaking, `isListening` → listening, connected+neither → thinking, else → idle
- Text mode: POST `/api/jac/onboard` with `mode: "homepage"`, last 12 messages
- Surface 2: `inferSurface(text)` does keyword routing → updates surface kind
- Session storage key: `jac_live_msgs_v1` (keeps last 40 messages)

## Session endpoints
- Guest (unauthenticated): `/api/jac/convai/investor-session` — no auth required, returns signed URL
- Logged-in: `/api/jac/convai/session` — requires auth, injects user context
- Both return: `{ agentId, signedUrl, voiceToken, dynamicVariableName, userContext }`

## Layout
- Desktop: `lg:flex-row` — Surface 1 = `lg:w-[340px] xl:w-[380px] flex-shrink-0`, Surface 2 = `flex-1`
- Mobile: `flex-col` — stacked, JAC on top

**Why no JacConvaiSession:** JacLiveInner uses `useConversation` directly for full layout control. JacConvaiSession is still used by other parts (guber-assistant, jac-homepage).

## Confirmed working
- `POST /api/jac/convai/investor-session 200` with signed ElevenLabs URL
- JAC character renders with glow animations visible in screenshot
- Mic overlay shows correctly when mic unavailable
- Surface 2 welcome chips render on the right side
