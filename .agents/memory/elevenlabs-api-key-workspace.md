---
name: ElevenLabs API key requirements for JAC voice
description: The ElevenLabs workspace and permission requirements for signed-URL JAC voice.
---

# ElevenLabs API key requirements for JAC voice

## The rule
`ELEVENLABS_API_KEY` must come from the same ElevenLabs workspace that owns the configured production JAC agent, and the key must have the **`convai_write` permission** scope enabled.

**Why:** The signed-URL endpoint (`GET /v1/convai/conversation/get-signed-url?agent_id=...`) requires both workspace ownership/sharing AND the `convai_write` permission. Without the right workspace → 404 "not found / not shared with you". Without `convai_write` → 401 "missing permission convai_write".

**How to apply:** Whenever the credential is rotated or replaced, verify workspace ownership and signed-URL permission through the approved secrets and provider tooling before deployment.

Credentials from a different workspace must never be substituted for the production JAC credential, even when they are otherwise valid ElevenLabs keys.

## Fallback behavior (public-agent mode)
When signed-URL returns non-200, the server caches "public agent" for 5 min and returns only `agentId`. The client falls back to WebRTC via `agentId`. For a private agent this always fails with `unexpected_disconnect`. The fallback is correct behavior only for genuinely public agents.
