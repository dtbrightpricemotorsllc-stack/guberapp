---
name: JAC voice identity lock
description: The approved JAC ElevenLabs voice must remain the sole audio identity across live and direct speech.
---

JAC must keep one approved ElevenLabs identity. Direct server TTS enforces the approved voice ID. Live signed ConvAI sessions must use the voice configured on the ElevenLabs agent and must not send a client-side TTS override in the session startup payload. Browser Web Speech, static audio clips, local-storage voice selection, and environment/caller voice overrides are not acceptable fallbacks for JAC.

**Why:** A fallback voice makes JAC sound like a different assistant. More importantly, the later client-side ConvAI TTS override allowed the signed WebSocket to connect and then immediately disconnect before the greeting; restoring the agent-owned August 23 payload restored audible live voice.

**How to apply:** Route direct speech through the locked ElevenLabs service. For live ConvAI, send only the signed URL and required dynamic context; configure the approved voice on the ElevenLabs agent itself. If ElevenLabs is unavailable, surface/report the failure while keeping JAC silent; do not replace the voice. Studio narration and other non-JAC voice features are outside this rule.