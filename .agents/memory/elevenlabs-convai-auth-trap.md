---
name: ElevenLabs ConvAI custom-LLM auth trap
description: Why the JAC conversation ended after the first user message, and the permanent fix.
---

## The trap

The `/api/jac/convai/llm` custom-LLM endpoint had two hard 401 guards:
1. `JAC_CONVAI_SHARED_SECRET` env var — checked for `x-guber-convai-secret` request header
2. HMAC voice token — checked via `secret__jac_voice_token` dynamic variable

**ElevenLabs does not automatically forward either of these to the custom LLM endpoint:**
- Custom headers you set in your own server config are not sent by ElevenLabs outbound
- Dynamic variables with `secret__` prefix are treated as ElevenLabs-internal secrets and are NOT forwarded in the custom LLM HTTP POST body
- The voice token passed via `startSession({ dynamicVariables: { secret__jac_voice_token: ... } })` never reaches the LLM endpoint

Result: every first user utterance → ElevenLabs calls `/api/jac/convai/llm` → 401 → ElevenLabs terminates session → "Conversation ended" shown.

## The fix

**Never return 4xx from a custom LLM endpoint** — it terminates the entire ElevenLabs session.

```typescript
// WRONG — terminates conversation
if (sharedSecretMismatch) return res.status(401).json({ error: "unauthorized" });

// RIGHT — warn and continue
if (sharedSecretMismatch) console.warn("...configure in ElevenLabs agent headers");
```

For user identity in the custom LLM endpoint:
- Try to resolve voice token (it may work in some configs)
- If missing/invalid: fall back to anonymous `effectiveUser` object with safe defaults
- Catch all `runGuberAssistBrain` errors and return a graceful fallback response (never let a brain error produce a 5xx — that also terminates the session)

## Session latency

Signed URL attempt always fails for the public agent `agent_4901kwjhd1q2egmvcs3n49a158ma`.
Fixed via module-level `_jacSignedUrlKnownPublic` cache — skips the ~1-2s round-trip after the first failure.

## Tool webhook auth

Tool endpoints (`/api/jac/tools/*`) ARE called with a proper auth flow because:
- You configure the secret in the ElevenLabs agent's tool definition
- ElevenLabs sends it as a header on each tool call
- Use `x-guber-jac-secret` → `GUBER_SHARED_SECRET || JAC_WEBHOOK_SECRET`

**Why:** The LLM endpoint and tool endpoints have different calling semantics in ElevenLabs. The LLM endpoint receives raw OpenAI-compatible chat bodies; tool endpoints receive explicit webhook calls that CAN include custom headers you configure.
