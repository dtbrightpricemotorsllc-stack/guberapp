---
name: JAC Door Scene — interactive character entry
description: How the GUBER entry door scene works, animation states, greeting guard, conversation flow.
---

# JAC Door Scene Architecture

## Entry flow
`App.tsx` → `DoorGate` (fixed z-9999 overlay) → `GuberDoorSplash` — this is the ONLY entry for web users. The badger mascot loader (`SplashWrapper`) is native-only. A module-level `_greetingHasFired` bool guards the greeting from replaying across React remounts.

## Files
- `client/src/components/guber-door-splash.tsx` — single entry controller (CLOSED → UNLOCKING → OPENING → OPEN → CONVERSATION → EXIT)
- `client/src/components/jac/jac-animated-character.tsx` — JAC with canvas mouth overlay + 4 CSS states

## Four JAC animation states
`JacState`: `"idle" | "listening" | "thinking" | "speaking"` — derived in `guber-door-splash.tsx` from `convaiPhase` (ElevenLabs SDK already exports `"thinking"`), `greetingPlaying`, `textLoading`, `jacSpeakingTx`.

## Canvas mouth overlay
- Source: `char-jac-v2.png` 574×1046 RGBA
- Measured mouth center: MOUTH_Y_PCT=0.296, MOUTH_X_PCT=0.571 (from pixel-coverage analysis)
- Spring-physics amplitude simulation (not real audio; task #810 covers real audio)
- RAF loop draws spring-driven ellipse; clears canvas when amplitude < 0.01
- THINKING: 3 purple pulsing dots near forehead; LISTENING: cyan face glow

**Why:** Canvas overlay at same dims as img allows mouth to move without replacing the character PNG or needing multi-layer assets.

## Continuous voice session
`JacConvaiSession` (wraps ElevenLabs ConvAI) handles turn detection automatically — no push-to-talk after first TALK press. Mic button becomes MUTE toggle. `suppressFirstMessage={true}` so JAC doesn't re-greet from ConvAI.

## /api/jac/onboard (text mode)
Accepts `{ messages: [{role, content}][], mode: "homepage" }` — pass full conversation history, last 12 messages. Returns `{ message, reply, actions[] }`.
