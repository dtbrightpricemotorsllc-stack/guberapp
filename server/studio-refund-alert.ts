// Studio refund/failure rate alert (task-556).
//
// Runs on the 5-minute cron cadence (internally rate-limited to fire at most
// once per throttle window). Queries `studio_generation_log` for the last
// 1 hour and alerts every admin (in-app + email) when the combined
// failure+refund rate crosses a configurable threshold with a minimum sample
// size. All tunables live in `platform_settings` so admins can adjust them
// without a deploy.
//
// Settings keys (all category "studio"):
//   studio_refund_alert_threshold_rate  — 0-1 fraction, default 0.5  (50 %)
//   studio_refund_alert_min_sample      — integer, default 5
//   studio_refund_alert_throttle_hours  — integer hours, default 4
//   studio_refund_alert_last_at         — ISO timestamp, managed automatically

import { db } from "./db.js";
import { platformSettings, auditLogs, users, notifications } from "../shared/schema.js";
import { sql, eq } from "drizzle-orm";

// ── Setting keys ────────────────────────────────────────────────────────────
const THRESHOLD_RATE_KEY   = "studio_refund_alert_threshold_rate";
const MIN_SAMPLE_KEY       = "studio_refund_alert_min_sample";
const THROTTLE_HOURS_KEY   = "studio_refund_alert_throttle_hours";
const LAST_AT_KEY          = "studio_refund_alert_last_at";

// ── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_THRESHOLD_RATE  = 0.5;   // 50 % of attempts failed/refunded
const DEFAULT_MIN_SAMPLE      = 5;     // must have at least 5 attempts in window
const DEFAULT_THROTTLE_HOURS  = 4;     // re-alert at most once every 4 hours

// ── Types ────────────────────────────────────────────────────────────────────
export interface RefundRateSample {
  windowHours: number;
  total:     number;
  succeeded: number;
  failed:    number;
  refunded:  number;
  rate:      number;  // (failed + refunded) / total — 0 when total === 0
}

export interface RefundAlertDecision {
  send:            boolean;
  reason:          "below_threshold" | "below_min_sample" | "throttled" | "first_alert" | "within_window";
  thresholdRate:   number;
  minSample:       number;
  throttleHours:   number;
}

// ── Pure decision function (exported for unit tests) ─────────────────────────
export function evaluateRefundAlertNeed(opts: {
  sample:        RefundRateSample;
  thresholdRate: number;
  minSample:     number;
  throttleHours: number;
  lastAlertAt:   Date | null;
  now?:          Date;
}): RefundAlertDecision {
  const base = {
    thresholdRate: opts.thresholdRate,
    minSample:     opts.minSample,
    throttleHours: opts.throttleHours,
  };

  if (opts.sample.total < opts.minSample) {
    return { send: false, reason: "below_min_sample", ...base };
  }
  if (opts.sample.rate < opts.thresholdRate) {
    return { send: false, reason: "below_threshold", ...base };
  }

  // Rate is over threshold — check throttle.
  if (!opts.lastAlertAt) {
    return { send: true, reason: "first_alert", ...base };
  }
  const now = opts.now ?? new Date();
  const ageMs = now.getTime() - opts.lastAlertAt.getTime();
  if (ageMs >= opts.throttleHours * 60 * 60 * 1000) {
    return { send: true, reason: "within_window", ...base };
  }
  return { send: false, reason: "throttled", ...base };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function readSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
    return rows.length ? String(rows[0].value) : null;
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: string, description: string): Promise<void> {
  try {
    await db
      .insert(platformSettings)
      .values({ key, value, category: "studio", description })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedAt: new Date() },
      });
  } catch {}
}

function readNumberSetting(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Rate must stay in [0, 1]; values outside that range are silently replaced
// with the fallback so a misconfigured setting can't suppress all alerts (>1)
// or fire constantly (<0).
function readRateSetting(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

// Throttle must be at least 1 hour so a setting of "0" can't flood admins.
const MIN_THROTTLE_HOURS = 1;
function readThrottleSetting(raw: string | null, fallback: number): number {
  const n = readNumberSetting(raw, fallback);
  return Math.max(n, MIN_THROTTLE_HOURS);
}

// ── Core query ────────────────────────────────────────────────────────────────
export async function sampleRefundRate(windowHours = 1): Promise<RefundRateSample> {
  const r = await db.execute(sql`
    SELECT
      status,
      COUNT(*)::int AS n
    FROM studio_generation_log
    WHERE created_at >= NOW() - (${windowHours} || ' hours')::interval
    GROUP BY status
  `);
  const counts: Record<string, number> = {};
  for (const row of (r as any).rows as any[]) {
    counts[String(row.status)] = Number(row.n) || 0;
  }
  const succeeded = counts["succeeded"] ?? 0;
  const failed    = counts["failed"]    ?? 0;
  const refunded  = counts["refunded"]  ?? 0;
  const total     = succeeded + failed + refunded;
  const rate      = total === 0 ? 0 : (failed + refunded) / total;
  return { windowHours, total, succeeded, failed, refunded, rate };
}

// ── Alert dispatch ────────────────────────────────────────────────────────────
function buildAlertSubject(sample: RefundRateSample, decision: RefundAlertDecision): string {
  const pct = (sample.rate * 100).toFixed(1);
  return `[GUBER] Studio refund/failure spike: ${pct}% over last ${sample.windowHours}h`;
}

function buildAlertBody(
  sample: RefundRateSample,
  decision: RefundAlertDecision,
): { text: string; html: string } {
  const pct        = (sample.rate * 100).toFixed(1);
  const threshold  = (decision.thresholdRate * 100).toFixed(0);

  const text = [
    `Window: last ${sample.windowHours} hour(s)`,
    `Total attempts: ${sample.total} (threshold min sample: ${decision.minSample})`,
    `Succeeded: ${sample.succeeded}  Failed: ${sample.failed}  Refunded: ${sample.refunded}`,
    `Failure+refund rate: ${pct}% (alert threshold: ${threshold}%)`,
    ``,
    `Review the Studio Usage tab at /admin/qa for per-tool breakdown.`,
    ``,
    `Tune thresholds via platform_settings:`,
    `  ${THRESHOLD_RATE_KEY}  (current: ${decision.thresholdRate})`,
    `  ${MIN_SAMPLE_KEY}      (current: ${decision.minSample})`,
    `  ${THROTTLE_HOURS_KEY}  (current: ${decision.throttleHours}h)`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:14px;">
      <h1 style="font-size:22px;font-weight:800;color:#f87171;margin:0 0 4px;">GUBER Studio Refund/Failure Alert</h1>
      <p style="font-size:11px;color:#888;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 20px;">last ${sample.windowHours} hour window</p>
      <p style="color:#ccc;line-height:1.6;margin:0 0 16px;">
        The combined failure+refund rate is
        <strong style="color:#f87171;font-size:20px;">${pct}%</strong>
        (threshold: <strong style="color:#fff;">${threshold}%</strong>).
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#ccc;margin-bottom:20px;">
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #222;">Total attempts</td>
          <td style="padding:6px 12px;border-bottom:1px solid #222;text-align:right;color:#fff;">${sample.total}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #222;">Succeeded</td>
          <td style="padding:6px 12px;border-bottom:1px solid #222;text-align:right;color:#22c55e;">${sample.succeeded}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;border-bottom:1px solid #222;">Failed</td>
          <td style="padding:6px 12px;border-bottom:1px solid #222;text-align:right;color:#f87171;">${sample.failed}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;">Refunded</td>
          <td style="padding:6px 12px;text-align:right;color:#fbbf24;">${sample.refunded}</td>
        </tr>
      </table>
      <a href="/admin/qa" style="display:inline-block;background:#f87171;color:#000;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;">Open Studio Usage tab</a>
      <p style="color:#555;font-size:12px;margin:20px 0 0;">
        Tune: <code>${THRESHOLD_RATE_KEY}</code>, <code>${MIN_SAMPLE_KEY}</code>, <code>${THROTTLE_HOURS_KEY}</code>
        in <code>platform_settings</code>.
      </p>
    </div>`;

  return { text, html };
}

async function sendRefundAlert(
  sample:   RefundRateSample,
  decision: RefundAlertDecision,
): Promise<{ notified: number; emailed: boolean; emailError?: string }> {
  const subject = buildAlertSubject(sample, decision);
  const { text, html } = buildAlertBody(sample, decision);
  let notified = 0;

  try {
    const admins = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "admin"));
    if (admins.length) {
      const pct = (sample.rate * 100).toFixed(1);
      await db.insert(notifications).values(
        admins.map((a) => ({
          userId:   a.id,
          type:     "admin_alert",
          title:    subject.replace(/^\[GUBER\]\s*/, ""),
          body:     `${pct}% failure+refund rate over last ${sample.windowHours}h (${sample.failed} failed, ${sample.refunded} refunded / ${sample.total} total). Open /admin/qa → Studio Usage.`,
          ctaUrl:   "/admin/qa",
          ctaLabel: "Open Studio Usage",
        })),
      );
      notified = admins.length;

      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const recipients = admins.map((a) => a.email).filter((e): e is string => !!e);
        if (recipients.length) {
          try {
            const { Resend } = await import("resend");
            const resend = new Resend(resendKey);
            const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
            const { error } = await resend.emails.send({
              from:    `GUBER <noreply@${fromDomain}>`,
              to:      recipients,
              subject,
              text,
              html,
            });
            if (error) return { notified, emailed: false, emailError: String((error as any).message || error).slice(0, 300) };
            return { notified, emailed: true };
          } catch (e: any) {
            return { notified, emailed: false, emailError: String(e?.message || e).slice(0, 300) };
          }
        }
      }
    }
  } catch (e: any) {
    return { notified, emailed: false, emailError: String(e?.message || e).slice(0, 300) };
  }
  return { notified, emailed: false };
}

// ── Public entry point (called by cron) ───────────────────────────────────────
export async function maybeCheckStudioRefundRate(): Promise<{
  checked:   boolean;
  sent:      boolean;
  reason:    RefundAlertDecision["reason"];
  sample?:   RefundRateSample;
  notified?: number;
  emailed?:  boolean;
  emailError?: string;
}> {
  try {
    const [thresholdRaw, minSampleRaw, throttleRaw, lastAtRaw] = await Promise.all([
      readSetting(THRESHOLD_RATE_KEY),
      readSetting(MIN_SAMPLE_KEY),
      readSetting(THROTTLE_HOURS_KEY),
      readSetting(LAST_AT_KEY),
    ]);

    const thresholdRate = readRateSetting(thresholdRaw,    DEFAULT_THRESHOLD_RATE);
    const minSample     = readNumberSetting(minSampleRaw,  DEFAULT_MIN_SAMPLE);
    const throttleHours = readThrottleSetting(throttleRaw, DEFAULT_THROTTLE_HOURS);
    const lastAtMs      = lastAtRaw ? Date.parse(lastAtRaw) : NaN;
    const lastAlertAt   = Number.isFinite(lastAtMs) ? new Date(lastAtMs) : null;

    const sample   = await sampleRefundRate(1);
    const decision = evaluateRefundAlertNeed({ sample, thresholdRate, minSample, throttleHours, lastAlertAt });

    if (!decision.send) {
      return { checked: true, sent: false, reason: decision.reason, sample };
    }

    const dispatch = await sendRefundAlert(sample, decision);

    await writeSetting(LAST_AT_KEY, new Date().toISOString(), "Last studio refund-rate alert dispatched (ISO)");

    try {
      await db.insert(auditLogs).values({
        userId:  null,
        action:  "studio_refund_alert",
        details: JSON.stringify({
          reason:        decision.reason,
          windowHours:   sample.windowHours,
          total:         sample.total,
          succeeded:     sample.succeeded,
          failed:        sample.failed,
          refunded:      sample.refunded,
          rate:          sample.rate,
          thresholdRate: decision.thresholdRate,
          minSample:     decision.minSample,
          throttleHours: decision.throttleHours,
          notified:      dispatch.notified,
          emailed:       dispatch.emailed,
          emailError:    dispatch.emailError,
        }).slice(0, 4000),
      });
    } catch {}

    console.log(
      `[studio-refund-alert] alert sent reason=${decision.reason} rate=${(sample.rate * 100).toFixed(1)}% ` +
      `(${sample.failed}f+${sample.refunded}r/${sample.total}) notified=${dispatch.notified} emailed=${dispatch.emailed}` +
      (dispatch.emailError ? ` emailError=${dispatch.emailError}` : ""),
    );

    return { checked: true, sent: true, reason: decision.reason, sample, ...dispatch };
  } catch (err: any) {
    console.error("[studio-refund-alert] check failed:", err?.message || err);
    return { checked: false, sent: false, reason: "throttled" };
  }
}
