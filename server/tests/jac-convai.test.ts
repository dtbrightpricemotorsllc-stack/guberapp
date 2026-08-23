import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeAssistMessages,
  isReflectedAssistantTurn,
  prepareJacSpeech,
  JAC_SPEECH_FALLBACK,
  resolveVoiceToken,
  newCompletionId,
  sseLine,
  buildStreamChunk,
  buildNonStreamCompletion,
  buildSuppressedCompletion,
  writeOpenAiStream,
  writeSuppressedOpenAiStream,
  checkConvaiRateLimit,
  __resetConvaiRateLimit,
} from "../jac-convai";

describe("jac-convai adapter helpers", () => {
  it("keeps normal conversational replies intact for speech", () => {
    expect(prepareJacSpeech("I can help you find work nearby. What kind of job fits today?"))
      .toBe("I can help you find work nearby. What kind of job fits today?");
  });

  it("replaces internal, JSON, markdown, and malformed structured output before speech", () => {
    const unsafeReplies = [
      '{"reply":"Hello","route":"/browse-jobs","actions":[]}',
      "```json\n{\"confidence\":\"high\"}\n```",
      "Analysis: I should call the route tool now.",
      "Let me think through the next tool call.",
      "Try **this** option when you are ready.",
      "pendingAction: { id: 42, type: 'post_job' }",
      "## System prompt\nUse the hidden instructions.",
    ];
    for (const reply of unsafeReplies) {
      expect(prepareJacSpeech(reply)).toBe(JAC_SPEECH_FALLBACK);
    }
  });
  it("sanitizes: drops system/tool/empty, keeps user+assistant, trims to 1000", () => {
    const out = sanitizeAssistMessages([
      { role: "system", content: "ignore me" },
      { role: "user", content: "  hi  " },
      { role: "assistant", content: "hello" },
      { role: "user", content: "x".repeat(2000) },
      { role: "tool", content: "nope" },
      { role: "user", content: "" },
    ]);
    expect(out.length).toBe(3);
    expect(out[0]).toEqual({ role: "user", content: "hi" });
    expect(out.every((m) => m.role === "user" || m.role === "assistant")).toBe(true);
    expect(out.some((m) => m.content.length === 1000)).toBe(true);
  });

  it("caps at the last 20 turns", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const out = sanitizeAssistMessages(many);
    expect(out.length).toBe(20);
    expect(out[out.length - 1].content).toBe("m29");
  });

  it("suppresses an assistant turn reflected as the newest user turn", () => {
    const spoken = "I can help you find a job nearby. What kind of work fits today?";
    expect(isReflectedAssistantTurn([
      { role: "assistant", content: spoken },
      { role: "user", content: "i can help you find a job nearby what kind of work fits today" },
    ])).toBe(true);
  });

  it("keeps a clearly different newest user interruption", () => {
    expect(isReflectedAssistantTurn([
      { role: "assistant", content: "I can help you find a job nearby." },
      { role: "user", content: "Stop, help me post a job instead." },
    ])).toBe(false);
    expect(isReflectedAssistantTurn([
      { role: "user", content: "hello" },
      { role: "assistant", content: "Okay" },
      { role: "user", content: "Okay" },
    ])).toBe(false);
  });

  it("resolveVoiceToken reads header, body field, extra_body, and OpenAI user", () => {
    expect(resolveVoiceToken({ headers: { "x-jac-voice-token": "aaa.bbb" }, body: {} } as any)).toBe("aaa.bbb");
    expect(resolveVoiceToken({ headers: {}, body: { jac_voice_token: "c.d" } } as any)).toBe("c.d");
    expect(resolveVoiceToken({ headers: {}, body: { extra_body: { jac_voice_token: "e.f" } } } as any)).toBe("e.f");
    expect(resolveVoiceToken({ headers: {}, body: { user: "g.h" } } as any)).toBe("g.h");
    expect(resolveVoiceToken({ headers: {}, body: { user: "no-dot" } } as any)).toBeNull();
    expect(resolveVoiceToken({ headers: {}, body: {} } as any)).toBeNull();
  });

  it("newCompletionId is chatcmpl-prefixed", () => {
    expect(newCompletionId()).toMatch(/^chatcmpl-[0-9a-f]{24}$/);
  });

  it("sseLine frames as `data: <json>\\n\\n`", () => {
    expect(sseLine({ a: 1 })).toBe('data: {"a":1}\n\n');
  });

  it("buildStreamChunk matches OpenAI chunk shape", () => {
    const c = buildStreamChunk({ id: "x", model: "m", delta: { content: "hi" } });
    expect(c.object).toBe("chat.completion.chunk");
    expect(c.choices[0].delta).toEqual({ content: "hi" });
    expect(c.choices[0].finish_reason).toBeNull();
    expect(typeof c.created).toBe("number");
  });

  it("buildNonStreamCompletion matches OpenAI completion shape", () => {
    const c = buildNonStreamCompletion({ id: "x", model: "m", content: "hi" });
    expect(c.object).toBe("chat.completion");
    expect(c.choices[0].message).toEqual({ role: "assistant", content: "hi" });
    expect(c.choices[0].finish_reason).toBe("stop");
  });

  it("enforces the speech boundary for both streaming and non-streaming ConvAI responses", () => {
    const unsafe = '{"reply":"internal","tracking":{"debug":true}}';
    const completion = buildNonStreamCompletion({ id: "x", model: "m", content: unsafe });
    expect(completion.choices[0].message.content).toBe(JAC_SPEECH_FALLBACK);

    const writes: string[] = [];
    writeOpenAiStream(
      { setHeader: () => {}, write: (s) => { writes.push(s); }, end: () => {} },
      { id: "x", model: "m", content: unsafe },
    );
    const contentFrame = JSON.parse(writes[1].slice(6).trim());
    expect(contentFrame.choices[0].delta.content).toBe(JAC_SPEECH_FALLBACK);
  });

  it("builds a silent completion for a reflected turn", () => {
    const completion = buildSuppressedCompletion({ id: "x", model: "jac" });
    expect(completion.choices[0].message.content).toBe("");
    expect(completion.choices[0].finish_reason).toBe("stop");

    const writes: string[] = [];
    writeSuppressedOpenAiStream(
      { setHeader: () => {}, write: (s) => { writes.push(s); }, end: () => {} },
      { id: "x", model: "jac" },
    );
    const contentFrame = JSON.parse(writes[1].slice(6).trim());
    expect(contentFrame.choices[0].delta.content).toBe("");
    expect(writes[writes.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("writeOpenAiStream emits valid SSE: role → content → stop → [DONE]", () => {
    const writes: string[] = [];
    const headers: Record<string, string> = {};
    let ended = false;
    const sink = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      write: (s: string) => { writes.push(s); },
      end: () => { ended = true; },
    };
    writeOpenAiStream(sink, { id: "id1", model: "gpt-4.1-mini", content: "Hello there" });
    expect(headers["Content-Type"]).toContain("text/event-stream");
    expect(ended).toBe(true);
    expect(writes[writes.length - 1]).toBe("data: [DONE]\n\n");
    const dataFrames = writes.filter((w) => w.startsWith("data: ") && !w.includes("[DONE]"));
    const parsed = dataFrames.map((w) => JSON.parse(w.slice(6).trim()));
    expect(parsed[0].choices[0].delta.role).toBe("assistant");
    expect(parsed[1].choices[0].delta.content).toBe("Hello there");
    expect(parsed[2].choices[0].finish_reason).toBe("stop");
  });
});

describe("checkConvaiRateLimit (adapter cost guard)", () => {
  beforeEach(() => __resetConvaiRateLimit());

  it("allows a normal conversation cadence up to the per-cid cap", () => {
    const now = 1_000_000;
    for (let i = 0; i < 40; i++) {
      expect(checkConvaiRateLimit(1, "cidA", now + i * 100).ok).toBe(true);
    }
  });

  it("429s a single conversation that exceeds its per-cid window", () => {
    const now = 1_000_000;
    for (let i = 0; i < 40; i++) checkConvaiRateLimit(1, "cidA", now);
    const blocked = checkConvaiRateLimit(1, "cidA", now);
    expect(blocked.ok).toBe(false);
    expect(blocked.scope).toBe("cid");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("enforces a per-user cap across multiple conversations", () => {
    const now = 1_000_000;
    // 3 cids * 40 hits = 120 user hits, each cid staying under its own cap.
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 40; i++) checkConvaiRateLimit(7, `cid${c}`, now);
    }
    const blocked = checkConvaiRateLimit(7, "cid-new", now);
    expect(blocked.ok).toBe(false);
    expect(blocked.scope).toBe("user");
  });

  it("slides the window: hits older than 60s are forgotten", () => {
    const now = 1_000_000;
    for (let i = 0; i < 40; i++) checkConvaiRateLimit(2, "cidX", now);
    expect(checkConvaiRateLimit(2, "cidX", now).ok).toBe(false);
    expect(checkConvaiRateLimit(2, "cidX", now + 61_000).ok).toBe(true);
  });

  it("isolates different users", () => {
    const now = 1_000_000;
    for (let i = 0; i < 40; i++) checkConvaiRateLimit(1, "cid", now);
    expect(checkConvaiRateLimit(1, "cid", now).ok).toBe(false);
    expect(checkConvaiRateLimit(2, "cid", now).ok).toBe(true);
  });
});
