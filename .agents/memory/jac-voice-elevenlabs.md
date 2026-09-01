---
name: JAC voice transport split
description: JAC's shared brain and voice invariants across direct OpenAI Realtime and the signed ConvAI fallback.
---

## Current transport status

The ENTER door uses the signed ElevenLabs ConvAI session as its sole transport,
because it must provide one continuous agent-owned welcome, STT, turn detection,
brain response, and spoken reply. Other JAC surfaces may use the OpenAI Realtime
speech-renderer relay when a direct realtime credential exists, but must never
mount competing active transports.

Replit's managed OpenAI HTTP integration credential is a proxy credential, not
a direct OpenAI API key. Its HTTP base rejects realtime WebSocket upgrades and
the credential is rejected at OpenAI's direct realtime endpoint. Only a genuine
`OPENAI_REALTIME_API_KEY` or direct `OPENAI_API_KEY` may activate the relay;
never treat `AI_INTEGRATIONS_OPENAI_API_KEY` as realtime-capable.

**Why:** The door previously opened the microphone through the relay path while
the environment lacked a direct realtime credential; the healthy signed ConvAI
path was never engaged, leaving a text-looking conversation with no usable
two-way audio.

**How to apply:** For the door, prime microphone/audio synchronously from ENTER,
prewarm the signed session, and let ConvAI connect during the cinematic. Retry
one recoverable startup failure automatically; after that, show an explicit
not-connected status. Microphone denial may expose Type Instead but must not
focus it.

## One brain, never forked
JAC's brain lives in a single function `runGuberAssistBrain(sessionUser, sanitized, voiceMode)` inside the `registerRoutes` closure in `server/routes.ts`. BOTH the text route (`POST /api/ai/guber-assist`) and the ElevenLabs custom-LLM adapter (`POST /api/jac/convai/llm`) call it.

**Why:** ElevenLabs Conversational AI is pointed at our own OpenAI-Chat-Completions-compatible endpoint as its "LLM", so voice on web/iOS/android is literally the same JAC as text. If anyone ever copies/reimplements the system prompt or short-circuits into a second place, the two pipelines silently drift (different answers, memory, D.D. behavior).

**How to apply:** Extend JAC by editing `runGuberAssistBrain` only. Do not duplicate the prompt or the deterministic short-circuits (voice-tech Q, admin monitoring, D.D.) anywhere else.

## Security invariants (hold these before flipping the flag)
- Identity (`userId`) is derived ONLY from the verified per-conversation HMAC token (`server/jac-voice-token.ts`, signed with `SESSION_SECRET`), NEVER from model/agent/body fields. The `resolveVoiceToken()` helper only *locates* a candidate string; it is not trusted until `verifyJacVoiceToken()` validates it.
- The adapter STAGES nothing and EXECUTES nothing — it only returns JAC's spoken reply. Real actions must stay on the existing client-side, session-cookie-authed "user approves" path so the confirm-before-charge invariant holds by construction. Do not add a server-side "execute" tool to the voice path.
- Before enabling `voice_pipeline_v2` in production (architect-required, not optional):
  1. Set `JAC_CONVAI_SHARED_SECRET` in prod and enforce the `x-guber-convai-secret` header — the voice token lives in the browser, so a leaked token alone must not be able to burn OpenAI/ElevenLabs cost.
  2. Add per-user / per-conversation-id rate limiting to the adapter — a 2h replayable token with no limit is an LLM-cost DoS vector once a mint endpoint exists.

## Cost gate
ElevenLabs Conversational AI is billed per-minute. Web rollout (Phase 2) and native (Phase 3) require explicit user cost sign-off + spend caps first. The old STT/TTS pipeline must stay intact as a fallback — never delete those routes when rolling out.

## Web client (@elevenlabs/react) gotchas
- `useConversation()` MUST be rendered inside `<ConversationProvider>` or it throws. The provider's own `useEffect` auto-calls `endSession()` on unmount, so a component-level cleanup effect is redundant — don't add one.
- Private (non-public) agents connect via `startSession({ signedUrl, dynamicVariables })` — NOT `agentId`. The identity token is passed as `dynamicVariables: { secret__jac_voice_token: <token> }`; the `secret__` prefix is what makes ElevenLabs forward it as an `x-jac-voice-token` header to the adapter instead of injecting it into the prompt.
- `startSession` returns void (fire-and-forget) in the react hook — do not `await` it; use the `onConnect`/`onError` callbacks for state.
- Prime mic permission with `getUserMedia({audio:true})` BEFORE `startSession`, but immediately `stream.getTracks().forEach(t=>t.stop())` — the SDK opens its own stream, so the priming stream otherwise leaks and keeps the mic indicator lit for the page lifetime.

**Why:** These are silent-failure / privacy traps, not compile errors — the mic-leak in particular passes review unless you know the SDK opens a second stream.

## Native
Custom Capacitor plugins wrapping the ElevenLabs Swift/Android SDKs are built and tested OFF-Replit (Xcode / Android Studio). Web ships first regardless.
