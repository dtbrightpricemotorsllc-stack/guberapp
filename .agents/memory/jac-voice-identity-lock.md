---
name: JAC voice identity lock
description: The approved JAC ElevenLabs voice must remain the sole audio identity across live and direct speech.
---

JAC must only speak with ElevenLabs voice `h2dQOVyUfIDqY2whPOMo`. Direct server TTS and all live ConvAI session startup paths enforce this same ID. Browser Web Speech, static audio clips, local-storage voice selection, and environment/caller voice overrides are not acceptable fallbacks for JAC.

**Why:** A fallback voice makes JAC sound like a different assistant and breaks the continuous conversation experience.

**How to apply:** When adding or changing a JAC speech surface, route direct speech through the locked ElevenLabs service and attach the shared ConvAI TTS override. If ElevenLabs is unavailable, surface/report the failure while keeping JAC silent; do not replace the voice. Studio narration and other non-JAC voice features are outside this rule.