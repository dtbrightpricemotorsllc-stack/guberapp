---
name: JAC voice latency optimization
description: How the JAC (GUBER AI assistant) voice pipeline was optimized for latency, voice quality, tone, and fallback visibility — read before touching STT/chat/TTS timing or ElevenLabs settings again.
---

Full pipeline: browser mic → `/api/jac/stt` (OpenAI transcribe) → `/api/ai/guber-assist` (OpenAI chat, JSON) → `/api/jac/tts` (ElevenLabs) → client playback.

## Latency
- Every stage logs its own duration server-side (`_sttStart`, `_assistStart`, `_ttsStart` timers) and returns `latencyMs` in the JSON response so the client can log end-to-end breakdown, not just guess.
- ElevenLabs call uses the `/stream` endpoint with `optimize_streaming_latency=3` and the `eleven_flash_v2_5` model (low-latency), not the default model — the default model was the single biggest latency contributor.
- Client playback (`client/src/lib/jac-tts.ts`) plays audio progressively via `MediaSource` (appendBuffer per chunk, `audio.play()` after first chunk) instead of buffering the whole response with `res.blob()` first. Falls back to full-blob buffering when `MediaSource.isTypeSupported("audio/mpeg")` is false or the stream fails partway. iOS still bypasses this whole tier (WKWebView streaming issues) and goes straight to Web Speech.

**Why:** blob-buffering added the full TTS generation+download time before any sound played; progressive MSE playback lets audio start as soon as the first chunk arrives.

## Voice mode / tone
- Client tracks whether the last user turn came from the mic (`lastInputWasVoiceRef` in `guber-assistant.tsx`) and sends `voiceMode: true` to `/api/ai/guber-assist`.
- Server injects an extra system-prompt block ONLY when `voiceMode` is true, telling the model to answer in 1-3 short sentences, casual/contractions, no "great question" filler, one question at a time — the base prompt's "under 120 words" was still too long/robotic for spoken delivery. `max_tokens` is also capped tighter (220 vs 600) in voice mode.

**Why:** typed chat and spoken chat have different ideal response shapes; gating on an explicit flag (not just "response gets played back") means typed conversations keep full detail while voice stays snappy.

## Fallback visibility (item D)
- `POST /api/jac/tts/fallback-log` (no auth, fire-and-forget, returns 204) is the ONLY way a silent Web Speech fallback becomes visible to admins — it logs to `jacVoiceUsageLog` with `provider: "web_speech_fallback"` and `errorMessage: "client_fallback:<reason>"`. Any new client-side fallback path must call this.
- A 204 response from this endpoint is correct/expected, not a bug — it's intentionally fire-and-forget with no body.
