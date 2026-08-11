/**
 * server/jac-voice-telemetry.ts
 *
 * In-memory rolling counter for JAC ConvAI voice session outcomes.
 * Records the last hour of VALIDATED telemetry events so the admin health
 * dashboard can show a success-rate gauge without a DB round-trip.
 *
 * Security model
 * ──────────────
 * Every event MUST carry the HMAC-signed voice token issued by
 * /api/jac/convai/session. The caller verifies the token before calling
 * recordVoiceEvent(); events without a valid, unexpired token are silently
 * dropped so a public caller cannot influence the admin gauge.
 *
 * Per-session deduplication (via `cid`)
 * ──────────────────────────────────────
 * Each voice session carries a stable conversation-id (`cid`) inside the
 * signed token. We accept at most ONE outcome event per cid:
 *   • "connect"    → success (first outcome wins)
 *   • "error"      → failure (only if no connect seen for this cid)
 *   • "timeout"    → failure (only if no connect seen for this cid)
 *   • "disconnect" → neutral (not a success/failure signal, ignored for rate)
 *
 * Memory bounds
 * ─────────────
 * Events ring-capped at MAX_EVENTS. The cid-seen set is pruned whenever the
 * associated event falls outside the rolling window. Total footprint is
 * bounded to O(MAX_EVENTS) strings.
 *
 * Persistence
 * ───────────
 * The counter lives in process memory; it resets on server restart and may
 * differ across instances. The health check labels the metric "since last
 * restart / last 1 h". Durable persistence is handled separately.
 */

const WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const MAX_EVENTS = 1_000;

interface VoiceEvent {
  ts:    number;
  event: string;
  cid:   string;
}

const _events: VoiceEvent[] = [];
/** Tracks which cids have already contributed an outcome to the counter. */
const _seenCids = new Set<string>();

/**
 * Record one telemetry event.
 *
 * @param event   Sanitised event name from the telemetry handler
 *                ("connect" | "error" | "timeout" | "disconnect").
 * @param cid     Conversation-id extracted from the VERIFIED voice token.
 *
 * Returns true if the event was accepted into the counter, false if it was
 * a duplicate cid (already counted) or a neutral "disconnect".
 */
export function recordVoiceEvent(event: string, cid: string): boolean {
  // Neutral events don't contribute to the success/failure count.
  if (event === "disconnect") {
    // Still record for disconnect count, but don't affect success rate.
    _events.push({ ts: Date.now(), event, cid });
    if (_events.length > MAX_EVENTS) _events.splice(0, _events.length - MAX_EVENTS);
    return false;
  }

  // For outcome events (connect / error / timeout): only one per cid.
  if (_seenCids.has(cid)) return false;
  _seenCids.add(cid);

  _events.push({ ts: Date.now(), event, cid });
  if (_events.length > MAX_EVENTS) _events.splice(0, _events.length - MAX_EVENTS);
  return true;
}

export interface VoiceHealthStats {
  connects:    number;
  errors:      number;
  timeouts:    number;
  disconnects: number;
  /** Unique sessions that produced an outcome event in the window. */
  sessions:    number;
  /** 0–100, or -1 when no outcome sessions yet. */
  successRate: number;
  windowMs:    number;
  /** True if the counter has been running since server start < windowMs ago. */
  partialWindow: boolean;
}

const _startedAt = Date.now();

/** Returns rolling stats for the last `windowMs` milliseconds (default: 1 h). */
export function getVoiceHealthStats(windowMs = WINDOW_MS): VoiceHealthStats {
  const cutoff = Date.now() - windowMs;
  // Prune cid-seen set for cids whose events have all fallen out of the window.
  // (Lazy cleanup — remove cids whose latest event is expired.)
  const activeCids = new Set(_events.filter(e => e.ts >= cutoff).map(e => e.cid));
  _seenCids.forEach(cid => {
    if (!activeCids.has(cid)) _seenCids.delete(cid);
  });

  let connects = 0, errors = 0, timeouts = 0, disconnects = 0;
  for (const e of _events) {
    if (e.ts < cutoff) continue;
    if (e.event === "connect")         connects++;
    else if (e.event === "error")      errors++;
    else if (e.event === "timeout")    timeouts++;
    else if (e.event === "disconnect") disconnects++;
  }

  const sessions    = connects + errors + timeouts;
  const successRate = sessions === 0 ? -1 : Math.round((connects / sessions) * 100);
  const partialWindow = (_startedAt > cutoff);

  return { connects, errors, timeouts, disconnects, sessions, successRate, windowMs, partialWindow };
}
