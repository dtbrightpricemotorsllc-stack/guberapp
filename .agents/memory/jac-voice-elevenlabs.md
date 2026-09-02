---
name: JAC voice transport split
description: Canonical signed ElevenLabs ConvAI ownership and the boundary around non-canonical voice surfaces.
---

## Current transport status

The ENTER door and canonical public live experience use signed ElevenLabs ConvAI
as their only live voice transport. They never switch to OpenAI Realtime,
browser speech, cached/local greeting audio, or another provider after failure.

ENTER synchronously primes microphone/audio and starts the ConvAI session.
The configured agent owns audible voice output, and displayed transcripts are
deduplicated separately.

**Why:** Provider fallback created a failing second lifecycle, duplicate
greetings, and unpredictable microphone ownership. The previously reliable
signed ConvAI path is now the intentional single owner.

**How to apply:** On startup failure, stop in the calm text-capable error state
with one explicit Retry control; do not switch providers. Text remains usable.
The post-Explore canonical surface and authenticated dashboard are text-only,
and the door controller must unmount after handoff.

OpenAI Realtime components may remain for explicitly legacy or protected test
surfaces, but must never become a fallback for the public door/canonical path.

## One brain, never forked
JAC's brain lives in a single function `runGuberAssistBrain(sessionUser, sanitized, voiceMode)` inside the `registerRoutes` closure in `server/routes.ts`. BOTH the text route (`POST /api/ai/guber-assist`) and the ElevenLabs custom-LLM adapter (`POST /api/jac/convai/llm`) call it.

**Why:** ElevenLabs Conversational AI is pointed at our own OpenAI-Chat-Completions-compatible endpoint as its "LLM", so voice on web/iOS/android is literally the same JAC as text. If anyone ever copies/reimplements the system prompt or short-circuits into a second place, the two pipelines silently drift (different answers, memory, D.D. behavior).

**How to apply:** Extend JAC by editing `runGuberAssistBrain` only. Do not duplicate the prompt or the deterministic short-circuits (voice-tech Q, admin monitoring, D.D.) anywhere else.

## Security invariants
- Identity (`userId`) is derived ONLY from the verified per-conversation HMAC token (`server/jac-voice-token.ts`, signed with `SESSION_SECRET`), NEVER from model/agent/body fields. The `resolveVoiceToken()` helper only *locates* a candidate string; it is not trusted until `verifyJacVoiceToken()` validates it.
- The adapter STAGES nothing and EXECUTES nothing — it only returns JAC's spoken reply. Real actions must stay on the existing client-side, session-cookie-authed "user approves" path so the confirm-before-charge invariant holds by construction. Do not add a server-side "execute" tool to the voice path.
- Never weaken signed-session issuance or identity verification to recover from a
  provider configuration failure. Repair the workspace secret/configuration and
  retain rate limits rather than adding an unauthenticated or alternate-provider
  code path.

## Web client (@elevenlabs/react) gotchas
- `useConversation()` MUST be rendered inside `<ConversationProvider>` or it throws. The provider's own `useEffect` auto-calls `endSession()` on unmount, so a component-level cleanup effect is redundant — don't add one.
- Private (non-public) agents connect via `startSession({ signedUrl, dynamicVariables })` — NOT `agentId`. The identity token is passed as `dynamicVariables: { secret__jac_voice_token: <token> }`; the `secret__` prefix is what makes ElevenLabs forward it as an `x-jac-voice-token` header to the adapter instead of injecting it into the prompt.
- `startSession` returns void (fire-and-forget) in the react hook — do not `await` it; use the `onConnect`/`onError` callbacks for state.
- Prime mic permission with `getUserMedia({audio:true})` BEFORE `startSession`, but immediately `stream.getTracks().forEach(t=>t.stop())` — the SDK opens its own stream, so the priming stream otherwise leaks and keeps the mic indicator lit for the page lifetime.

**Why:** These are silent-failure / privacy traps, not compile errors — the mic-leak in particular passes review unless you know the SDK opens a second stream.

## Native
Custom Capacitor plugins wrapping the ElevenLabs Swift/Android SDKs are built and tested OFF-Replit (Xcode / Android Studio). Web ships first regardless.
