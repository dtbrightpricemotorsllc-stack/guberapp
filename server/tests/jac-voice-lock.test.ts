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

  it("keeps the canonical JAC surfaces on the signed ConvAI controller", () => {
    for (const relativePath of [
      "client/src/components/guber-door-splash.tsx",
      "client/src/components/jac/jac-live-experience.tsx",
      "client/src/components/jac-homepage.tsx",
    ]) {
      const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
      expect(source, relativePath).toContain("@elevenlabs/react");
      expect(source, relativePath).toContain("JacConvaiSession");
      expect(source, relativePath).not.toContain("JacOpenAIRealtimeSession");
    }
  });

  it("keeps the authenticated dashboard text-only without a competing provider", () => {
    const source = readFileSync(path.join(projectRoot, "client/src/components/guber-assistant.tsx"), "utf8");
    expect(source).toContain("DASHBOARD_INDEPENDENT_VOICE_ENABLED = false");
    expect(source).not.toContain("JacOpenAIRealtimeSession");
    expect(source).not.toContain("ConversationProvider");
  });

  it("keeps the August 23 signed-session payload free of client voice overrides", () => {
    const source = readFileSync(
      path.join(projectRoot, "client/src/components/jac/jac-convai-session.tsx"),
      "utf8",
    );
    expect(source).toContain("const params: Record<string, any> = { dynamicVariables: dynVars }");
    expect(source).not.toContain("createJacConvaiVoiceOverride");
  });

  it("keeps the custom OpenAI Realtime relay unregistered", () => {
    const routes = readFileSync(path.join(projectRoot, "server/routes.ts"), "utf8");
    expect(routes).not.toContain("registerJacRealtimeRelay");
    expect(routes).toContain('app.post("/api/jac/realtime-token/guest"');
    expect(routes).toContain("This legacy voice path is disabled.");
  });

  it("does not retain static-audio or browser-speech fallbacks in JAC TTS", () => {
    const ttsSource = readFileSync(path.join(projectRoot, "client/src/lib/jac-tts.ts"), "utf8");
    expect(ttsSource).not.toContain("/jac-audio/");
    expect(ttsSource).not.toContain("speechSynthesis.speak");
    expect(ttsSource).not.toContain("webSpeechFallback");
  });
});