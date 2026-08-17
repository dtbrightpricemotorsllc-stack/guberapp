/**
 * JAC mouth live-amplitude e2e test.
 *
 * Verifies the real-audio mouth-animation pipeline (jac-audio-analyser.ts):
 *   1. With no live audio tap, getJacLiveAmplitude() returns null
 *      (character falls back to the sine-wave simulation).
 *   2. When a MediaStream-backed <audio> element starts playing (the way the
 *      ElevenLabs ConvAI WebRTC SDK mounts its output), the document-level
 *      tap captures it and getJacLiveAmplitude() returns a non-null, non-zero,
 *      CHANGING amplitude driven by the actual audio signal.
 *
 * Uses the window.__jacAudioDebug hook exposed by client/src/lib/jac-audio-analyser.ts.
 */
import { test, expect } from "@playwright/test";

test("JAC mouth amplitude follows real audio when a ConvAI-style stream plays, null otherwise", async ({ page }) => {
  await page.goto("/");

  // The debug hook is installed when the jac-audio-analyser module loads.
  await page.waitForFunction(() => !!(window as any).__jacAudioDebug, null, { timeout: 20_000 });

  // Real user gesture — unlocks the analysis AudioContext via the
  // capture-phase pointerdown listener (gesture-gated browsers path).
  await page.mouse.click(10, 10);

  const result = await page.evaluate(async () => {
    const dbg = (window as any).__jacAudioDebug;
    dbg.ensureJacAudioTapListener();
    dbg.unlockJacAnalyserContext();

    const before = dbg.getJacLiveAmplitude(); // expect null — no tap yet

    // Synthesize a ConvAI-like source: amplitude-modulated oscillator sent
    // through a REAL WebRTC loopback (RTCPeerConnection pair). The remote
    // track received on pc2 is exactly the kind of stream the ElevenLabs SDK
    // mounts on its <audio> element — a genuine WebRTC remote MediaStream.
    const ctx = new AudioContext();
    try { await ctx.resume(); } catch {}
    const osc = ctx.createOscillator();
    osc.frequency.value = 220;
    const mod = ctx.createGain();
    // Modulate loudness ~3 Hz so successive samples differ (syllable-like).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    mod.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(mod.gain);
    const dest = ctx.createMediaStreamDestination();
    osc.connect(mod);
    mod.connect(dest);
    osc.start();
    lfo.start();

    // WebRTC loopback: local synth stream → pc1 → pc2 → remote stream.
    const pc1 = new RTCPeerConnection();
    const pc2 = new RTCPeerConnection();
    pc1.onicecandidate = (e) => { if (e.candidate) pc2.addIceCandidate(e.candidate); };
    pc2.onicecandidate = (e) => { if (e.candidate) pc1.addIceCandidate(e.candidate); };
    const remoteStreamPromise = new Promise<MediaStream>((resolve) => {
      pc2.ontrack = (e) => resolve(e.streams[0] ?? new MediaStream([e.track]));
    });
    dest.stream.getTracks().forEach((t) => pc1.addTrack(t, dest.stream));
    const offer = await pc1.createOffer();
    await pc1.setLocalDescription(offer);
    await pc2.setRemoteDescription(offer);
    const answer = await pc2.createAnswer();
    await pc2.setLocalDescription(answer);
    await pc1.setRemoteDescription(answer);
    const remoteStream = await remoteStreamPromise;

    const el = document.createElement("audio");
    el.srcObject = remoteStream;
    el.muted = true; // keep CI silent; analysis taps the stream, not the element
    document.body.appendChild(el);
    el.play().catch(() => {});
    // The tap listens for the capture-phase "playing" event; dispatch it
    // explicitly too in case autoplay is blocked in CI.
    el.dispatchEvent(new Event("playing", { bubbles: true }));

    // Sample amplitude — WebRTC audio can take a couple of seconds to start
    // flowing, so poll up to ~6 s and keep the trailing window once audio is live.
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 60));
      const a = dbg.getJacLiveAmplitude();
      if (a !== null) samples.push(a);
      // Stop once we've seen clearly-audible, varying audio.
      const loud = samples.filter((s) => s > 0.1);
      if (samples.length > 8 && loud.length > 4) break;
    }

    const ctxState = ctx.state;
    pc1.close(); pc2.close(); osc.stop();
    lfo.stop();
    try { ctx.close(); } catch {}
    el.remove();

    return { before, samples, ctxState };
  });

  // 1. Fallback path: no tap → null → simulation drives the mouth.
  expect(result.before).toBeNull();

  // 2. Live path: tap produced non-null amplitude readings…
  expect(result.samples.length).toBeGreaterThan(5);
  // …that are audio-driven: at least one clearly-open reading…
  expect(Math.max(...result.samples)).toBeGreaterThan(0.1);
  // …and CHANGING over time (modulated signal), not a constant.
  expect(Math.max(...result.samples) - Math.min(...result.samples)).toBeGreaterThan(0.05);
});
