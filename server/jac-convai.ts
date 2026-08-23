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
export const JAC_SPEECH_FALLBACK = "I’m here with you. What would you like to do next?";

const SPEECH_METADATA_PATTERN =
  /\b(?:route|actions?|options?|tracking|confidence|pending[_\s-]?action|guest[_\s-]?draft|feedback[_\s-]?draft|proposed[_\s-]?action|tool[_\s-]?(?:call|result|routing)|system[_\s-]?(?:prompt|message|instruction)|debug|trace|stack|internal(?:\s+(?:note|thought|reasoning|analysis|instruction))?|analysis|reasoning|assistant\s+to)\b\s*[:=]/i;
const SPEECH_TECHNICAL_PATTERN =
  /```|`[^`]+`|\*\*|__|!\?*\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|(?:^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s+|\d+[.)]\s)|\b(?:console\.(?:log|warn|error)|json\.parse|function\s*\(|undefined|null)\b/i;
const STRUCTURED_REPLY_PATTERN =
  /^\s*[\[{]|[\]}]\s*$|["'](?:reply|route|actions?|tracking|confidence|pendingAction|guestDraft)["']\s*:/i;
const SPEECH_THINKING_OR_TOOL_PATTERN =
  /\b(?:let me think|i(?:'m| am)? thinking|i should|my plan is|i need to (?:call|use|route|run)|i(?:'ll| will) (?:call|use|route|run) (?:the\s+)?(?:\w+\s+)?tool|(?:calling|using|running)\s+(?:the\s+)?(?:\w+\s+)?tool|system prompt|hidden instruction)\b/i;
const MAX_SPOKEN_REPLY_LENGTH = 900;

/**
 * The authoritative boundary for every piece of text sent to ElevenLabs as JAC
 * speech. UI/action metadata intentionally stays outside this function: it may
 * exist in a structured assistant response, but it is never safe to vocalize.
 */
export function prepareJacSpeech(candidate: unknown): string {
  if (typeof candidate !== "string") return JAC_SPEECH_FALLBACK;

  const text = candidate
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    text.length < 2 ||
    text.length > MAX_SPOKEN_REPLY_LENGTH ||
    SPEECH_METADATA_PATTERN.test(text) ||
    SPEECH_TECHNICAL_PATTERN.test(text) ||
    SPEECH_THINKING_OR_TOOL_PATTERN.test(text) ||
    STRUCTURED_REPLY_PATTERN.test(text)
  ) {
    return JAC_SPEECH_FALLBACK;
  }

  return text;
}

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

const REFLECTED_TURN_WINDOW_CHARS = 16;

function normalizeConvaiTurn(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Detect the phone replaying JAC's last spoken turn into the microphone.
 * ElevenLabs sends the complete conversation to this adapter, so only an
 * immediately repeated newest user turn is suppressed. A different newest
 * user turn remains a valid barge-in.
 */
export function isReflectedAssistantTurn(messages: ConvaiMessage[]): boolean {
  if (messages.length < 2) return false;
  const user = messages[messages.length - 1];
  const assistant = messages[messages.length - 2];
  if (user.role !== "user" || assistant.role !== "assistant") return false;

  const normalizedUser = normalizeConvaiTurn(user.content);
  const normalizedAssistant = normalizeConvaiTurn(assistant.content);
  if (
    normalizedUser.length < REFLECTED_TURN_WINDOW_CHARS ||
    normalizedAssistant.length < REFLECTED_TURN_WINDOW_CHARS
  ) {
    return false;
  }
  return normalizedUser === normalizedAssistant
    || normalizedAssistant.includes(normalizedUser)
    || normalizedUser.includes(normalizedAssistant);
}

/**
 * The per-conversation identity token may arrive as a header (preferred) or,
 * because some ElevenLabs config surfaces only allow body fields, inside the
 * request body. We never trust it for identity until verifyJacVoiceToken()
 * validates the HMAC — this only *locates* the candidate string.
 *
 * ElevenLabs forwards SECRET dynamic variables with their full name (including
 * the `secret__` prefix). We check both `secret__jac_voice_token` and the
 * shorter `jac_voice_token` form to handle all ElevenLabs forwarding modes.
 */
export function resolveVoiceToken(req: Request): string | null {
  // Header forms
  for (const hName of ["x-jac-voice-token", "x-secret-jac-voice-token"]) {
    const h = req.headers[hName];
    if (typeof h === "string" && h) return h;
  }

  const body: any = req.body ?? {};

  // Direct body fields — both name variants
  for (const key of ["jac_voice_token", "secret__jac_voice_token"]) {
    if (typeof body[key] === "string" && body[key]) return body[key];
  }

  // extra_body passthrough (some ElevenLabs custom-LLM configs)
  if (body.extra_body && typeof body.extra_body === "object") {
    for (const key of ["jac_voice_token", "secret__jac_voice_token"]) {
      if (typeof body.extra_body[key] === "string" && body.extra_body[key]) {
        return body.extra_body[key];
      }
    }
  }

  // OpenAI's `user` field — ElevenLabs can populate this with dynamic vars.
  // Our token is base64url.base64url so it always contains ".".
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
  const content = prepareJacSpeech(input.content);
  return {
    id: input.id,
    object: "chat.completion" as const,
    created: input.created ?? Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content },
        finish_reason: "stop" as const,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/** OpenAI-compatible empty completion used to tell ElevenLabs not to speak. */
export function buildSuppressedCompletion(input: { id: string; model: string; created?: number }) {
  return {
    id: input.id,
    object: "chat.completion" as const,
    created: input.created ?? Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message: { role: "assistant" as const, content: "" },
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
  const content = prepareJacSpeech(input.content);
  res.write(sseLine(buildStreamChunk({ id, model, created, delta: { role: "assistant" } })));
  res.write(sseLine(buildStreamChunk({ id, model, created, delta: { content } })));
  res.write(sseLine(buildStreamChunk({ id, model, created, delta: {}, finishReason: "stop" })));
  res.write("data: [DONE]\n\n");
  res.end();
}

/** Emit a valid but silent completion for a reflected speaker turn. */
export function writeSuppressedOpenAiStream(
  res: SseSink,
  input: { id: string; model: string },
): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const created = Math.floor(Date.now() / 1000);
  res.write(sseLine(buildStreamChunk({ id: input.id, model: input.model, created, delta: { role: "assistant" } })));
  res.write(sseLine(buildStreamChunk({ id: input.id, model: input.model, created, delta: { content: "" } })));
  res.write(sseLine(buildStreamChunk({ id: input.id, model: input.model, created, delta: {}, finishReason: "stop" })));
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
