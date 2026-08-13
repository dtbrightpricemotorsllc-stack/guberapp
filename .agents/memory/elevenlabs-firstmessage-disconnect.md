---
name: ElevenLabs firstMessage empty-string disconnect
description: Sending firstMessage:"" in startSession overrides causes ElevenLabs to immediately close the WebSocket after accepting the handshake.
---

# ElevenLabs firstMessage:"" causes immediate disconnect

## The rule
Never pass `firstMessage: ""` in `params.overrides.agent` when calling `startSession`. ElevenLabs accepts the WebSocket handshake but then closes it immediately, producing a `connect → unexpected_disconnect` telemetry pattern on every attempt.

**Why:** ElevenLabs treats an empty-string firstMessage as an invalid configuration and terminates the session server-side. The browser SDK never surfaces a meaningful error — you just see `onConnect` fire followed immediately by `onDisconnect`.

**How to apply:** To suppress JAC's opening greeting, use a different mechanism (e.g. set a non-empty but silent firstMessage on the agent config in ElevenLabs dashboard, or handle the greeting display in the React UI). Do not set `firstMessage: ""` in the SDK params.

## Diagnostic signature
- Telemetry table `jac_voice_convai_events`: alternating `connect` / `disconnect | unexpected_disconnect` rows, every session, no successful conversations
- WebSocket handshake succeeds from Node.js `ws` client to the same signed URL
- No `error` events — only `disconnect`

## Resolution
Remove the `params.overrides = { agent: { firstMessage: "" } }` block from `boot()` in `client/src/components/jac/jac-convai-session.tsx`. Let ElevenLabs play its configured firstMessage — this is also the correct UX for the splash-tap auto-start flow (JAC speaks on tap without any extra code).
