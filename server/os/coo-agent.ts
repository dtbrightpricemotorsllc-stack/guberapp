import { db } from "../db";
import { sql } from "drizzle-orm";
import { osBriefings } from "@shared/os-schema";
import { desc, eq } from "drizzle-orm";
import { proposeAction } from "./approval-engine";

export type ImpactLevel = "critical" | "high" | "medium" | "low";

export interface COOFinding {
  id: string;
  category: string;
  categoryLabel: string;
  issue: string;
  detail: string;
  whyItMatters: string;
  impactLevel: ImpactLevel;
  recommendation: string;
  data: Record<string, any>;
  score: number;
}

export interface COOBriefing {
  id?: number;
  generatedAt: string;
  platformHealthScore: number;
  executiveSummary: string;
  top5: COOFinding[];
  allFindings: COOFinding[];
  categoryCounts: Record<string, number>;
  totalFindings: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safe<T>(r: PromiseSettledResult<T[]>): T[] {
  return r.status === "fulfilled" ? r.value : [];
}

// ── 1. Open Disputes ───────────────────────────────────────────────────────────

async function analyzeDisputes(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                           AS total,
      COUNT(*) FILTER (WHERE opened_at < NOW() - INTERVAL '48 hours')::int   AS stale,
      COUNT(*) FILTER (WHERE opened_at < NOW() - INTERVAL '7 days')::int     AS very_stale,
      MIN(opened_at)                                                          AS oldest
    FROM guber_disputes WHERE status = 'open'
  `);
  const row = r.rows[0] as any;
  const total     = row.total      ?? 0;
  if (total === 0) return [];
  const stale     = row.stale      ?? 0;
  const veryStale = row.very_stale ?? 0;
  const oldestDays = row.oldest
    ? Math.floor((Date.now() - new Date(row.oldest).getTime()) / 86400000)
    : 0;
  const impact: ImpactLevel = veryStale > 0 ? "critical" : total > 2 ? "high" : "medium";
  return [{
    id: "disputes_open",
    category: "disputes",
    categoryLabel: "Open Disputes",
    issue: `${total} open dispute${total > 1 ? "s" : ""}${stale > 0 ? ` — ${stale} open >48h` : ""}`,
    detail: `${total} total · ${stale} open >48h · ${veryStale} open >7 days · oldest: ${oldestDays}d ago`,
    whyItMatters: veryStale > 0
      ? `${veryStale} dispute${veryStale > 1 ? "s are" : " is"} over 7 days old. Disputes left open this long risk chargebacks, formal complaints, and direct reputation damage to GUBER.`
      : `${total} open dispute${total > 1 ? "s" : ""} require attention. Each unresolved dispute carries chargeback risk and signals broken trust between hirers and workers.`,
    impactLevel: impact,
    recommendation: veryStale > 0
      ? `Immediately review the ${veryStale} dispute${veryStale > 1 ? "s" : ""} older than 7 days. Issue a resolution or escalate to legal. These are at chargeback risk.`
      : `Review all ${total} open disputes in Admin panel. Prioritize the ${stale} cases open >48h.`,
    data: { total, stale, veryStale, oldestDays },
    score: veryStale > 0 ? 98 : total > 2 ? 85 : 65,
  }];
}

// ── 2. Stuck Jobs ──────────────────────────────────────────────────────────────

async function analyzeStuckJobs(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                                 AS total,
      COUNT(*) FILTER (WHERE locked_at < NOW() - INTERVAL '72 hours')::int         AS very_stuck,
      COUNT(*) FILTER (WHERE category = 'Verify & Inspect')::int                   AS vi_stuck,
      COUNT(*) FILTER (WHERE is_paid = false AND completed_at IS NOT NULL)::int     AS paid_issue,
      MIN(locked_at)                                                                AS oldest_lock
    FROM jobs
    WHERE status = 'helper_confirmed'
      AND completed_at IS NULL
      AND locked_at < NOW() - INTERVAL '48 hours'
      AND is_test_job = false
  `);
  const row = r.rows[0] as any;
  const total     = row.total      ?? 0;
  if (total === 0) return [];
  const veryStuck = row.very_stuck ?? 0;
  const viStuck   = row.vi_stuck   ?? 0;
  const oldestDays = row.oldest_lock
    ? Math.floor((Date.now() - new Date(row.oldest_lock).getTime()) / 86400000)
    : 0;
  const impact: ImpactLevel = veryStuck > 3 ? "critical" : total > 5 ? "high" : "medium";
  return [{
    id: "stuck_jobs",
    category: "stuck_jobs",
    categoryLabel: "Stuck Jobs",
    issue: `${total} job${total > 1 ? "s" : ""} confirmed but not completed (>48h locked)`,
    detail: `${total} stuck · ${veryStuck} stuck >72h · ${viStuck} are V&I · oldest locked ${oldestDays}d ago`,
    whyItMatters: `These jobs have a worker locked in but no completion recorded for over 48 hours. Workers may be waiting for payout, the job may have been abandoned off-platform, or payment capture failed. Each is a potential dispute and lost worker trust.`,
    impactLevel: impact,
    recommendation: `Review the ${total} stuck job${total > 1 ? "s" : ""} in Admin. For each: confirm if the job was completed off-platform, check Stripe payment intent status, and initiate manual payout if the worker completed work. Prioritize the ${veryStuck} jobs >72h.`,
    data: { total, veryStuck, viStuck, oldestDays },
    score: veryStuck > 3 ? 90 : total > 5 ? 75 : 55,
  }];
}

// ── 3. High Cancellation Users ─────────────────────────────────────────────────

async function analyzeCancellations(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(DISTINCT posted_by_id)::int  AS hirers,
      COUNT(*)::int                      AS total_cancels,
      MAX(cancel_count)::int             AS max_by_one
    FROM (
      SELECT posted_by_id, COUNT(*) AS cancel_count
      FROM jobs
      WHERE cancel_reason IS NOT NULL AND is_test_job = false
      GROUP BY posted_by_id HAVING COUNT(*) >= 3
    ) t
  `);
  const row = r.rows[0] as any;
  const hirers       = row.hirers        ?? 0;
  const totalCancels = row.total_cancels ?? 0;
  const maxByOne     = row.max_by_one    ?? 0;
  if (hirers === 0) return [];
  const impact: ImpactLevel = maxByOne >= 5 ? "high" : "medium";
  return [{
    id: "high_cancellation_hirers",
    category: "cancellations",
    categoryLabel: "High Cancellation Users",
    issue: `${hirers} hirer${hirers > 1 ? "s" : ""} with 3+ cancellations`,
    detail: `${hirers} hirers · ${totalCancels} total cancellations · worst offender: ${maxByOne} cancellations`,
    whyItMatters: `Hirers who repeatedly cancel waste worker time and reduce worker willingness to accept jobs. The top offender has cancelled ${maxByOne} times — a pattern consistent with platform abuse or systemic friction in the job flow.`,
    impactLevel: impact,
    recommendation: `Review the ${hirers} identified hirer${hirers > 1 ? "s" : ""}. Consider issuing a platform warning, requiring upfront payment, or restricting repeat cancellers. The user with ${maxByOne} cancellations needs immediate review.`,
    data: { hirers, totalCancels, maxByOne },
    score: maxByOne >= 5 ? 72 : 48,
  }];
}

// ── 4. Failed Job Payment Flows ────────────────────────────────────────────────

async function analyzeFailedFlows(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                         AS count,
      COALESCE(SUM(final_price), 0)::real   AS at_risk
    FROM jobs
    WHERE status = 'completed'
      AND is_paid = false
      AND final_price > 0
      AND is_test_job = false
  `);
  const row = r.rows[0] as any;
  const count   = row.count    ?? 0;
  const atRisk  = row.at_risk  ?? 0;
  if (count === 0) return [];
  const impact: ImpactLevel = count > 3 ? "critical" : "high";
  return [{
    id: "failed_payment_flows",
    category: "failed_flows",
    categoryLabel: "Failed Payment Flows",
    issue: `${count} completed job${count > 1 ? "s" : ""} with payment not captured`,
    detail: `${count} completed + is_paid=false · $${atRisk.toFixed(2)} at-risk revenue`,
    whyItMatters: `These workers completed their jobs but have not been paid. Every unpaid completed job is a worker who hasn't received earned wages. If not resolved these become disputes — and word spreads among workers that GUBER doesn't pay reliably.`,
    impactLevel: impact,
    recommendation: `Run a Stripe payment intent lookup for each of the ${count} job${count > 1 ? "s" : ""}. Check for "requires_capture" intents that need manual capture. $${atRisk.toFixed(2)} in worker payouts are at risk.`,
    data: { count, atRisk: parseFloat(atRisk.toFixed(2)) },
    score: count > 3 ? 93 : 80,
  }];
}

// ── 5. Marketplace Inactivity ──────────────────────────────────────────────────

async function analyzeMarketplaceInactivity(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                           AS stale,
      COUNT(*) FILTER (WHERE view_count = 0)::int            AS zero_views,
      COUNT(*) FILTER (WHERE contact_count = 0)::int         AS zero_contacts,
      ROUND(AVG(view_count)::numeric, 1)::real               AS avg_views
    FROM marketplace_items
    WHERE status = 'available'
      AND is_sample = false
      AND created_at < NOW() - INTERVAL '14 days'
  `);
  const row = r.rows[0] as any;
  const stale       = row.stale         ?? 0;
  const zeroViews   = row.zero_views    ?? 0;
  const zeroContact = row.zero_contacts ?? 0;
  const avgViews    = row.avg_views     ?? 0;
  if (stale === 0) return [];
  const impact: ImpactLevel = zeroViews > 5 ? "medium" : "low";
  return [{
    id: "marketplace_inactivity",
    category: "marketplace",
    categoryLabel: "Marketplace Inactivity",
    issue: `${stale} listing${stale > 1 ? "s" : ""} stale >14 days${zeroViews > 0 ? ` (${zeroViews} zero views)` : ""}`,
    detail: `${stale} stale · ${zeroViews} zero views · ${zeroContact} zero contacts · avg ${avgViews} views`,
    whyItMatters: `${zeroViews} listings have received zero views in over 2 weeks. Stale, unviewed inventory signals poor discoverability or inactive sellers. A marketplace that looks empty discourages new buyers from listing or browsing.`,
    impactLevel: impact,
    recommendation: `Identify the ${zeroViews} zero-view listings. Consider: automated seller nudges to update price/photos, search re-indexing for stale listings, or archiving inventory from accounts inactive >30 days.`,
    data: { stale, zeroViews, zeroContact, avgViews },
    score: zeroViews > 5 ? 38 : 22,
  }];
}

// ── 6. Verify & Inspect Bottlenecks ───────────────────────────────────────────

async function analyzeVIBottlenecks(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                   AS unmatched,
      COUNT(*) FILTER (WHERE urgent_switch = true)::int              AS urgent,
      COUNT(*) FILTER (WHERE start_time < NOW())::int                AS past_scheduled,
      COUNT(*) FILTER (WHERE start_time < NOW() - INTERVAL '72 hours')::int AS very_overdue
    FROM jobs
    WHERE category = 'Verify & Inspect'
      AND status = 'posted_public'
      AND is_published = true
      AND is_test_job = false
  `);
  const row = r.rows[0] as any;
  const unmatched    = row.unmatched      ?? 0;
  const urgent       = row.urgent         ?? 0;
  const pastScheduled = row.past_scheduled ?? 0;
  const veryOverdue  = row.very_overdue   ?? 0;
  if (unmatched === 0) return [];
  const impact: ImpactLevel = (urgent > 0 && pastScheduled > 0) ? "high" : unmatched > 10 ? "medium" : "low";
  return [{
    id: "vi_bottleneck",
    category: "vi_bottleneck",
    categoryLabel: "V&I Bottlenecks",
    issue: `${unmatched} V&I job${unmatched > 1 ? "s" : ""} published without a worker${urgent > 0 ? ` (${urgent} urgent)` : ""}`,
    detail: `${unmatched} unmatched · ${pastScheduled} past scheduled time · ${veryOverdue} overdue >72h · ${urgent} marked urgent`,
    whyItMatters: `V&I is GUBER's core product differentiation. ${unmatched} published V&I jobs have no worker. ${urgent > 0 ? `${urgent} are buyer-marked urgent. ` : ""}When V&I supply doesn't meet demand, buyers abandon and competitors fill the gap.`,
    impactLevel: impact,
    recommendation: `Review the ${unmatched} unmatched V&I jobs. ${urgent > 0 ? `Address the ${urgent} urgent listing${urgent > 1 ? "s" : ""} first. ` : ""}Consider targeted push notifications to nearby V&I workers, lowering match radius, or budget boost incentives.`,
    data: { unmatched, urgent, pastScheduled, veryOverdue },
    score: urgent > 0 && pastScheduled > 0 ? 68 : unmatched > 10 ? 45 : 26,
  }];
}

// ── 7. Load Board Bottlenecks ──────────────────────────────────────────────────

async function analyzeLoadBoard(): Promise<COOFinding[]> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                              AS unmatched,
      COUNT(*) FILTER (WHERE urgent = true)::int                AS urgent,
      COUNT(*) FILTER (WHERE pickup_flexibility = 'asap')::int  AS asap
    FROM load_board_listings
    WHERE status = 'posted' AND connected_carrier_id IS NULL
  `);
  const row = r.rows[0] as any;
  const unmatched = row.unmatched ?? 0;
  const urgent    = row.urgent    ?? 0;
  const asap      = row.asap      ?? 0;
  if (unmatched === 0) return [];
  const impact: ImpactLevel = asap > 2 ? "medium" : "low";
  return [{
    id: "load_board_bottleneck",
    category: "load_board",
    categoryLabel: "Load Board Bottlenecks",
    issue: `${unmatched} load${unmatched > 1 ? "s" : ""} posted without a carrier`,
    detail: `${unmatched} unmatched · ${urgent} urgent · ${asap} ASAP pickup`,
    whyItMatters: `${unmatched} load board listing${unmatched > 1 ? "s" : ""} have no connected carrier. ${asap > 0 ? `${asap} need ASAP pickup. ` : ""}Unmatched loads signal a supply gap in your carrier network or a discovery problem — posters who don't get matched don't come back.`,
    impactLevel: impact,
    recommendation: `Review the ${unmatched} unmatched listing${unmatched > 1 ? "s" : ""}. ${asap > 0 ? `Prioritize the ${asap} ASAP jobs. ` : ""}Consider direct carrier SMS outreach, featured placement, or expanding the notification radius for nearby drivers.`,
    data: { unmatched, urgent, asap },
    score: asap > 2 ? 35 : 18,
  }];
}

// ── 8. Platform Trends ─────────────────────────────────────────────────────────

async function analyzePlatformTrends(): Promise<COOFinding[]> {
  const findings: COOFinding[] = [];

  // Week-over-week user growth
  const ur = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int                              AS this_week,
      COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days')::int AS last_week,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int                             AS this_month
    FROM users WHERE is_test_user = false AND deleted_at IS NULL
  `);
  const ur0 = ur.rows[0] as any;
  const thisWeek  = ur0.this_week  ?? 0;
  const lastWeek  = ur0.last_week  ?? 0;
  const growth    = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;
  if (thisWeek < 3 && lastWeek > 3) {
    findings.push({
      id: "user_growth_decline",
      category: "trends",
      categoryLabel: "Platform Trends",
      issue: `User acquisition slowing: ${thisWeek} new users this week vs ${lastWeek} last week (${growth}% WoW)`,
      detail: `${thisWeek} this week · ${lastWeek} last week · ${growth}% WoW · ${ur0.this_month} this month`,
      whyItMatters: `New user acquisition dropped ${Math.abs(growth)}% week-over-week. Early-stage platforms depend on consistent growth to build network effects. A slowdown compounds — fewer users means fewer jobs, which means fewer workers, which means fewer users.`,
      impactLevel: "medium",
      recommendation: "Audit acquisition channels for dropoffs. Check if any referral source went quiet. Consider a targeted outreach push or referral incentive this week.",
      data: { thisWeek, lastWeek, growth, thisMonth: ur0.this_month },
      score: 42,
    });
  }

  // Job cancellation rate (locked jobs in last 30 days)
  const jr = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed')::int           AS completed,
      COUNT(*) FILTER (WHERE cancel_reason IS NOT NULL)::int      AS cancelled,
      COUNT(*)::int                                               AS total
    FROM jobs
    WHERE is_test_job = false AND locked_at IS NOT NULL AND locked_at > NOW() - INTERVAL '30 days'
  `);
  const jr0       = jr.rows[0] as any;
  const completed = jr0.completed ?? 0;
  const cancelled = jr0.cancelled ?? 0;
  const total     = jr0.total     ?? 0;
  const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
  if (cancelRate > 20 && total > 5) {
    findings.push({
      id: "high_cancel_rate",
      category: "trends",
      categoryLabel: "Platform Trends",
      issue: `High cancellation rate: ${cancelRate}% of locked jobs cancelled (last 30d)`,
      detail: `${completed} completed · ${cancelled} cancelled · ${total} total locked · ${cancelRate}% cancel rate`,
      whyItMatters: `${cancelRate}% of matched jobs are being cancelled. This directly hits worker earnings, hirer satisfaction, and platform revenue — and is significantly above a healthy platform rate of <10%.`,
      impactLevel: cancelRate > 40 ? "high" : "medium",
      recommendation: "Run a 30-day cancellation root cause analysis by job category and cancel stage. Enforce cancellation fees for hirers who cancel after worker acceptance. Improve scheduling flow to reduce ghost jobs.",
      data: { completed, cancelled, total, cancelRate },
      score: cancelRate > 40 ? 65 : 36,
    });
  }

  return findings;
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

export async function runCOOAnalysis(): Promise<COOBriefing> {
  const results = await Promise.allSettled([
    analyzeDisputes(),
    analyzeStuckJobs(),
    analyzeCancellations(),
    analyzeFailedFlows(),
    analyzeMarketplaceInactivity(),
    analyzeVIBottlenecks(),
    analyzeLoadBoard(),
    analyzePlatformTrends(),
  ]);

  const allFindings = [
    ...safe(results[0]), ...safe(results[1]), ...safe(results[2]),
    ...safe(results[3]), ...safe(results[4]), ...safe(results[5]),
    ...safe(results[6]), ...safe(results[7]),
  ].sort((a, b) => b.score - a.score);

  const top5 = allFindings.slice(0, 5);

  // Health score
  let health = 100;
  for (const f of allFindings) {
    if (f.impactLevel === "critical") health -= 20;
    else if (f.impactLevel === "high") health -= 10;
    else if (f.impactLevel === "medium") health -= 5;
    else health -= 2;
  }
  health = Math.max(0, Math.min(100, health));

  // Category counts
  const categoryCounts: Record<string, number> = {};
  for (const f of allFindings) {
    categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;
  }

  const critCount = allFindings.filter(f => f.impactLevel === "critical").length;
  const highCount = allFindings.filter(f => f.impactLevel === "high").length;
  const executiveSummary = buildSummary(allFindings, health, critCount, highCount);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const [row] = await db.insert(osBriefings).values({
    agentKey: "coo",
    period: "daily",
    title: `COO Briefing — ${dateStr}`,
    body: executiveSummary,
    metrics: { healthScore: health, categoryCounts, findings: allFindings } as any,
    priority: critCount > 0 ? "urgent" : highCount > 0 ? "high" : "normal",
  }).returning();

  return {
    id: row.id,
    generatedAt: now.toISOString(),
    platformHealthScore: health,
    executiveSummary,
    top5,
    allFindings,
    categoryCounts,
    totalFindings: allFindings.length,
  };
}

export async function getLatestCOOBriefing(): Promise<COOBriefing | null> {
  const rows = await db.select().from(osBriefings)
    .where(eq(osBriefings.agentKey, "coo"))
    .orderBy(desc(osBriefings.createdAt))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const m = row.metrics as any;
  return {
    id: row.id,
    generatedAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    platformHealthScore: m?.healthScore ?? 0,
    executiveSummary: row.body,
    top5: (m?.findings ?? []).slice(0, 5),
    allFindings: m?.findings ?? [],
    categoryCounts: m?.categoryCounts ?? {},
    totalFindings: (m?.findings ?? []).length,
  };
}

export async function queueRecommendation(finding: COOFinding): Promise<number> {
  const action = await proposeAction({
    agentKey: "coo",
    actionType: "alert.founder",
    payload: {
      findingId: finding.id,
      category: finding.category,
      issue: finding.issue,
      impactLevel: finding.impactLevel,
      recommendation: finding.recommendation,
      data: finding.data,
    },
    rationale: `COO Agent: ${finding.issue}. ${finding.whyItMatters}`,
  });
  return action.id;
}

function buildSummary(findings: COOFinding[], health: number, critical: number, high: number): string {
  if (findings.length === 0)
    return `Platform operating normally. No operational issues detected. Health score: ${health}/100.`;
  const top = findings[0];
  const catCount = new Set(findings.map(f => f.category)).size;
  return [
    `Platform health score: ${health}/100.`,
    critical > 0
      ? `${critical} critical issue${critical > 1 ? "s" : ""} require immediate action.`
      : high > 0
      ? `${high} high-impact issue${high > 1 ? "s" : ""} detected.`
      : "No critical issues detected.",
    `${findings.length} finding${findings.length > 1 ? "s" : ""} across ${catCount} operational area${catCount > 1 ? "s" : ""}.`,
    `Top priority: ${top.issue}.`,
  ].join(" ");
}
