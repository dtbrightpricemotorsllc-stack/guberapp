/**
 * System Issues — JAC System Guardian telemetry.
 *
 * Captures rich end-to-end failure reports across web / iOS / Android, dedupes
 * them by fingerprint, and exposes read helpers for the admin dashboard and
 * JAC's admin-monitoring answers.
 *
 * SECURITY: severity is ALWAYS classified server-side. The public report
 * endpoint never trusts a client-declared severity — otherwise anyone could
 * spam "critical" and trigger founder alerts.
 */
import { pool } from "./db";
import { createHash } from "crypto";

export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "ack" | "resolved";

// Modules we recognize. Anything else collapses to "general".
const KNOWN_MODULES = new Set([
  "payment", "wallet", "login", "signup", "upload", "gps", "map", "studio",
  "network", "client", "job", "marketplace", "verify_inspect", "load_board",
  "push", "profile", "voice", "general",
]);

// Money / access flows — a failure here that blocks the user is CRITICAL.
const CRITICAL_MODULES = new Set(["payment", "wallet", "login"]);
// Core task flows — elevated even when not explicitly blocking.
const HIGH_MODULES = new Set(["gps", "upload", "job", "verify_inspect", "load_board", "map", "studio"]);
// Money- or access-critical modules. A BLOCKED failure here is a valid AI-diagnosis
// trigger even before it repeats or spreads (Layer 4 gating).
const DIAGNOSE_MODULES = new Set(["payment", "wallet", "login", "signup", "gps", "map", "job"]);

const SEV_RANK: Record<IssueSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function normalizeModule(module: string): string {
  const m = (module || "general").toLowerCase().trim();
  return KNOWN_MODULES.has(m) ? m : "general";
}

/** Strip volatile tokens (ids, hex, long numbers) so repeats collapse to one fingerprint. */
export function normalizeIssueText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "#")
    .replace(/\b\d{3,}\b/g, "#")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function makeFingerprint(module: string, errorMessage: string, route: string, platform: string): string {
  const basis = [module, normalizeIssueText(errorMessage), route || "", platform || ""].join("|");
  return createHash("md5").update(basis).digest("hex");
}

/**
 * SERVER-SIDE severity classification. Never trust the client.
 * blocked + money/access module = critical; money/access alone = high;
 * crash/white-screen signals escalate; core task modules are medium/high.
 */
export function classifySeverity(input: { module: string; blocked?: boolean; errorMessage?: string }): IssueSeverity {
  const module = normalizeModule(input.module);
  const err = (input.errorMessage || "").toLowerCase();
  const blocked = !!input.blocked;

  if (CRITICAL_MODULES.has(module) && blocked) return "critical";
  if (/white ?screen|app crash|unhandled rejection|chunkloaderror|failed to fetch dynamically|maximum call stack/.test(err)) {
    return blocked ? "critical" : "high";
  }
  if (CRITICAL_MODULES.has(module)) return "high";
  if (HIGH_MODULES.has(module)) return blocked ? "high" : "medium";
  if (blocked) return "high";
  return "medium";
}

export interface ReportIssueInput {
  userId?: number | null;
  platform?: string;
  device?: string;
  appVersion?: string;
  route?: string;
  module: string;
  attemptedAction?: string;
  errorMessage?: string;
  relatedIds?: Record<string, string | number>;
  blocked?: boolean;
  steps?: string[];
  screenshotUrl?: string | null;
  gpsPermission?: string;
  /** Origin of the report. Defaults to "user_event". Scheduled health probes
   *  pass "health_probe" so the dashboard + self-heal can distinguish them. */
  source?: "user_event" | "health_probe";
  /** Static remediation hint stored alongside the issue (self-healing prep). */
  suggestedFix?: string | null;
  /**
   * SECURITY-SENSITIVE — server callers ONLY. Raises the classified severity to
   * at least this level. Used by scheduled health probes (a DB outage must be
   * critical even though the module classifier alone wouldn't say so). This must
   * NEVER be wired to the public /api/issues/report endpoint — severity there is
   * always classified server-side so clients can't spam "critical".
   */
  severityFloor?: IssueSeverity;
}

export interface ReportIssueResult {
  id: number;
  fingerprint: string;
  severity: IssueSeverity;
  occurrenceCount: number;
  isNew: boolean;
  /** Severity BEFORE this report merged in (null on first insert). Lets callers
   *  detect an upgrade-to-critical on a deduped fingerprint. */
  oldSeverity: IssueSeverity | null;
  /** Distinct affected users after this report merged in (capped at 50). */
  distinctUsers: number;
  /** True when a previously-resolved fingerprint was re-opened by this report.
   *  Callers re-escalate on this transition so a recurring outage re-alerts. */
  reopened: boolean;
  module: string;
  blocked: boolean;
}

/**
 * Layer-4 AI-diagnosis gate. Returns true ONLY for issues worth spending an
 * OpenAI call on: criticals, repeats, multi-user incidents, or a blocked
 * failure in a money/access-critical module. Everything else stays cost-free.
 */
export function shouldDiagnose(i: {
  severity: IssueSeverity;
  occurrenceCount: number;
  distinctUsers: number;
  module: string;
  blocked?: boolean;
}): boolean {
  if (i.severity === "critical") return true;
  if ((i.occurrenceCount ?? 0) >= 5) return true;
  if ((i.distinctUsers ?? 0) >= 3) return true;
  if (DIAGNOSE_MODULES.has(normalizeModule(i.module)) && !!i.blocked) return true;
  return false;
}

/** Upsert an issue keyed by fingerprint. Repeats bump occurrence_count + last_seen. */
export async function reportIssue(input: ReportIssueInput): Promise<ReportIssueResult> {
  const module = normalizeModule(input.module);
  const platform = (input.platform || "web").toLowerCase().slice(0, 20);
  const route = (input.route || "").slice(0, 300);
  const errorMessage = (input.errorMessage || "").slice(0, 1000);
  // Server-side classification, then apply the (server-only) severity floor.
  let severity = classifySeverity({ module, blocked: input.blocked, errorMessage });
  if (input.severityFloor && SEV_RANK[input.severityFloor] > SEV_RANK[severity]) {
    severity = input.severityFloor;
  }
  const fingerprint = makeFingerprint(module, errorMessage, route, platform);
  const source = input.source === "health_probe" ? "health_probe" : "user_event";

  // CTE captures the pre-upsert severity + status (`prev`) under the same
  // snapshot so callers can distinguish a brand-new critical from an
  // upgrade-to-critical, and a resolved→open reopen, on a deduped fingerprint.
  // Severity is MONOTONIC (worst-ever): it never downgrades, so a later
  // non-blocking re-fire can't mask an earlier critical or cause flapping.
  // affected_user_ids accumulates distinct user_ids (capped at 50) so the
  // dashboard + AI gate can tell single-user glitches from platform-wide ones.
  const r = await pool.query(
    `WITH prev AS (
       SELECT severity AS old_severity, status AS old_status FROM system_issues WHERE fingerprint = $1
     ),
     up AS (
       INSERT INTO system_issues
        (fingerprint, user_id, platform, device, app_version, route, module,
         attempted_action, error_message, related_ids, severity, blocked, steps,
         screenshot_url, gps_permission, source, suggested_fix, affected_user_ids,
         occurrence_count, first_seen, last_seen, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
         CASE WHEN $2::int IS NULL THEN '[]'::jsonb ELSE jsonb_build_array($2::int) END,
         1,NOW(),NOW(),'open')
       ON CONFLICT (fingerprint) DO UPDATE SET
         occurrence_count = system_issues.occurrence_count + 1,
         last_seen = NOW(),
         user_id = COALESCE(system_issues.user_id, EXCLUDED.user_id),
         severity = CASE
           WHEN EXCLUDED.severity = 'critical' OR system_issues.severity = 'critical' THEN 'critical'
           WHEN EXCLUDED.severity = 'high'     OR system_issues.severity = 'high'     THEN 'high'
           WHEN EXCLUDED.severity = 'medium'   OR system_issues.severity = 'medium'   THEN 'medium'
           ELSE 'low'
         END,
         blocked = system_issues.blocked OR EXCLUDED.blocked,
         error_message = COALESCE(EXCLUDED.error_message, system_issues.error_message),
         suggested_fix = COALESCE(EXCLUDED.suggested_fix, system_issues.suggested_fix),
         affected_user_ids = CASE
           WHEN EXCLUDED.user_id IS NULL THEN system_issues.affected_user_ids
           WHEN system_issues.affected_user_ids @> to_jsonb(EXCLUDED.user_id) THEN system_issues.affected_user_ids
           WHEN jsonb_array_length(COALESCE(system_issues.affected_user_ids, '[]'::jsonb)) >= 50 THEN system_issues.affected_user_ids
           ELSE COALESCE(system_issues.affected_user_ids, '[]'::jsonb) || to_jsonb(EXCLUDED.user_id)
         END,
         status = CASE WHEN system_issues.status = 'resolved' THEN 'open' ELSE system_issues.status END
       RETURNING id, fingerprint, severity, occurrence_count, blocked, module, status AS new_status,
                 (xmax = 0) AS is_new,
                 jsonb_array_length(COALESCE(affected_user_ids, '[]'::jsonb)) AS affected_count
     )
     SELECT up.id, up.fingerprint, up.severity, up.occurrence_count, up.blocked, up.module,
            up.new_status, up.is_new, up.affected_count, prev.old_severity, prev.old_status
     FROM up LEFT JOIN prev ON true`,
    [
      fingerprint, input.userId ?? null, platform, (input.device || "").slice(0, 300) || null,
      (input.appVersion || "").slice(0, 60) || null, route || null, module,
      (input.attemptedAction || "").slice(0, 300) || null,
      errorMessage || null, JSON.stringify(input.relatedIds ?? {}),
      severity, !!input.blocked, JSON.stringify((input.steps ?? []).slice(0, 20)),
      input.screenshotUrl ?? null, (input.gpsPermission || "").slice(0, 40) || null,
      source, (input.suggestedFix || "").slice(0, 500) || null,
    ]
  );
  const row = r.rows[0];
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    severity: row.severity as IssueSeverity,
    occurrenceCount: row.occurrence_count,
    isNew: row.is_new === true,
    oldSeverity: (row.old_severity ?? null) as IssueSeverity | null,
    distinctUsers: row.affected_count ?? 0,
    reopened: row.old_status === "resolved" && row.new_status === "open",
    module: row.module as string,
    blocked: row.blocked === true,
  };
}

export interface IssueFilter {
  status?: IssueStatus | "all";
  platform?: string;
  severity?: IssueSeverity;
  module?: string;
  limit?: number;
}

/** Admin dashboard list — newest activity first, most-repeated surfaced by occurrence_count. */
export async function listIssues(filter: IssueFilter = {}): Promise<any[]> {
  const clauses: string[] = [];
  const params: any[] = [];
  const status = filter.status ?? "open";
  if (status !== "all") { params.push(status); clauses.push(`status = $${params.length}`); }
  if (filter.platform) { params.push(filter.platform.toLowerCase()); clauses.push(`platform = $${params.length}`); }
  if (filter.severity) { params.push(filter.severity); clauses.push(`severity = $${params.length}`); }
  if (filter.module) { params.push(normalizeModule(filter.module)); clauses.push(`module = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const r = await pool.query(
    `SELECT id, fingerprint, user_id, platform, device, app_version, route, module,
            attempted_action, error_message, related_ids, severity, blocked, steps,
            screenshot_url, gps_permission, occurrence_count, first_seen, last_seen, status,
            source, suggested_fix, affected_user_ids,
            jsonb_array_length(COALESCE(affected_user_ids, '[]'::jsonb)) AS affected_count,
            ai_diagnosis, ai_diagnosed_at
     FROM system_issues
     ${where}
     ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       last_seen DESC
     LIMIT ${limit}`,
    params
  );
  return r.rows;
}

/** Compact aggregates for the dashboard header + JAC's admin answers. */
export async function getIssuesSummary(): Promise<{
  open: number; critical: number; high: number; blockedUsers: number;
  bySeverity: Record<string, number>;
  byPlatform: Record<string, number>;
  byModule: Array<{ module: string; count: number; occurrences: number }>;
  last24h: number;
}> {
  const [sev, plat, mod, totals] = await Promise.all([
    pool.query(`SELECT severity, COUNT(*)::int c FROM system_issues WHERE status <> 'resolved' GROUP BY severity`),
    pool.query(`SELECT platform, COUNT(*)::int c FROM system_issues WHERE status <> 'resolved' GROUP BY platform`),
    pool.query(`SELECT module, COUNT(*)::int c, COALESCE(SUM(occurrence_count),0)::int occ FROM system_issues WHERE status <> 'resolved' GROUP BY module ORDER BY occ DESC LIMIT 10`),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status <> 'resolved')::int AS open,
        COUNT(*) FILTER (WHERE status <> 'resolved' AND severity = 'critical')::int AS critical,
        COUNT(*) FILTER (WHERE status <> 'resolved' AND severity = 'high')::int AS high,
        COUNT(*) FILTER (WHERE status <> 'resolved' AND blocked = true)::int AS blocked_users,
        COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '24 hours')::int AS last24h
      FROM system_issues`),
  ]);
  const bySeverity: Record<string, number> = {};
  for (const row of sev.rows) bySeverity[row.severity] = row.c;
  const byPlatform: Record<string, number> = {};
  for (const row of plat.rows) byPlatform[row.platform] = row.c;
  const t = totals.rows[0] || {};
  return {
    open: t.open ?? 0,
    critical: t.critical ?? 0,
    high: t.high ?? 0,
    blockedUsers: t.blocked_users ?? 0,
    bySeverity,
    byPlatform,
    byModule: mod.rows.map((r: any) => ({ module: r.module, count: r.c, occurrences: r.occ })),
    last24h: t.last24h ?? 0,
  };
}

/** Did a given module work today? Used by JAC ("did payments work today?"). */
export async function getModuleHealthToday(module: string): Promise<{ module: string; failures: number; occurrences: number; worstSeverity: IssueSeverity | null }> {
  const m = normalizeModule(module);
  const r = await pool.query(
    `SELECT COUNT(*)::int failures, COALESCE(SUM(occurrence_count),0)::int occ,
            MIN(CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END) sev
     FROM system_issues
     WHERE module = $1 AND last_seen > NOW() - INTERVAL '24 hours'`,
    [m]
  );
  const row = r.rows[0] || {};
  const sevMap: Record<number, IssueSeverity> = { 0: "critical", 1: "high", 2: "medium", 3: "low" };
  return {
    module: m,
    failures: row.failures ?? 0,
    occurrences: row.occ ?? 0,
    worstSeverity: row.sev === null || row.sev === undefined ? null : sevMap[row.sev],
  };
}

export async function updateIssueStatus(id: number, status: IssueStatus): Promise<boolean> {
  const r = await pool.query(`UPDATE system_issues SET status = $1 WHERE id = $2`, [status, id]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Escalate a NEW critical issue to every admin via in-app notification + push.
 * Fire-and-forget: swallows all errors and never blocks the reporter response.
 * Only new criticals call this (dedupe repeats never re-notify), so admins are
 * alerted once per distinct failure fingerprint rather than on every occurrence.
 */
export async function escalateCriticalIssue(issue: {
  id: number;
  module: string;
  severity: IssueSeverity;
  platform?: string;
  errorMessage?: string;
  occurrenceCount?: number;
}): Promise<void> {
  try {
    const admins = await pool.query(`SELECT id FROM users WHERE role = 'admin'`);
    if (!admins.rows.length) return;
    const { storage } = await import("./storage");
    const plat = (issue.platform || "web").toLowerCase();
    const msg = (issue.errorMessage || "").slice(0, 140) || "no message";
    const title = `🚨 CRITICAL: ${issue.module} failing (${plat})`;
    const body = `${msg} — tap to open the System Issues dashboard.`;
    for (const a of admins.rows) {
      try {
        await storage.createNotification({
          userId: a.id,
          title,
          body,
          type: "system_issue",
          ctaUrl: "/admin/qa?tab=system-issues",
          ctaLabel: "View Issues",
          displayMode: "toast",
        });
      } catch {}
    }
  } catch {}
}

const SEV_DOT: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" };

// Spoken module words → canonical module name. Order: multi-word / specific first.
const MONITORING_MODULE_WORDS: Array<[string, string]> = [
  ["verify and inspect", "verify_inspect"], ["verify & inspect", "verify_inspect"],
  ["v&i", "verify_inspect"], ["verify", "verify_inspect"], ["inspect", "verify_inspect"],
  ["load board", "load_board"], ["loadboard", "load_board"],
  ["payments", "payment"], ["payment", "payment"], ["checkout", "payment"], ["stripe", "payment"],
  ["payouts", "wallet"], ["payout", "wallet"], ["cashout", "wallet"], ["cash out", "wallet"], ["wallet", "wallet"],
  ["sign in", "login"], ["signin", "login"], ["log in", "login"], ["login", "login"], ["auth", "login"],
  ["sign up", "signup"], ["signup", "signup"], ["registration", "signup"], ["register", "signup"],
  ["uploads", "upload"], ["upload", "upload"], ["photos", "upload"], ["photo", "upload"], ["images", "upload"], ["image", "upload"],
  ["location", "gps"], ["tracking", "gps"], ["gps", "gps"],
  ["maps", "map"], ["map", "map"],
  ["studio", "studio"], ["generation", "studio"],
  ["marketplace", "marketplace"],
  ["notifications", "push"], ["notification", "push"], ["push", "push"],
  ["jobs", "job"], ["job", "job"],
  ["voice", "voice"], ["speech", "voice"], ["talk", "voice"], ["mic", "voice"], ["microphone", "voice"], ["jac voice", "voice"],
  ["profile", "profile"],
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * If `message` reads like an admin monitoring / health question, answer it
 * directly from the system_issues telemetry and return a formatted reply.
 * Returns null when the message is NOT a monitoring question, so the caller
 * falls through to the normal JAC flow. Callers must gate this on admin role.
 * Never trusts the LLM — pure DB read, so it adds ZERO model cost.
 */
export async function tryAdminMonitoringAnswer(message: string): Promise<string | null> {
  const msg = (message || "").toLowerCase();
  const isMonitoring =
    /\b(system|app|platform|everything|anything)\b.*\b(health|status|ok|okay|working|running|down|broken|fine|good)\b/.test(msg)
    || /\b(any|are there|were there|any new)\b.*\b(issues?|problems?|errors?|outages?|failures?|bugs?|incidents?)\b/.test(msg)
    || /\b(health\s*check|status\s*report|system\s*status|health\s*report|system\s*health)\b/.test(msg)
    || /\bwhat('?s| is)\s+(broken|failing|down|wrong)\b/.test(msg)
    || /\b(critical|blocking)\b.*\b(issues?|problems?|errors?|failures?)\b/.test(msg)
    || /\bdid\s+(the\s+)?[\w&]+\s+(work|fail|break|go down)\b/.test(msg)
    || /\b(is|are|was|were)\s+(the\s+)?[\w&]+\s+(working|down|broken|up|ok|okay|failing)\b/.test(msg)
    || /\bhow('?s| is|s| are)\s+(the\s+)?(app|system|platform|site|guber|things)\b/.test(msg);
  if (!isMonitoring) return null;

  let module: string | null = null;
  for (const [word, canon] of MONITORING_MODULE_WORDS) {
    if (new RegExp(`\\b${escapeRegExp(word)}\\b`).test(msg)) { module = canon; break; }
  }

  if (module) {
    const h = await getModuleHealthToday(module);
    if (h.failures === 0) {
      return `✅ ${module}: healthy — no failures reported in the last 24 hours.`;
    }
    const sev = h.worstSeverity ?? "low";
    return `${SEV_DOT[sev]} ${module}: ${h.failures} distinct issue(s) in the last 24h (${h.occurrences} total occurrence(s)), worst severity ${sev.toUpperCase()}. Open the System Issues dashboard for details.`;
  }

  const s = await getIssuesSummary();
  if (s.open === 0) {
    return `✅ All clear — no open system issues right now.${s.last24h ? ` (${s.last24h} issue(s) seen in the last 24h.)` : ""}`;
  }
  const modLines = s.byModule.slice(0, 5).map((m) => `• ${m.module}: ${m.count} (${m.occurrences}×)`).join("\n");
  const platLine = Object.entries(s.byPlatform).map(([p, c]) => `${p} ${c}`).join(", ");
  return [
    `📊 System status — ${s.open} open issue(s).`,
    `🔴 ${s.critical} critical · 🟠 ${s.high} high · 🚫 ${s.blockedUsers} currently blocking users.`,
    s.last24h ? `${s.last24h} issue(s) active in the last 24h.` : "",
    platLine ? `By platform: ${platLine}.` : "",
    modLines ? `Top modules:\n${modLines}` : "",
    `Open the System Issues dashboard for full detail.`,
  ].filter(Boolean).join("\n");
}
