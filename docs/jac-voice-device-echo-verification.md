# JAC voice echo verification

## Scope

This is the device-level acceptance checklist for both public JAC and the
signed-in GUBER Assistant. Run it with speaker output enabled, not headphones
only. Test each surface in a fresh session and repeat once after the page has
been backgrounded and returned to the foreground.

| Runtime | Public JAC | Signed-in JAC | Echo transcript hidden | No second reply | Distinct barge-in |
| --- | --- | --- | --- | --- | --- |
| iOS Safari | manual device run | manual device run | pending | pending | pending |
| iOS WKWebView/TestFlight | manual device run | manual device run | pending | pending | pending |
| Android Chrome | manual device run | manual device run | pending | pending | pending |
| Android WebView/installed app | manual device run | manual device run | pending | pending | pending |
| Desktop Chrome/Edge with speakers | automated callback test + manual run | automated callback test + manual run | automated pass | SDK/device run required | automated pass |

“No second reply” requires listening for a second assistant response after JAC
finishes the original response. A hidden duplicate transcript alone is not
enough to pass this column.

## Test procedure

1. Open public JAC and start live voice with the device speaker at a normal
   conversation volume.
2. Ask a question that produces a response of at least eight words.
3. While JAC is speaking, watch the transcript and listen for a follow-up
   response. JAC's own words must not appear as a user message and must not
   cause another assistant response.
4. While JAC is still speaking, say a clearly different interruption such as
   “No, help me post a job instead.” The interruption must appear as the user
   turn and receive one response.
5. Repeat steps 1–4 while signed in through the GUBER Assistant.
6. Repeat on speakerphone, with Bluetooth audio if available, and after
   background/foreground on mobile.

## Current mitigation and platform boundary

The live session requests `echoCancellation`, `noiseSuppression`, and
`autoGainControl` from `getUserMedia`. As a narrow fallback, a transcript that
closely matches JAC's most recent spoken output is ignored for five seconds.
The comparison normalizes case and punctuation, and does not suppress short
utterances or distinct interruptions.

The transcript callback is delivered by the ElevenLabs ConvAI SDK after audio
has already reached the service. Therefore the client-side guard can
guarantee that an echoed transcript is not shown as a user message, but it
cannot cancel a server-side response that the SDK has already started from
that audio. Do not “solve” this by muting the microphone throughout speech:
that breaks legitimate barge-in. If a real device produces a second reply,
the barge-in-safe next mitigation is an SDK/server-level echo gate or
server-side duplicate-turn suppression, not a client-only transcript filter.

## Automated regression coverage

`jac-convai-session.test.tsx` verifies:

- browser echo constraints are requested;
- an exact or normalized reflected assistant utterance does not reach the user
  transcript callback;
- a distinct interruption still reaches that callback;
- short acknowledgements are not treated as echoes; and
- the five-second reflection window expires.

The automated test uses a fake microphone and Chromium/jsdom. It is not a
substitute for the physical-device rows above.

## Verification record

**Attempted:** 2026-08-23
**Result:** Physical-device acceptance is blocked in this environment. No
physical iOS or Android device is attached, and the container does not provide
`adb` or Xcode's `xcrun` device tooling. No device-level result is claimed.

**Latest check:** 2026-09-02. The deterministic mobile profiles passed
`e2e/jac-mobile-voice-acceptance.spec.ts` (2/2), the door regressions passed
`e2e/door-entry-regressions.spec.ts` (12/12), the OpenAI Realtime transport and
relay unit coverage passed (23/23), and the public provider-route regression
passed (3/3). These results verify the simulated/browser-controlled lifecycle
and the no-legacy-ConvAI route guard only; they do not change the pending
physical-device status.

The four required runtime rows remain pending for both public and signed-in
JAC:

- iOS Safari — not run
- iOS WKWebView/TestFlight — not run
- Android Chrome — not run
- Android WebView/installed app — not run

The available automated evidence is:

- `npx vitest run client/src/components/jac/jac-convai-session.test.tsx` —
  **21 passed**
- The suite covers requested browser echo-cancellation constraints, hidden
  reflected assistant speech, distinct barge-in delivery, short utterances,
  and expiry of the reflection window.

The standalone WebSocket transport validator was also attempted, but it
currently reports two stale expectations for `connectionType: "websocket"` and
`connectionDelay: 0`; those options are intentionally absent from the current
session startup path while Task 843 is in progress. Its result is not used as
device-level evidence.

When physical devices are available, replace the pending entries above with
the observed result for both auth states, and repeat with speaker output,
Bluetooth where available, and background/foreground return. A pass must
confirm both that no reflected speech appears as a user transcript or causes a
second reply and that a distinct interruption receives exactly one response.