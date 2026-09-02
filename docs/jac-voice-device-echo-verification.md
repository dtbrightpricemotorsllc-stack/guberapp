# JAC voice echo verification

## Scope

This is the device-level acceptance checklist for both public JAC and the
signed-in GUBER Assistant. It is part of the release gate in
[`docs/release-checks.md`](release-checks.md). Run it with speaker output
enabled, not headphones only. Test each surface in a fresh session and repeat
once after the page or app has been backgrounded and returned to the foreground.

| Runtime | Evidence required | Public JAC | Signed-in JAC | Echo transcript hidden | No second reply | Distinct barge-in |
| --- | --- | --- | --- | --- | --- |
| iOS Safari | **REAL DEVICE** | pending | pending | pending | pending | pending |
| iOS WKWebView/TestFlight | **REAL DEVICE** | pending | pending | pending | pending | pending |
| Android Chrome | **REAL DEVICE** | pending | pending | pending | pending | pending |
| Android WebView/installed app | **REAL DEVICE** | pending | pending | pending | pending | pending |
| Desktop Chrome/Edge with speakers | **REAL DEVICE** for audio; fake-mic browser for lifecycle | pending | pending | automated pass | SDK/device run required | automated pass |

The Playwright profiles with the same runtime names are not physical-device
runs. They are labeled **FAKE-MIC BROWSER** in their test titles and can
support the lifecycle columns only. Never copy their result into a
**REAL DEVICE** row.

“No second reply” requires listening for a second assistant response after JAC
finishes the original response. A hidden duplicate transcript alone is not
enough to pass this column.

## Release procedure

### Preflight

1. Record the release build/version, commit or TestFlight build, date/time,
   tester, device model, OS version, runtime, and account state.
2. Use a disposable QA account for signed-in coverage. Do not use a real
   customer conversation in a recording or screenshot.
3. Select the output route before starting: built-in speaker, speakerphone, or
   the named Bluetooth route. Set a normal conversation volume and record the
   exact route in the run record.
4. Start with the microphone permission state recorded. For the recovery
   check, deny microphone access once, confirm the calm text fallback, grant
   access in the OS/browser settings, then retry from the JAC control. Record
   both the denied and recovered states.

### iOS Safari

1. Open the release URL in Safari on the physical iPhone. Confirm the website
   microphone permission in iOS Settings > Apps > Safari > Microphone (or the
   website settings sheet), and record whether this is the first prompt.
2. Run the public JAC flow below with the built-in speaker, then repeat it while
   signed in through the GUBER Assistant.
3. Deny once and complete the permission recovery check. The retry must either
   start listening or show one actionable error; it must not remain on
   “Connecting” indefinitely.
4. While JAC is speaking, background Safari using the app switcher, wait at
   least five seconds, and return. Record whether audio and the session resume,
   stop with a clear recovery state, or disconnect. A stuck page or silent
   microphone after return is a failure.

### iOS WKWebView / TestFlight

1. Install the release candidate through TestFlight and confirm iOS
   Settings > the GUBER app > Microphone is enabled. Record the app version and
   build number, not only the marketing version.
2. Repeat the public and signed-in flows, denial/recovery check, speaker route
   check, and app switcher background/foreground check above.
3. If permission was denied, change it in the app's Settings entry, fully
   return to GUBER, and use the JAC retry control. Do not claim recovery from
   an uninstall/reinstall unless that is the behavior being released.

### Android Chrome

1. Open the release URL in Chrome on the physical Android device. Record the
   site microphone permission from Chrome's site settings and Android's
   permission panel.
2. Repeat the public and signed-in flows, denial/recovery check, selected
   speaker or Bluetooth route, and background/foreground check.
3. For the background check, switch away for at least five seconds and return.
   Record whether the session remains usable, displays a single recovery state,
   or requires the JAC retry control.

### Android WebView / installed app

1. Install the release APK or open the Android WebView host. Record the app
   version/build and Android Settings > Apps > GUBER > Permissions >
   Microphone state.
2. Repeat the public and signed-in flows, including one denial followed by
   granting the permission in App Settings and using the in-app retry control.
3. Switch away or lock the screen for at least five seconds, return, and record
   whether audio, microphone capture, and transcript delivery recover. A
   one-time “tap to reconnect” state is acceptable only if the retry succeeds
   without a second stale session or duplicate reply.

### Conversation and barge-in steps

Use the same steps for each platform/runtime and each account state:

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

## Per-run release record

Copy this block once for each physical runtime and account state. Keep the
**Evidence class** value exactly as written so real-device results cannot be
confused with the automated fake-mic lane.

```text
JAC VOICE DEVICE RUN
Evidence class: REAL DEVICE
Run date/time (with timezone):
Release URL / build / commit:
Tester:
Device model:
OS version:
Runtime: iOS Safari | iOS WKWebView/TestFlight | Android Chrome | Android WebView/installed app
Account state: public | signed-in (QA account)
Speaker route: built-in speaker | speakerphone | Bluetooth (name):
Volume / quiet-room notes:

Microphone permission before run: not asked | allowed | denied
Permission denial/recovery: not run | passed | failed
  - Denied-state behavior:
  - Recovery action:
  - Recovery result:

Background/foreground:
  - Action and wait duration:
  - Result: session stayed usable | clear reconnect required | failed/stuck:

Public or signed-in conversation:
  - JAC response audible: yes | no | partial
  - User transcript matched spoken JAC output: no | yes
  - Second assistant reply after JAC finished: no | yes
  - Distinct barge-in transcript delivered once: yes | no
  - Distinct barge-in response audible once: yes | no
  - Observed transcript/audio behavior:

Overall result: PASS | FAIL | NOT RUN
Failure details / evidence link:
```

For the automated lane, record a separate short entry and do not merge it with
the physical record:

```text
Evidence class: FAKE-MIC BROWSER
Command: npx playwright test e2e/jac-mobile-voice-acceptance.spec.ts --reporter=list
Profiles: iOS Safari, iOS WKWebView/TestFlight, Android Chrome, Android WebView/installed app, Samsung Internet
What it proves: deterministic browser-controlled entry/listening/transcript/reply lifecycle
What it does not prove: speaker route, physical microphone capture, OS permission recovery,
background/foreground audio, or physical-device barge-in
Result:
```

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

The record below is the repository's last known release-lane result. Append new
dated records above or below it; do not overwrite a prior device result.

**Attempted:** 2026-08-23
**Result:** Physical-device acceptance is blocked in this environment. No
physical iOS or Android device is attached, and the container does not provide
`adb` or Xcode's `xcrun` device tooling. No device-level result is claimed.

**Latest check:** 2026-09-02. The deterministic mobile profiles passed
`e2e/jac-mobile-voice-acceptance.spec.ts` (5/5), the door regressions passed
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

- `npx vitest run client/src/components/jac/jac-convai-session.test.tsx
  client/src/lib/jac-openai-realtime-transport.test.ts` — **34 passed**
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