---
name: Cross-platform voice STT
description: Bugs and fixes for JAC voice recognition on iPhone, Android, and PWA
---

## Four compounding bugs that caused "not picking up" on iPhone

### 1. Sentinels silently swallowed in use-speech.ts
`__whisper_error__` and `__whisper_empty__` were filtered out before reaching the consumer. User saw zero feedback when STT failed — they thought the mic wasn't working when in fact STT was failing silently.

**Fix:** Pass all sentinels through to `doSend()` in `guber-assistant.tsx`. Handle `__whisper_empty__` with "I didn't catch that — tap the mic and try again" and `__whisper_error__`/`__mic_error__` with "Something went wrong with voice — please try again."

### 2. STT rate limit too low (5 calls/minute per IP)
After 5 voice messages in one minute → 429 → `__whisper_error__` → silently swallowed → nothing. Mobile NAT means multiple users can share one IP.

**Fix:** Raised to 20 calls/minute in `/api/jac/stt`.

### 3. `new MediaRecorder(stream, { mimeType })` not wrapped in try/catch
On iOS WKWebView, if `getBestMimeType()` returns a type the recorder rejects (e.g. "audio/webm" fallback on older iOS), the constructor throws. The stream was opened but never stopped → resource leak + silent failure.

**Fix:** Added `audio/mp4;codecs=mp4a.40.2` and `audio/mp4` to the MIME priority list (iOS-native). Wrapped `new MediaRecorder()` in try/catch with fallback `new MediaRecorder(stream)` (no mimeType — let browser choose). Use `rec.mimeType` property (actual chosen type) in `_finalize` instead of the option we passed.

### 4. Base64 encoding via `reduce()` could hang on large buffers
`new Uint8Array(buffer).reduce((acc, byte) => acc + String.fromCharCode(byte), "")` builds a massive intermediate string character by character. On iOS, this caused memory pressure on longer recordings.

**Fix:** Chunked loop: `for (let i = 0; i < bytes.byteLength; i += 8192) { binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); }`

## Server-side MIME→extension mapping
`audio/mp4;codecs=mp4a.40.2` must map to `.m4a`. Updated the `ext` determination to also handle `ogg` and `mp3` explicitly. OpenAI Whisper accepts: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm.

## Platform routing (voice/index.ts)
- iOS Capacitor → WhisperProvider (WKWebView SpeechRecognition is unreliable, MediaRecorder is supported iOS 14.5+)
- Android Capacitor → WhisperProvider (permission flow more reliable via getUserMedia)
- Safari browser → WhisperProvider (webkitSpeechRecognition doesn't persist mic grant)
- Chrome/Edge → WebSpeechProvider

**Why:** WKWebView's SpeechRecognition API requires user gesture on every call and doesn't reliably persist permission grants. MediaRecorder + Whisper is more predictable cross-platform.
