/**
 * server/os/growth-agent.ts
 * Growth Agent — market development intelligence for GUBER OS.
 *
 * Analyses job density vs worker supply by zip, new-user funnel health,
 * and engagement patterns. Proposes:
 *   • schedule.cash_drop  — for high-demand zips with thin supply
 *   • queue.outreach      — personalised sponsor/partner email batches
 *   • alert.founder       — when user acquisition is stalling
 *
 * All SQL is production-only (is_test_user=false, is_test_job=false, is_demo=false).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { osBriefings } from "@shared/os-schema";
import { desc, eq } from "drizzle-orm";
import { proposeAction } from "./approval-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GrowthSignalLevel = "opportunity" | "healthy" | "warning" | "critical";

export interface ZipInsight {
  zip: string;
  demandJobs: number;
  workerCount: number;
  hirersCount: number;
  supplyRatio: number;     // workers per posted job
  avgJobValue: number;
  cashDropProposed: boolean;
}

export interface FunnelMetrics {
  newUsers30d: number;
  newUsers7d: number;
  newUsersToday: number;
  verifiedRate30d: number;      // % of new users that completed ID verify
  profileCompleteRate30d: number;
  firstJobPostedRate30d: number; // % of hirers that posted ≥1 job
  workerActivationRate30d: number; // % of helpers that completed ≥1 job
}

export interface GrowthAlert {
  level: GrowthSignalLevel;
  type: string;
  message: string;
  zip?: string;
  value?: number;
}

export interface GrowthMetrics {
  generatedAt: string;
  productionOnly: boolean;
  funnel: FunnelMetrics;
  zipInsights: ZipInsight[];
  totalDemandZips: number;
  zipsWithNoWorkers: number;
  avgPlatformSupplyRatio: number;
  alerts: GrowthAlert[];
  proposedActions: Array<{ actionType: string; actionId: number; zip?: string }>;
  growthScore: number;
  executiveSummary: string;
}

export interface GrowthBriefing {
  id?: number;
  generatedAt: string;
  metrics: GrowthMetrics;
  title: string;
  body: string;
  priority: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v: any, fallback = 0): number {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// ── 1. Funnel Analysis ────────────────────────────────────────────────────────

async function analyzeFunnel(): Promise<FunnelMetrics> {
  const r = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE u.created_at > NOW() - INTERVAL '30 days')::int   AS new_30d,
      COUNT(*) FILTER (WHERE u.created_at > NOW() - INTERVAL '7 days')::int    AS new_7d,
      COUNT(*) FILTER (WHERE u.created_at > NOW() - INTERVAL '1 day')::int     AS new_today,
      COUNT(*) FILTER (
        WHERE u.created_at > NOW() - INTERVAL '30 days' AND u.id_verified = true
      )::int AS verified_30d,
      COUNT(*) FILTER (
        WHERE u.created_at > NOW() - INTERVAL '30 days' AND u.profile_complete = true
      )::int AS profile_30d
    FROM users u
    WHERE u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
      AND u.email NOT ILIKE '%@guber-sim.local'
  `);
  const row = r.rows[0] as any;
  const new30d = safeNum(row.new_30d);

  // How many hirers posted ≥1 job in last 30d (of those who signed up in last 30d)
  const hirerR = await db.execute(sql`
    SELECT COUNT(DISTINCT u.id)::int AS activated
    FROM users u
    JOIN jobs j ON j.posted_by_id = u.id
    WHERE u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
      AND u.email NOT ILIKE '%@guber-sim.local'
      AND u.role = 'buyer'
      AND u.created_at > NOW() - INTERVAL '30 days'
      AND j.is_test_job = false
      AND j.is_demo = false
      AND j.created_at > NOW() - INTERVAL '30 days'
  `);
  const hirerActivated = safeNum((hirerR.rows[0] as any).activated);

  // How many workers completed ≥1 job in last 30d (of those who signed up in last 30d)
  const workerR = await db.execute(sql`
    SELECT COUNT(DISTINCT u.id)::int AS activated
    FROM users u
    JOIN jobs j ON j.assigned_helper_id = u.id
    WHERE u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
      AND u.email NOT ILIKE '%@guber-sim.local'
      AND u.role = 'helper'
      AND u.created_at > NOW() - INTERVAL '30 days'
      AND j.status = 'completed'
      AND j.is_test_job = false
      AND j.is_demo = false
  `);
  const workerActivated = safeNum((workerR.rows[0] as any).activated);

  // New hirers and helpers in last 30d for denominator
  const roleR = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE u.role = 'buyer')::int  AS buyers,
      COUNT(*) FILTER (WHERE u.role = 'helper')::int AS helpers
    FROM users u
    WHERE u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
      AND u.email NOT ILIKE '%@guber-sim.local'
      AND u.created_at > NOW() - INTERVAL '30 days'
  `);
  const buyers30d  = safeNum((roleR.rows[0] as any).buyers);
  const helpers30d = safeNum((roleR.rows[0] as any).helpers);

  return {
    newUsers30d: new30d,
    newUsers7d: safeNum(row.new_7d),
    newUsersToday: safeNum(row.new_today),
    verifiedRate30d: new30d > 0 ? parseFloat(((safeNum(row.verified_30d) / new30d) * 100).toFixed(1)) : 0,
    profileCompleteRate30d: new30d > 0 ? parseFloat(((safeNum(row.profile_30d) / new30d) * 100).toFixed(1)) : 0,
    firstJobPostedRate30d: buyers30d > 0 ? parseFloat(((hirerActivated / buyers30d) * 100).toFixed(1)) : 0,
    workerActivationRate30d: helpers30d > 0 ? parseFloat(((workerActivated / helpers30d) * 100).toFixed(1)) : 0,
  };
}

// ── 2. Zip-level supply/demand ────────────────────────────────────────────────

async function analyzeZipDensity(): Promise<ZipInsight[]> {
  // Jobs posted in last 30d, grouped by zip
  const demandR = await db.execute(sql`
    SELECT
      j.zip,
      COUNT(*)::int                          AS demand_jobs,
      COUNT(DISTINCT j.posted_by_id)::int    AS hirers_count,
      AVG(j.final_price)::float              AS avg_value
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.created_at > NOW() - INTERVAL '30 days'
      AND j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
      AND j.zip IS NOT NULL
    GROUP BY j.zip
    ORDER BY demand_jobs DESC
    LIMIT 20
  `);

  // Workers registered per zip
  const supplyR = await db.execute(sql`
    SELECT zip, COUNT(*)::int AS worker_count
    FROM users
    WHERE role = 'helper'
      AND is_test_user = false
      AND email NOT ILIKE '%@guberapp.internal'
      AND zip IS NOT NULL
    GROUP BY zip
  `);
  const supplyMap: Record<string, number> = {};
  for (const row of supplyR.rows as any[]) {
    supplyMap[row.zip] = safeNum(row.worker_count);
  }

  return (demandR.rows as any[]).map(row => {
    const workers = supplyMap[row.zip] ?? 0;
    const demand  = safeNum(row.demand_jobs);
    return {
      zip: row.zip,
      demandJobs: demand,
      workerCount: workers,
      hirersCount: safeNum(row.hirers_count),
      supplyRatio: demand > 0 ? parseFloat((workers / demand).toFixed(2)) : 0,
      avgJobValue: parseFloat(safeNum(row.avg_value).toFixed(2)),
      cashDropProposed: false,
    };
  });
}

// ── 3. Alerts + growth score ──────────────────────────────────────────────────

function buildAlertsAndScore(
  funnel: FunnelMetrics,
  zips: ZipInsight[],
): { alerts: GrowthAlert[]; growthScore: number } {
  const alerts: GrowthAlert[] = [];
  let score = 100;

  // User growth stall
  if (funnel.newUsers30d === 0) {
    alerts.push({ level: "critical", type: "no_new_users", message: "Zero new users in last 30 days — acquisition completely stalled." });
    score -= 35;
  } else if (funnel.newUsers7d === 0 && funnel.newUsers30d > 0) {
    alerts.push({ level: "warning", type: "growth_stall_7d", message: `No new users in last 7 days despite ${funnel.newUsers30d} in the prior 30d period.` });
    score -= 15;
  }

  // Low verification rate
  if (funnel.newUsers30d > 0 && funnel.verifiedRate30d < 40) {
    alerts.push({
      level: funnel.verifiedRate30d < 20 ? "critical" : "warning",
      type: "low_verify_rate",
      message: `ID verification rate ${funnel.verifiedRate30d}% of new users (30d) — trust funnel leaking.`,
      value: funnel.verifiedRate30d,
    });
    score -= funnel.verifiedRate30d < 20 ? 20 : 10;
  }

  // Low hirer activation
  if (funnel.firstJobPostedRate30d < 30 && funnel.newUsers30d > 0) {
    alerts.push({
      level: "warning",
      type: "low_hirer_activation",
      message: `Only ${funnel.firstJobPostedRate30d}% of new hirers posted a job — onboarding friction.`,
      value: funnel.firstJobPostedRate30d,
    });
    score -= 10;
  }

  // Supply gaps
  const noWorkerZips = zips.filter(z => z.workerCount === 0 && z.demandJobs > 0);
  if (noWorkerZips.length > 0) {
    alerts.push({
      level: "opportunity",
      type: "worker_supply_gap",
      message: `${noWorkerZips.length} active zip${noWorkerZips.length > 1 ? "s" : ""} have zero workers — demand unmatched.`,
      value: noWorkerZips.length,
    });
    score -= 5;
  }

  // High-demand zips worth a cash drop
  const cashDropZips = zips.filter(z => z.demandJobs >= 2 && z.supplyRatio < 1.0);
  if (cashDropZips.length > 0) {
    alerts.push({
      level: "opportunity",
      type: "cash_drop_opportunity",
      message: `${cashDropZips.length} zip code${cashDropZips.length > 1 ? "s" : ""} have high demand with thin worker supply — Cash Drop would accelerate supply.`,
      value: cashDropZips.length,
    });
  }

  return { alerts, growthScore: Math.max(0, score) };
}

// ── 4. Propose actions ────────────────────────────────────────────────────────

async function proposeGrowthActions(
  zips: ZipInsight[],
  funnel: FunnelMetrics,
): Promise<GrowthMetrics["proposedActions"]> {
  const proposed: GrowthMetrics["proposedActions"] = [];

  // Cash Drop for top 3 under-served high-demand zips
  const cashDropCandidates = zips
    .filter(z => z.demandJobs >= 2 && z.supplyRatio < 1.0)
    .slice(0, 3);

  for (const z of cashDropCandidates) {
    try {
      const action = await proposeAction({
        agentKey: "growth",
        actionType: "schedule.cash_drop",
        payload: {
          zip: z.zip,
          reason: `${z.demandJobs} jobs posted, only ${z.workerCount} workers — ratio ${z.supplyRatio}`,
          suggestedBudget: Math.min(z.demandJobs * 10, 100),
          avgJobValue: z.avgJobValue,
        },
        rationale: `Zip ${z.zip} has ${z.demandJobs} demand jobs but only ${z.workerCount} active workers (ratio: ${z.supplyRatio}). A Cash Drop incentive here would grow supply where it's needed.`,
      });
      proposed.push({ actionType: "schedule.cash_drop", actionId: action.id, zip: z.zip });
      z.cashDropProposed = true;
    } catch { /* non-fatal */ }
  }

  // Outreach batch for zips with zero workers
  const noWorkerZips = zips.filter(z => z.workerCount === 0 && z.demandJobs > 0).slice(0, 5);
  if (noWorkerZips.length > 0) {
    try {
      const action = await proposeAction({
        agentKey: "growth",
        actionType: "queue.outreach",
        payload: {
          targetZips: noWorkerZips.map(z => z.zip),
          outreachType: "worker_recruitment",
          estimatedEmails: noWorkerZips.length * 20,
          message: "Your neighbourhood has jobs waiting — earn on your schedule.",
        },
        rationale: `Zips [${noWorkerZips.map(z => z.zip).join(", ")}] have active hirers but zero workers. A targeted worker-recruitment outreach batch can close the supply gap.`,
      });
      proposed.push({ actionType: "queue.outreach", actionId: action.id });
    } catch { /* non-fatal */ }
  }

  // Growth stall — alert founder
  if (funnel.newUsers7d === 0 && funnel.newUsers30d > 0) {
    try {
      const action = await proposeAction({
        agentKey: "growth",
        actionType: "alert.founder",
        payload: {
          alertType: "growth_stall",
          newUsers7d: funnel.newUsers7d,
          newUsers30d: funnel.newUsers30d,
          message: "No new user registrations in last 7 days. Consider a targeted push campaign.",
        },
        rationale: `User acquisition has stalled — 0 new registrations in 7d vs ${funnel.newUsers30d} in the prior 30d. Founder attention required.`,
      });
      proposed.push({ actionType: "alert.founder", actionId: action.id });
    } catch { /* non-fatal */ }
  }

  return proposed;
}

// ── Executive Summary ─────────────────────────────────────────────────────────

function buildExecutiveSummary(m: Omit<GrowthMetrics, "executiveSummary">): string {
  const lines: string[] = [];

  if (m.funnel.newUsers30d > 0) {
    lines.push(`New users (30d): ${m.funnel.newUsers30d} — ${m.funnel.newUsers7d} this week, ${m.funnel.newUsersToday} today.`);
  } else {
    lines.push("No new user registrations recorded in the last 30 days.");
  }

  if (m.funnel.verifiedRate30d > 0) {
    lines.push(`ID verification rate: ${m.funnel.verifiedRate30d}% of new users. Profile completion: ${m.funnel.profileCompleteRate30d}%.`);
  }

  if (m.funnel.firstJobPostedRate30d > 0 || m.funnel.workerActivationRate30d > 0) {
    lines.push(`Activation: ${m.funnel.firstJobPostedRate30d}% of new hirers posted a job · ${m.funnel.workerActivationRate30d}% of new workers completed a job.`);
  }

  if (m.zipInsights.length > 0) {
    const top = m.zipInsights[0];
    lines.push(`Top demand zip: ${top.zip} — ${top.demandJobs} jobs, ${top.workerCount} workers, avg value $${top.avgJobValue}.`);
  }

  if (m.zipsWithNoWorkers > 0) {
    lines.push(`${m.zipsWithNoWorkers} zip code${m.zipsWithNoWorkers > 1 ? "s" : ""} have active demand but zero registered workers — supply gap opportunity.`);
  }

  if (m.proposedActions.length > 0) {
    const cashDrops  = m.proposedActions.filter(a => a.actionType === "schedule.cash_drop").length;
    const outreaches = m.proposedActions.filter(a => a.actionType === "queue.outreach").length;
    const parts: string[] = [];
    if (cashDrops > 0)  parts.push(`${cashDrops} Cash Drop${cashDrops > 1 ? "s" : ""} proposed`);
    if (outreaches > 0) parts.push(`${outreaches} outreach batch${outreaches > 1 ? "es" : ""} queued`);
    lines.push(`Actions staged for approval: ${parts.join(", ")}.`);
  }

  const opps = m.alerts.filter(a => a.level === "opportunity").length;
  const warns = m.alerts.filter(a => a.level === "warning" || a.level === "critical").length;
  if (warns > 0) lines.push(`${warns} growth warning${warns > 1 ? "s" : ""} require attention.`);
  else if (opps > 0) lines.push(`${opps} growth opportunit${opps > 1 ? "ies" : "y"} identified — no critical issues.`);
  else lines.push("Growth engine nominal — no alerts.");

  return lines.join(" ");
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runGrowthAnalysis(): Promise<GrowthBriefing> {
  const now = new Date();

  const [funnelResult, zipResult] = await Promise.allSettled([
    analyzeFunnel(),
    analyzeZipDensity(),
  ]);

  const funnel: FunnelMetrics = funnelResult.status === "fulfilled"
    ? funnelResult.value
    : { newUsers30d: 0, newUsers7d: 0, newUsersToday: 0, verifiedRate30d: 0, profileCompleteRate30d: 0, firstJobPostedRate30d: 0, workerActivationRate30d: 0 };

  const zips: ZipInsight[] = zipResult.status === "fulfilled" ? zipResult.value : [];

  const noWorkerZips = zips.filter(z => z.workerCount === 0 && z.demandJobs > 0).length;
  const totalSupply  = zips.reduce((s, z) => s + z.workerCount, 0);
  const totalDemand  = zips.reduce((s, z) => s + z.demandJobs, 0);
  const avgRatio     = totalDemand > 0 ? parseFloat((totalSupply / totalDemand).toFixed(2)) : 0;

  const { alerts, growthScore } = buildAlertsAndScore(funnel, zips);

  const proposedActions = await proposeGrowthActions(zips, funnel);

  const partialMetrics: Omit<GrowthMetrics, "executiveSummary"> = {
    generatedAt: now.toISOString(),
    productionOnly: true,
    funnel,
    zipInsights: zips.slice(0, 10),
    totalDemandZips: zips.length,
    zipsWithNoWorkers: noWorkerZips,
    avgPlatformSupplyRatio: avgRatio,
    alerts,
    proposedActions,
    growthScore,
  };

  const executiveSummary = buildExecutiveSummary(partialMetrics);
  const metrics: GrowthMetrics = { ...partialMetrics, executiveSummary };

  const critCount = alerts.filter(a => a.level === "critical").length;
  const warnCount = alerts.filter(a => a.level === "warning").length;
  const priority  = critCount > 0 ? "critical" : warnCount > 0 ? "high" : "normal";

  const dateLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const title = `Growth Briefing — ${dateLabel}`;
  const body  = executiveSummary;

  const [row] = await db
    .insert(osBriefings)
    .values({
      agentKey: "growth",
      period:   "daily",
      title,
      body,
      metrics:  metrics as unknown as Record<string, any>,
      priority,
    })
    .returning();

  return { id: row.id, generatedAt: now.toISOString(), metrics, title, body, priority };
}

export async function getLatestGrowthBriefing(): Promise<GrowthBriefing | null> {
  const [row] = await db
    .select()
    .from(osBriefings)
    .where(eq(osBriefings.agentKey, "growth"))
    .orderBy(desc(osBriefings.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    id:          row.id,
    generatedAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    metrics:     row.metrics as unknown as GrowthMetrics,
    title:       row.title,
    body:        row.body,
    priority:    row.priority,
  };
}
