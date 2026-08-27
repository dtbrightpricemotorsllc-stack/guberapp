import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { JAC_ELEVENLABS_VOICE_ID, synthesizeSpeech } from "../elevenlabs";

const projectRoot = process.cwd();
const originalApiKey = process.env.ELEVENLABS_API_KEY;
const originalVoiceOverride = process.env.JAC_ELEVENLABS_VOICE_ID;

describe("JAC ElevenLabs voice lock", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.JAC_ELEVENLABS_VOICE_ID = "an-unapproved-voice";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalApiKey;
    if (originalVoiceOverride === undefined) delete process.env.JAC_ELEVENLABS_VOICE_ID;
    else process.env.JAC_ELEVENLABS_VOICE_ID = originalVoiceOverride;
  });

  it("uses the approved voice even when an old environment override is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("audio", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await synthesizeSpeech("Welcome to Team Guber.", {
      modelId: "test-model",
      stream: false,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/text-to-speech/${JAC_ELEVENLABS_VOICE_ID}`);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("an-unapproved-voice");
  });

  it("keeps every ConvAI controller on the shared TTS override", () => {
    for (const relativePath of [
      "client/src/components/jac/jac-convai-session.tsx",
      "client/src/components/jac/jac-convai-voice.tsx",
      "client/src/components/jac/jac-live-experience.tsx",
    ]) {
      const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(source, relativePath).toContain("overrides: createJacConvaiVoiceOverride()");
    }
  });

  it("does not retain static-audio or browser-speech fallbacks in JAC TTS", () => {
    const ttsSource = readFileSync(path.join(projectRoot, "client/src/lib/jac-tts.ts"), "utf8");
    expect(ttsSource).not.toContain("/jac-audio/");
    expect(ttsSource).not.toContain("speechSynthesis.speak");
    expect(ttsSource).not.toContain("webSpeechFallback");
  });
});