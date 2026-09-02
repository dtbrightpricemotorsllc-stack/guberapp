---
name: JAC Live Interactive Character Experience
description: Architecture and key facts for the JAC two-surface homepage experience built per the spec.
---

# JAC Live Interactive Character Experience

## Entry flow (web)
The full-screen door scene is the sole web launch visual on every refresh. The universal mascot loading splash is native-only, because stacking it above the door creates ghost layers. Native bypasses the door.

**Why:** The entry must feel like one continuous cinematic environment. CSS-composited doors, backgrounds, masks, and character plates read as pasted layers and break depth continuity.

**How to apply:** Serve one generated 9:16 video for the door, light bloom, physical opening, character approach, and camera push. Use source art only to condition generation, never as runtime scene layers. Keep a tiny branded poster only for first paint, reduced motion/data, or video failure. The canonical JAC surface mounts only after optional Explore. Web auth guards and lazy-route fallbacks must use a quiet dark transition, never the mascot loader.

## Continuous cinematic-to-JAC handoff
Start the canonical OpenAI Realtime session behind the playing door film after the visitor's Enter gesture. ENTER must synchronously prime microphone permission and browser audio before React state updates. On the final frame, keep the same video element mounted and reveal the greeting/conversation controls over it; do not mount another splash or startup surface.

**Why:** The cinematic and live JAC must remain one experience with one predictable microphone and audio owner.

**How to apply:** Use ENTER for getUserMedia, audio unlock, and Realtime activation; require connection confirmation before showing a live state. Request the greeting once through the same Realtime session. On Explore, unmount the door controller and reveal text-only canonical JAC. The dashboard stays text-only.

## ENTER remains the authoritative voice choice
Never let a voice startup failure switch the door scene into text mode or focus the composer. Microphone denial/unavailability may expose Type Instead, but the keyboard opens only after the visitor explicitly chooses text. Recoverable session, audio, token, and transport failures remain voice-first and preserve gesture-acquired resources for retry.

**Why:** Samsung Browser showed that generic error fallback could mount and focus the textarea during the cinematic, opening the keyboard and overriding the visitor's ENTER choice.

**How to apply:** Classify microphone failures separately from session/provider/transport failures. Stop after any initialization failure and show exactly one explicit Retry control plus Type Instead; never schedule an automatic reconnect from a provider callback.

## Realtime volume and transcript parity
Every JAC audio transport must honor the shared persisted JAC volume, including raw realtime PCM playback. Door transcripts must use a genuinely touch-scrollable inner viewport with readable mobile type and no fade mask over conversation text.

**Why:** Samsung Browser exposed two gaps: realtime output bypassed the visible volume preference, and a flex child without a shrinkable height appeared scrollable but ignored touch movement while clipping long replies.

**How to apply:** Route realtime playback through a gain node that reads the live JAC volume. For the transcript, keep the scroll child at `min-height: 0`, enable vertical touch panning, preserve bottom clearance, and verify with an actual mobile swipe—not only a desktop wheel.

## Account-aware sign-in handoff
When JAC starts authentication without an explicit in-progress destination, do not synthesize `/dashboard` as `returnTo`; let resolved account type choose the landing dashboard. The shared `/dashboard` remains accessible afterward, including from Business navigation.

**Why:** A generic return path overrode business routing and caused a consumer-dashboard redirect hop before the correct Business dashboard, making sign-in feel broken and preventing access to the shared hub.

**How to apply:** Preserve explicit campaign/workflow resume paths only. Default consumers to the shared dashboard, businesses to the Business dashboard, and label the Business navigation link back to the shared hub clearly.

Guest-to-account continuity is persisted, not a promise that a WebSocket survives a full-page OAuth navigation. Transfer the guest JAC session only after authentication is verifiably established, await that transfer before dashboard navigation, and keep the shared browser-session transcript available to the authenticated text surface.

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
- `JacOpenAIRealtimeSession` is the only live controller on canonical public voice surfaces
- OpenAI startup failures stop in text fallback; they do not switch providers
- Session may auto-boot only when microphone readiness is already known
- If mic denied: `needGesture=true` → overlay with Allow/Skip buttons
- Phase mapping follows the Realtime transport's connecting/listening/thinking/speaking/muted/error states
- Text mode: POST `/api/jac/onboard` with `mode: "homepage"`, last 12 messages
- Surface 2: `inferSurface(text)` does keyword routing → updates surface kind
- Session storage key: `jac_live_msgs_v1` (keeps last 40 messages)

## Session endpoints
- Guest and authenticated Realtime token endpoints mint short-lived relay access
- The browser connects through the same-origin OpenAI Realtime relay
- Legacy ConvAI endpoints are not part of the public door/canonical live path

## Layout
- Desktop: `lg:flex-row` — Surface 1 = `lg:w-[340px] xl:w-[380px] flex-shrink-0`, Surface 2 = `flex-1`
- Mobile: `flex-col` — stacked, JAC on top

**Why no JacConvaiSession:** Public live voice must not start or fall back to a competing provider. Legacy specialized surfaces may retain ConvAI independently.

## Confirmed working
- Door/mobile deterministic acceptance covers welcome, listening, user transcript, approved spoken reply, interruption, failure, and retry states
- JAC character renders with glow animations visible in screenshot
- Mic overlay shows correctly when mic unavailable
- Surface 2 welcome chips render on the right side
