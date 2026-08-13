---
name: ElevenLabs API key requirements for JAC voice
description: The specific ElevenLabs workspace and permission requirements for signed-URL voice to work with agent_4901kw...
---

# ElevenLabs API key requirements for JAC voice

## The rule
`ELEVENLABS_API_KEY` must come from the **same ElevenLabs workspace** that owns `agent_4901kwjhd1q2egmvcs3n49a158ma` ("My Agent"), AND the key must have the **`convai_write` permission** scope enabled.

**Why:** The signed-URL endpoint (`GET /v1/convai/conversation/get-signed-url?agent_id=...`) requires both workspace ownership/sharing AND the `convai_write` permission. Without the right workspace → 404 "not found / not shared with you". Without `convai_write` → 401 "missing permission convai_write".

**How to apply:** Whenever `ELEVENLABS_API_KEY` is rotated or replaced, verify it satisfies both conditions before deploying. The quickest check: `curl "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=agent_4901kwjhd1q2egmvcs3n49a158ma" -H "xi-api-key: $KEY"` — must return 200 with a `signed_url` field.

## History
- From July 2026 through August 13 2026, a staging-workspace key (`sk_e36cffa9f...`) was in `ELEVENLABS_API_KEY`. It returned 404 for the agent, causing the server to fall back to public-agent WebRTC mode, which always resulted in `unexpected_disconnect`. Voice never successfully connected during this entire period (confirmed via `jac_voice_convai_events` — 33 connects, 0 clean disconnects).
- Fixed August 13 2026 by providing a key from the correct workspace with `convai_write` scope.

## The staging workspace
The key `sk_e36cffa9f...` belongs to a staging ElevenLabs workspace containing only `agent_5301kwstphvnf5ktbkwmy5rqrj1f` ("JAC — GUBER Voice (staging)"). Do not use this as the production key.

## Fallback behavior (public-agent mode)
When signed-URL returns non-200, the server caches "public agent" for 5 min and returns only `agentId`. The client falls back to WebRTC via `agentId`. For a private agent this always fails with `unexpected_disconnect`. The fallback is correct behavior only for genuinely public agents.
