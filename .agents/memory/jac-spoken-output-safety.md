---
name: JAC spoken-output safety
description: Speech-only boundary and echo-reflection rules for the ConvAI voice transport.
---

## One final boundary before ElevenLabs

Every response headed to ElevenLabs must pass a whole-message speech-safety
validation step immediately before it is framed as an OpenAI-compatible
completion/SSE response. This includes anonymous/public and authenticated JAC.
Structured response fields may still drive the UI, but only a validated
conversational reply can be spoken.

**Why:** Prompt instructions alone cannot reliably prevent a model from putting
JSON, planning, routing, tool, system, debug, or malformed structured output
in a nominal reply field. Streaming unvalidated partial chunks creates the same
leak risk before the final content is known.

**How to apply:** Keep anonymous voice buffered until the final reply is
available, then use the same boundary as the authenticated adapter. On failure,
use the safe conversational fallback; never try to salvage or narrate metadata.

## Echo reflection guard

Treat a recent assistant message that returns as a near-identical user
transcript during active speech as acoustic echo, not a new user turn. Preserve
distinct user interruptions so natural barge-in remains available.

**Why:** ConvAI output and microphone capture are separate media paths, but
speaker audio can still be acoustically transcribed on some device/browser
combinations.

**How to apply:** Keep the actual ConvAI mic capture configured for echo
cancellation, noise suppression, and automatic gain control where the SDK uses
browser getUserMedia. Do not broadly mute input during speech unless the SDK
offers a verified, barge-in-safe control.