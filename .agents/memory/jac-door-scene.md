---
name: JAC Live Interactive Character Experience
description: Architecture and key facts for the JAC two-surface homepage experience built per the spec.
---

# JAC Live Interactive Character Experience

## Entry flow (web)
The full-screen door scene is the sole web launch visual on every refresh. The universal mascot loading splash is native-only, because stacking it above the door creates ghost layers. Native bypasses the door.

**Why:** The entry must feel like one continuous cinematic environment. CSS-composited doors, backgrounds, masks, and character plates read as pasted layers and break depth continuity.

**How to apply:** Serve one generated 9:16 video for the door, light bloom, physical opening, character approach, and camera push. Use source art only to condition generation, never as runtime scene layers. Keep a tiny branded poster only for first paint, reduced motion/data, or video failure. The canonical JAC surface mounts only after optional Explore.

## Continuous cinematic-to-JAC handoff
Warm the invisible realtime voice session behind the playing door film after the visitor's Enter gesture. On the final frame, keep the same video element mounted and reveal the greeting/conversation controls over it; do not mount another splash or startup surface.

**Why:** The cinematic and live JAC are one experience. Starting voice only after the film, swapping artwork, or showing another loader makes the reveal feel like a handoff to a second screen.

**How to apply:** Use the Enter gesture for microphone permission, hold all live UI until the film reaches its clean final frame, then have the connected realtime session speak the greeting. Keep Type Instead visible if voice permission or connection fails.

## ENTER remains the authoritative voice choice
Never let a voice startup failure switch the door scene into text mode or focus the composer. Microphone denial/unavailability may expose Type Instead, but the keyboard opens only after the visitor explicitly chooses text. Recoverable session, audio, token, and transport failures remain voice-first and preserve gesture-acquired resources for retry.

**Why:** Samsung Browser showed that generic error fallback could mount and focus the textarea during the cinematic, opening the keyboard and overriding the visitor's ENTER choice.

**How to apply:** Classify microphone failures separately from recoverable transport failures, retain the prepared microphone/audio activation across retries, and keep a clear connecting state through the reveal.

## Core files
- `client/src/components/guber-door-splash.tsx` — web door, greeting, in-scene conversation, and optional Explore handoff
- `client/src/components/jac/jac-character-renderer.tsx` — animated JAC with 5 CSS states + canvas mouth overlay
- `client/src/components/jac/jac-live-experience.tsx` — two-surface layout; ConversationProvider wrapper + JacLiveInner

## Door-scene character motion
Character arrival and camera movement are baked into the single cinematic video. Do not add transparent character plates, masks, split door panels, or CSS arrival animations back into the door scene.

**Why:** The supplied art is identity reference material; putting it on top of the scene recreates the rejected collage effect. The face patch can also look like a hole or glitch over a cinematic frame.

**How to apply:** Let the film finish, then place only accessible live controls and conversation copy over the settled frame. Reserve mouth-canvas rendering for the canonical post-Explore experience.

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
