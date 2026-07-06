/**
 * JAC ⇄ ElevenLabs Conversational AI — "custom LLM" adapter helpers.
 *
 * ElevenLabs' Conversational AI can be pointed at a custom, OpenAI-Chat-
 * Completions-compatible endpoint as its "LLM". We point it at JAC's OWN brain
 * (runGuberAssistBrain) so there is exactly one JAC across web + iOS + android
 * — same knowledge, memory, and behavior. ElevenLabs expects a *streaming*
 * (Server-Sent Events) response in OpenAI's chat.completion.chunk shape.
 *
 * These are pure, side-effect-free builders + a tiny writer so the SSE framing
 * can be unit-tested without booting Express or a real network socket.
 */
import type { Request } from "express";
import crypto from "crypto";

export interface ConvaiMessage {
  role: "user" | "assistant";
  content: string;
}

const ALLOWED_ROLES = new Set(["user", "assistant"]);

/**
 * Same sanitation rules as /api/ai/guber-assist: keep only user/assistant
 * turns, last 20, each trimmed to 1000 chars. ElevenLabs also sends a leading
 * "system" turn (its own prompt) — we drop it; JAC builds its own system prompt.
 */
export function sanitizeAssistMessages(messages: any[]): ConvaiMessage[] {
  const out: ConvaiMessage[] = [];
  if (!Array.isArray(messages)) return out;
  for (const msg of messages.slice(-20)) {
    if (!msg || typeof msg !== "object") continue;
    if (!ALLOWED_ROLES.has(msg.role)) continue;
    const content = typeof msg.content === "string" ? msg.content.slice(0, 1000).trim() : "";
    if (!content) continue;
    out.push({ role: msg.role, content });
  }
  return out;
}

/**
 * The per-conversation identity token may arrive as a header (preferred) or,
 * because some ElevenLabs config surfaces only allow body fields, inside the
 * request body. We never trust it for identity until verifyJacVoiceToken()
 * validates the HMAC — this only *locates* the candidate string.
 */
export function resolveVoiceToken(req: Request): string | null {
  const h = req.headers["x-jac-voice-token"];
  if (typeof h === "string" && h) return h;
  const body: any = req.body ?? {};
  if (typeof body.jac_voice_token === "string" && body.jac_voice_token) return body.jac_voice_token;
  if (body.extra_body && typeof body.extra_body.jac_voice_token === "string" && body.extra_body.jac_voice_token) {
    return body.extra_body.jac_voice_token;
  }
  // OpenAI's `user` field is a convenient passthrough ElevenLabs can populate.
  if (typeof body.user === "string" && body.user.includes(".")) return body.user;
  return null;
}

export function newCompletionId(): string {
  return "chatcmpl-" + crypto.randomBytes(12).toString("hex");
}

export function sseLine(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export interface StreamChunkInput {
  id: string;
  model: string;
  created?: number;
  delta: Record<string, unknown>;
  finishReason?: string | null;
}

export function buildStreamChunk(input: StreamChunkInput) {
  return {
    id: input.id,
    object: "chat.completion.chunk" as const,
    created: input.created ?? Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        delta: input.delta,
        finish_reason: input.finishReason ?? null,
      },
    ],
  };
}

export function buildNonStreamCompletion(input: { id: string; model: string; content: string; created?: number }) {
  return {
    id: input.id,
    object: "chat.completion" as const,
    created: input.created ?? Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: input.content },
        finish_reason: "stop" as const,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/** Minimal shape we need from a response object (real or mocked in tests). */
export interface SseSink {
  setHeader(name: string, value: string): void;
  write(chunk: string): void;
  end(): void;
}

/**
 * Emit a complete OpenAI-style SSE stream for a single, already-computed reply:
 *   role delta → content delta → stop chunk → [DONE]
 * JAC's brain is non-streaming, so we frame the finished reply as the stream
 * ElevenLabs expects. (Sentence-level chunking is a later latency optimization.)
 */
export function writeOpenAiStream(res: SseSink, input: { id: string; model: string; content: string }): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const created = Math.floor(Date.now() / 1000);
  const { id, model } = input;
  res.write(sseLine(buildStreamChunk({ id, model, created, delta: { role: "assistant" } })));
  res.write(sseLine(buildStreamChunk({ id, model, created, delta: { content: input.content } })));
  res.write(sseLine(buildStreamChunk({ id, model, created, delta: {}, finishReason: "stop" })));
  res.write("data: [DONE]\n\n");
  res.end();
}

/**
 * In-memory per-conversation + per-user rate limit for the custom-LLM adapter.
 *
 * A minted voice token lives in the browser for up to 2h, so a leaked token
 * could be replayed to burn OpenAI/ElevenLabs cost. We cap requests per
 * conversation id AND per user id in a sliding 60s window. This is a
 * single-process guard (fine for our single Autoscale instance today); if we
 * ever run multiple instances a shared store (e.g. Redis) would be required.
 */
export const RATE_WINDOW_MS = 60_000;
const RATE_CID_LIMIT = 40; // sustained ~1 utterance/sec per conversation is ample for speech
const RATE_USER_LIMIT = 120; // across all of a user's concurrent conversations

const cidHits = new Map<string, number[]>();
const userHits = new Map<string, number[]>();
let rateCallsSinceSweep = 0;

function pruneWindow(arr: number[], now: number): number[] {
  const cutoff = now - RATE_WINDOW_MS;
  let i = 0;
  while (i < arr.length && arr[i] <= cutoff) i++;
  return i > 0 ? arr.slice(i) : arr;
}

function sweepRateMaps(now: number): void {
  for (const [k, arr] of Array.from(cidHits.entries())) {
    const p = pruneWindow(arr, now);
    if (p.length === 0) cidHits.delete(k);
    else cidHits.set(k, p);
  }
  for (const [k, arr] of Array.from(userHits.entries())) {
    const p = pruneWindow(arr, now);
    if (p.length === 0) userHits.delete(k);
    else userHits.set(k, p);
  }
}

export interface ConvaiRateResult {
  ok: boolean;
  scope?: "cid" | "user";
  retryAfterMs?: number;
}

export function checkConvaiRateLimit(userId: number, cid: string, now: number = Date.now()): ConvaiRateResult {
  if (++rateCallsSinceSweep >= 500) {
    rateCallsSinceSweep = 0;
    sweepRateMaps(now);
  }
  const cidKey = `${userId}:${cid}`;
  const userKey = String(userId);
  const cidArr = pruneWindow(cidHits.get(cidKey) ?? [], now);
  const userArr = pruneWindow(userHits.get(userKey) ?? [], now);

  if (cidArr.length >= RATE_CID_LIMIT) {
    cidHits.set(cidKey, cidArr);
    return { ok: false, scope: "cid", retryAfterMs: RATE_WINDOW_MS - (now - cidArr[0]) };
  }
  if (userArr.length >= RATE_USER_LIMIT) {
    userHits.set(userKey, userArr);
    return { ok: false, scope: "user", retryAfterMs: RATE_WINDOW_MS - (now - userArr[0]) };
  }
  cidArr.push(now);
  userArr.push(now);
  cidHits.set(cidKey, cidArr);
  userHits.set(userKey, userArr);
  return { ok: true };
}

/** Test-only: clear the sliding windows between cases. */
export function __resetConvaiRateLimit(): void {
  cidHits.clear();
  userHits.clear();
  rateCallsSinceSweep = 0;
}
