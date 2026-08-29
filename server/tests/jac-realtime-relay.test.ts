import { beforeAll, describe, expect, it } from "vitest";
import { signJacVoiceToken, verifyJacVoiceToken } from "../jac-voice-token";
import {
  buildJacRealtimeSessionConfig,
  buildOpenAiRealtimeUrl,
  JAC_REALTIME_CLIENT_EVENT_TYPES,
  JAC_REALTIME_TOKEN_TTL_MS,
  JAC_REALTIME_VOICE,
  sanitizeJacRealtimeClientEvent,
} from "../jac-realtime-relay";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret-at-least-16-chars-long";
});

describe("JAC OpenAI Realtime relay security helpers", () => {
  it("adapts only HTTP(S) base URLs without carrying base query data", () => {
    expect(buildOpenAiRealtimeUrl("https://api.openai.com/v1?secret=no", "gpt-realtime"))
      .toBe("wss://api.openai.com/v1/realtime?model=gpt-realtime");
    expect(buildOpenAiRealtimeUrl("http://localhost:9999/openai/v1/"))
      .toBe("ws://localhost:9999/openai/v1/realtime?model=gpt-realtime");
    expect(() => buildOpenAiRealtimeUrl("file:///tmp/key")).toThrow(/HTTP/);
    expect(() => buildOpenAiRealtimeUrl("http://api.openai.com/v1")).toThrow(/HTTPS/);
    expect(() => buildOpenAiRealtimeUrl("https://user:pass@example.com/v1")).toThrow(/credentials/);
  });

  it("builds a speech-only pcm16 session with server VAD auto-response disabled", () => {
    const config: any = buildJacRealtimeSessionConfig();
    expect(config.session.type).toBe("realtime");
    expect(config.session.output_modalities).toEqual(["audio"]);
    expect(config.session.audio.output.voice).toBe(JAC_REALTIME_VOICE);
    expect(config.session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24_000 });
    expect(config.session.audio.output.format).toEqual({ type: "audio/pcm", rate: 24_000 });
    expect(config.session.audio.input.transcription).toEqual({ model: "gpt-4o-mini-transcribe" });
    expect(config.session.audio.input.turn_detection).toMatchObject({ type: "server_vad", create_response: false });
    expect(config.session.tools).toEqual([]);
    expect(config.session.tool_choice).toBe("none");
    expect(config.session.instructions).toContain("exact text");
  });

  it("has the narrow expected client event allowlist", () => {
    expect([...JAC_REALTIME_CLIENT_EVENT_TYPES].sort()).toEqual([
      "conversation.item.truncate",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
      "response.cancel",
      "response.create",
    ]);
    expect(sanitizeJacRealtimeClientEvent({ type: "session.update", session: {} })).toBeNull();
    expect(sanitizeJacRealtimeClientEvent({ type: "conversation.item.create" })).toBeNull();
    expect(sanitizeJacRealtimeClientEvent({ type: "function_call_output" })).toBeNull();
  });

  it("strips extra fields and locks response.create to exact-text audio", () => {
    expect(sanitizeJacRealtimeClientEvent({
      type: "input_audio_buffer.commit",
      tools: [{ name: "danger" }],
    })).toEqual({ type: "input_audio_buffer.commit" });

    const safe: any = sanitizeJacRealtimeClientEvent({
      type: "response.create",
      response: {
        instructions: "Your appointment is at noon.",
        voice: "verse",
        tools: [{ type: "function", name: "execute_action" }],
      },
    });
    expect(safe.response.conversation).toBe("none");
    expect(safe.response.output_modalities).toEqual(["audio"]);
    expect(safe.response.audio.output.voice).toBe(JAC_REALTIME_VOICE);
    expect(safe.response.tools).toEqual([]);
    expect(safe.response.instructions).toContain('"Your appointment is at noon."');
  });

  it("mints audience-bound, short-lived identity tokens", () => {
    const token = signJacVoiceToken({
      userId: 42,
      role: "user",
      platform: "web",
      aud: "openai-realtime",
      ttlMs: JAC_REALTIME_TOKEN_TTL_MS,
    });
    const payload = verifyJacVoiceToken(token)!;
    expect(payload.userId).toBe(42);
    expect(payload.aud).toBe("openai-realtime");
    expect(payload.exp - Date.now()).toBeLessThanOrEqual(JAC_REALTIME_TOKEN_TTL_MS);
  });
});