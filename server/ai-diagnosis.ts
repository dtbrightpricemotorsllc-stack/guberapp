/**
 * server/ai-diagnosis.ts — Layer 4 of GUBER 24/7 Smart Monitoring.
 *
 * Strictly-gated AI escalation. JAC / D.D. is only ever woken for an issue that
 * ALREADY qualifies (see shouldDiagnose in system-issues.ts): a real critical,
 * a repeat, a multi-user incident, a blocked money/access failure, or an
 * explicit admin request. The model NEVER runs on every action, never on a
 * timer, and at most once per fingerprint.
 *
 * COST CONTROL (three independent guards):
 *   1. Callers only invoke this after shouldDiagnose() is true.
 *   2. Atomic claim — ai_diagnosed_at is stamped BEFORE the OpenAI call inside a
 *      conditional UPDATE, so a fingerprint is diagnosed at most once, ever
 *      (concurrent reports/probe sweeps can't double-fire).
 *   3. A global rolling hourly cap — even a storm of distinct new criticals can
 *      only wake the model a bounded number of times per hour.
 */
import { pool } from "./db";

export interface AiDiagnosis {
  whatBroke: string;
  whereBroke: string;
  whoAffected: string;
  likelyCause: string;
  suggestedFix: string;
  urgency: string;
}

// ── Global rolling hourly cap ─────────────────────────────────────────────────
const HOURLY_CAP = 5;
let windowStart = Date.now();
let callsThisWindow = 0;

function underHourlyCap(): boolean {
  const now = Date.now();
  if (now - windowStart > 3_600_000) {
    windowStart = now;
    callsThisWindow = 0;
  }
  return callsThisWindow < HOURLY_CAP;
}

/**
 * Diagnose a single issue with the LLM, storing the structured result on the row.
 * Fire-and-forget from the report handler + probe bridge (`void maybeDiagnoseIssue(id)`).
 *
 * @param opts.force  Admin-initiated re-diagnosis: clears the prior claim and
 *                    bypasses the hourly cap (human-driven, so bounded by hand).
 * @returns the diagnosis when one was produced (admin path uses this), else null.
 */
export async function maybeDiagnoseIssue(
  issueId: number,
  opts: { force?: boolean } = {},
): Promise<AiDiagnosis | null> {
  try {
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null; // no key → no cost, no crash

    // Admin force: drop the previous claim so the atomic claim below can re-run.
    if (opts.force) {
      await pool.query(`UPDATE system_issues SET ai_diagnosed_at = NULL WHERE id = $1`, [issueId]);
    } else if (!underHourlyCap()) {
      // Auto path only — leave ai_diagnosed_at NULL so a later report can retry
      // once the window frees up. Cost stays bounded.
      return null;
    }

    // Atomic claim: stamp the timestamp iff still unclaimed. Guarantees the
    // OpenAI call below happens at most once per fingerprint.
    const claim = await pool.query(
      `UPDATE system_issues
         SET ai_diagnosed_at = NOW()
       WHERE id = $1 AND ai_diagnosed_at IS NULL
       RETURNING id, module, route, platform, severity, blocked, error_message,
                 attempted_action, occurrence_count, source,
                 jsonb_array_length(COALESCE(affected_user_ids, '[]'::jsonb)) AS affected_count`,
      [issueId],
    );
    if (claim.rowCount === 0) return null; // already diagnosed or gone

    // We are committed to a model call — count it against the hourly budget.
    callsThisWindow++;
    const row = claim.rows[0];

    const diagnosis = await runDiagnosis(row);
    if (!diagnosis) return null; // claim stays set → no retry loop (cost-safe)

    await pool.query(
      `UPDATE system_issues
         SET ai_diagnosis = $2::jsonb,
             suggested_fix = COALESCE(suggested_fix, $3)
       WHERE id = $1`,
      [issueId, JSON.stringify(diagnosis), (diagnosis.suggestedFix || "").slice(0, 500) || null],
    );
    return diagnosis;
  } catch (e: any) {
    console.error(`[ai-diagnosis] issue ${issueId} failed:`, e?.message);
    return null;
  }
}

async function runDiagnosis(row: any): Promise<AiDiagnosis | null> {
  try {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const facts = [
      `Module: ${row.module}`,
      `Where: ${row.route || "(unknown route)"} on ${row.platform || "web"}`,
      `Severity: ${row.severity}${row.blocked ? " (blocking users)" : ""}`,
      `Occurrences: ${row.occurrence_count}`,
      `Distinct users affected: ${row.affected_count ?? 0}`,
      `Detected by: ${row.source === "health_probe" ? "scheduled health probe" : "user-facing error capture"}`,
      `Attempted action: ${row.attempted_action || "(n/a)"}`,
      `Error: ${row.error_message || "(no message captured)"}`,
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      max_completion_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are JAC, the GUBER platform's system guardian. You are given telemetry for a SINGLE " +
            "already-triaged production incident. Diagnose it concisely for an admin. Respond with a JSON " +
            "object with EXACTLY these string keys: whatBroke, whereBroke, whoAffected, likelyCause, " +
            "suggestedFix, urgency. Keep each value to one or two sentences. Base everything on the given " +
            "facts; if a fact is unknown, say so plainly rather than inventing detail. urgency must be one " +
            "of: low, medium, high, critical.",
        },
        { role: "user", content: `Incident telemetry:\n${facts}` },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      whatBroke: String(parsed.whatBroke ?? "").slice(0, 600),
      whereBroke: String(parsed.whereBroke ?? "").slice(0, 400),
      whoAffected: String(parsed.whoAffected ?? "").slice(0, 400),
      likelyCause: String(parsed.likelyCause ?? "").slice(0, 600),
      suggestedFix: String(parsed.suggestedFix ?? "").slice(0, 600),
      urgency: String(parsed.urgency ?? row.severity ?? "medium").slice(0, 40),
    };
  } catch (e: any) {
    console.error(`[ai-diagnosis] model call failed for issue ${row?.id}:`, e?.message);
    return null;
  }
}
