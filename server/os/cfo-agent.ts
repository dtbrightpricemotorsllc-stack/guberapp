/**
 * server/os/cfo-agent.ts
 * CFO Agent — financial intelligence for GUBER OS.
 *
 * All SQL queries are production-only:
 *   users.is_test_user = false
 *   users.email NOT ILIKE '%@guberapp.internal'
 *   jobs.is_test_job = false, jobs.is_demo = false
 *
 * No LLM calls — all analysis is deterministic SQL + rule-based text generation.
 */

import Stripe from "stripe";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { osBriefings } from "@shared/os-schema";
import { desc, eq } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export interface CFOAlert {
  severity: AlertSeverity;
  type: string;
  message: string;
  value?: number;
  valueLabel?: string;
}

export interface CFOMetrics {
  generatedAt: string;
  productionOnly: boolean;

  revenue: {
    gmv30d: number;
    gmv7d: number;
    gmv24h: number;
    platformFees30d: number;
    platformFees7d: number;
    platformFees24h: number;
    workerPayouts30d: number;
    workerPayouts7d: number;
    refunds30d: number;
    refundRate30d: number;
    netRevenue30d: number;
    feeMargin30d: number;
  };

  jobs: {
    completed30d: number;
    completed7d: number;
    avgJobValue30d: number;
    unpaidCompleted: number;
    unpaidValue: number;
    topCategories: Array<{
      category: string;
      count: number;
      totalValue: number;
      avgValue: number;
    }>;
  };

  studio: {
    creditsConsumed30d: number;
    generations30d: number;
    activeSubscriptions: number;
    paidTierUsers: number;
  };

  stripe: {
    availableBalance: number | null;
    pendingBalance: number | null;
    currency: string;
    reachable: boolean;
    error?: string;
  };

  alerts: CFOAlert[];
  healthScore: number;
  executiveSummary: string;
}

export interface CFOBriefing {
  id?: number;
  generatedAt: string;
  metrics: CFOMetrics;
  title: string;
  body: string;
  priority: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safe<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === "fulfilled" ? r.value : fallback;
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── 1. Revenue Analysis ───────────────────────────────────────────────────────
// Source: wallet_transactions → joined to users for prod filter

async function analyzeRevenue() {
  const r = await db.execute(sql`
    SELECT
      COALESCE(SUM(wt.amount) FILTER (
        WHERE wt.type IN ('job_payment','vi_payment')
          AND wt.created_at > NOW() - INTERVAL '30 days'
      ), 0)::float AS gmv_30d,

      COALESCE(SUM(wt.amount) FILTER (
        WHERE wt.type IN ('job_payment','vi_payment')
          AND wt.created_at > NOW() - INTERVAL '7 days'
      ), 0)::float AS gmv_7d,

      COALESCE(SUM(wt.amount) FILTER (
        WHERE wt.type IN ('job_payment','vi_payment')
          AND wt.created_at > NOW() - INTERVAL '24 hours'
      ), 0)::float AS gmv_24h,

      COALESCE(SUM(ABS(wt.amount)) FILTER (
        WHERE wt.type = 'payout'
          AND wt.created_at > NOW() - INTERVAL '30 days'
      ), 0)::float AS payouts_30d,

      COALESCE(SUM(ABS(wt.amount)) FILTER (
        WHERE wt.type = 'payout'
          AND wt.created_at > NOW() - INTERVAL '7 days'
      ), 0)::float AS payouts_7d,

      COALESCE(SUM(ABS(wt.amount)) FILTER (
        WHERE wt.type = 'refund'
          AND wt.created_at > NOW() - INTERVAL '30 days'
      ), 0)::float AS refunds_30d
    FROM wallet_transactions wt
    JOIN users u ON u.id = wt.user_id
    WHERE u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
  `);
  const row = r.rows[0] as any;
  return {
    gmv30d:        parseFloat(row.gmv_30d   ?? "0"),
    gmv7d:         parseFloat(row.gmv_7d    ?? "0"),
    gmv24h:        parseFloat(row.gmv_24h   ?? "0"),
    payouts30d:    parseFloat(row.payouts_30d ?? "0"),
    payouts7d:     parseFloat(row.payouts_7d  ?? "0"),
    refunds30d:    parseFloat(row.refunds_30d ?? "0"),
  };
}

// ── 2. Platform Fees (from guber_payments) ────────────────────────────────────
// guber_payments joins on payer_user_id for prod filter

async function analyzeGuberFees() {
  try {
    const r = await db.execute(sql`
      SELECT
        COALESCE(SUM(gp.platform_fee_amount) FILTER (
          WHERE gp.created_at > NOW() - INTERVAL '30 days'
        ), 0)::float AS fees_30d,

        COALESCE(SUM(gp.platform_fee_amount) FILTER (
          WHERE gp.created_at > NOW() - INTERVAL '7 days'
        ), 0)::float AS fees_7d,

        COALESCE(SUM(gp.platform_fee_amount) FILTER (
          WHERE gp.created_at > NOW() - INTERVAL '24 hours'
        ), 0)::float AS fees_24h
      FROM guber_payments gp
      JOIN users u ON u.id = gp.payer_user_id
      WHERE u.is_test_user = false
        AND u.email NOT ILIKE '%@guberapp.internal'
    `);
    const row = r.rows[0] as any;
    return {
      fees30d: parseFloat(row.fees_30d ?? "0"),
      fees7d:  parseFloat(row.fees_7d  ?? "0"),
      fees24h: parseFloat(row.fees_24h ?? "0"),
    };
  } catch {
    return { fees30d: 0, fees7d: 0, fees24h: 0 };
  }
}

// ── 3. Job Economics ──────────────────────────────────────────────────────────

async function analyzeJobEconomics() {
  const r = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE j.status = 'completed'
          AND j.completed_at > NOW() - INTERVAL '30 days'
      )::int AS completed_30d,

      COUNT(*) FILTER (
        WHERE j.status = 'completed'
          AND j.completed_at > NOW() - INTERVAL '7 days'
      )::int AS completed_7d,

      COALESCE(AVG(j.final_price) FILTER (
        WHERE j.status = 'completed'
          AND j.final_price > 0
          AND j.completed_at > NOW() - INTERVAL '30 days'
      ), 0)::float AS avg_job_value_30d,

      COUNT(*) FILTER (
        WHERE j.status = 'completed'
          AND j.is_paid = false
          AND j.final_price > 0
      )::int AS unpaid_completed,

      COALESCE(SUM(j.final_price) FILTER (
        WHERE j.status = 'completed'
          AND j.is_paid = false
          AND j.final_price > 0
      ), 0)::float AS unpaid_value
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
  `);
  const row = r.rows[0] as any;

  // Top categories by GMV (last 30d)
  const catR = await db.execute(sql`
    SELECT
      j.category,
      COUNT(*)::int           AS cnt,
      COALESCE(SUM(j.final_price), 0)::float AS total_value,
      COALESCE(AVG(j.final_price), 0)::float AS avg_value
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.status = 'completed'
      AND j.final_price > 0
      AND j.completed_at > NOW() - INTERVAL '30 days'
      AND j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
      AND u.email NOT ILIKE '%@guberapp.internal'
    GROUP BY j.category
    ORDER BY total_value DESC
    LIMIT 5
  `);

  return {
    completed30d:    row.completed_30d    ?? 0,
    completed7d:     row.completed_7d     ?? 0,
    avgJobValue30d:  parseFloat(row.avg_job_value_30d ?? "0"),
    unpaidCompleted: row.unpaid_completed ?? 0,
    unpaidValue:     parseFloat(row.unpaid_value ?? "0"),
    topCategories:   catR.rows.map((c: any) => ({
      category:   c.category ?? "Unknown",
      count:      c.cnt ?? 0,
      totalValue: parseFloat(c.total_value ?? "0"),
      avgValue:   parseFloat(c.avg_value   ?? "0"),
    })),
  };
}

// ── 4. Studio Economics ───────────────────────────────────────────────────────

async function analyzeStudioEconomics() {
  try {
    const genR = await db.execute(sql`
      SELECT
        COALESCE(SUM(sgl.credits_cost), 0)::int AS credits_consumed,
        COUNT(*)::int AS generations
      FROM studio_generation_log sgl
      JOIN users u ON u.id = sgl.user_id
      WHERE sgl.created_at > NOW() - INTERVAL '30 days'
        AND u.is_test_user = false
        AND u.email NOT ILIKE '%@guberapp.internal'
    `);
    const gen = genR.rows[0] as any;

    const subR = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE studio_tier != 'free')::int AS paid_tier_users,
        COUNT(*) FILTER (
          WHERE studio_subscription_status = 'active'
        )::int AS active_subs
      FROM users
      WHERE is_test_user = false
        AND email NOT ILIKE '%@guberapp.internal'
        AND deleted_at IS NULL
    `);
    const sub = subR.rows[0] as any;

    return {
      creditsConsumed30d: gen.credits_consumed ?? 0,
      generations30d:     gen.generations      ?? 0,
      activeSubscriptions: sub.active_subs     ?? 0,
      paidTierUsers:       sub.paid_tier_users ?? 0,
    };
  } catch {
    return { creditsConsumed30d: 0, generations30d: 0, activeSubscriptions: 0, paidTierUsers: 0 };
  }
}

// ── 5. Stripe Balance ─────────────────────────────────────────────────────────

async function analyzeStripeBalance(): Promise<CFOMetrics["stripe"]> {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_CONNECT_SECRET_KEY;
  if (!key) {
    return { availableBalance: null, pendingBalance: null, currency: "usd", reachable: false, error: "STRIPE_SECRET_KEY not set" };
  }
  try {
    const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
    const balance = await stripe.balance.retrieve();
    const avail = balance.available.find(b => b.currency === "usd");
    const pend  = balance.pending.find(b => b.currency === "usd");
    return {
      availableBalance: avail ? avail.amount / 100 : 0,
      pendingBalance:   pend  ? pend.amount  / 100 : 0,
      currency: "usd",
      reachable: true,
    };
  } catch (e: any) {
    return { availableBalance: null, pendingBalance: null, currency: "usd", reachable: false, error: e?.message ?? "Stripe unreachable" };
  }
}

// ── Alerts + Health Score ──────────────────────────────────────────────────────

function buildAlertsAndScore(
  jobData: Awaited<ReturnType<typeof analyzeJobEconomics>>,
  revenue: {
    gmv30d: number; refunds30d: number; payouts30d: number;
    fees30d: number;
  },
  stripe: CFOMetrics["stripe"],
): { alerts: CFOAlert[]; healthScore: number } {
  const alerts: CFOAlert[] = [];
  let score = 100;

  // Failed captures — critical financial risk
  if (jobData.unpaidCompleted > 0) {
    const sev: AlertSeverity = jobData.unpaidCompleted > 3 ? "critical" : "high";
    alerts.push({
      severity: sev,
      type: "failed_capture",
      message: `${jobData.unpaidCompleted} completed job${jobData.unpaidCompleted > 1 ? "s" : ""} with payment not captured — ${fmtUsd(jobData.unpaidValue)} at risk`,
      value: jobData.unpaidValue,
      valueLabel: "at risk",
    });
    score -= jobData.unpaidCompleted > 3 ? 25 : 15;
  }

  // High refund rate
  if (revenue.gmv30d > 0) {
    const refundRate = (revenue.refunds30d / revenue.gmv30d) * 100;
    if (refundRate > 15) {
      alerts.push({
        severity: "critical",
        type: "refund_rate",
        message: `Refund rate ${refundRate.toFixed(1)}% of GMV over last 30d — ${fmtUsd(revenue.refunds30d)} in refunds`,
        value: refundRate,
        valueLabel: "% refund rate",
      });
      score -= 20;
    } else if (refundRate > 8) {
      alerts.push({
        severity: "high",
        type: "refund_rate",
        message: `Elevated refund rate ${refundRate.toFixed(1)}% of GMV — ${fmtUsd(revenue.refunds30d)} refunded`,
        value: refundRate,
        valueLabel: "% refund rate",
      });
      score -= 10;
    }
  }

  // Stripe unreachable
  if (!stripe.reachable) {
    alerts.push({
      severity: "critical",
      type: "stripe_unreachable",
      message: `Stripe API unreachable: ${stripe.error ?? "unknown error"}`,
    });
    score -= 20;
  }

  // Low Stripe balance
  if (stripe.reachable && stripe.availableBalance !== null && stripe.availableBalance < 500) {
    alerts.push({
      severity: stripe.availableBalance < 100 ? "critical" : "medium",
      type: "low_stripe_balance",
      message: `Stripe available balance low: ${fmtUsd(stripe.availableBalance)}`,
      value: stripe.availableBalance,
      valueLabel: "available",
    });
    score -= stripe.availableBalance < 100 ? 15 : 5;
  }

  // Zero GMV last 7 days but there's been historical activity
  if (revenue.gmv30d > 0 && revenue.fees30d === 0 && revenue.gmv30d > 100) {
    alerts.push({
      severity: "medium",
      type: "no_platform_fee",
      message: "No platform fees recorded in guber_payments — fee capture may not be running",
    });
    score -= 5;
  }

  // Zero completed jobs last 7d
  if (jobData.completed7d === 0 && jobData.completed30d > 0) {
    alerts.push({
      severity: "medium",
      type: "no_completions_7d",
      message: `No job completions in last 7 days (${jobData.completed30d} in last 30d)`,
    });
    score -= 8;
  }

  return { alerts, healthScore: Math.max(0, score) };
}

// ── Executive Summary ─────────────────────────────────────────────────────────

function buildExecutiveSummary(m: Omit<CFOMetrics, "executiveSummary" | "healthScore">): string {
  const lines: string[] = [];

  const hasGmv = m.revenue.gmv30d > 0;
  lines.push(
    hasGmv
      ? `Platform GMV (30d): ${fmtUsd(m.revenue.gmv30d)} | 7d: ${fmtUsd(m.revenue.gmv7d)} | 24h: ${fmtUsd(m.revenue.gmv24h)}.`
      : "No payment volume recorded in the last 30 days."
  );

  if (m.revenue.platformFees30d > 0) {
    lines.push(`Platform fees collected (30d): ${fmtUsd(m.revenue.platformFees30d)} — ${fmtUsd(m.revenue.feeMargin30d > 0 ? m.revenue.platformFees30d : 0)} net after refunds.`);
  }

  if (m.revenue.refunds30d > 0 && m.revenue.refundRate30d > 0) {
    lines.push(`Refunds: ${fmtUsd(m.revenue.refunds30d)} (${m.revenue.refundRate30d.toFixed(1)}% of GMV).`);
  }

  if (m.jobs.completed30d > 0) {
    lines.push(`Jobs completed (30d): ${m.jobs.completed30d.toLocaleString()} — avg value ${fmtUsd(m.jobs.avgJobValue30d)}.`);
  }

  if (m.jobs.unpaidCompleted > 0) {
    lines.push(`⚠ ${m.jobs.unpaidCompleted} completed job${m.jobs.unpaidCompleted > 1 ? "s" : ""} with payment not captured — ${fmtUsd(m.jobs.unpaidValue)} in worker payouts at risk.`);
  }

  if (m.stripe.reachable) {
    lines.push(`Stripe balance — available: ${fmtUsd(m.stripe.availableBalance ?? 0)} | pending: ${fmtUsd(m.stripe.pendingBalance ?? 0)}.`);
  } else {
    lines.push(`⚠ Stripe API unreachable at time of briefing.`);
  }

  if (m.studio.paidTierUsers > 0) {
    lines.push(`Studio: ${m.studio.paidTierUsers} paid-tier user${m.studio.paidTierUsers > 1 ? "s" : ""} | ${m.studio.creditsConsumed30d.toLocaleString()} credits consumed (30d) | ${m.studio.generations30d} generations.`);
  }

  const criticalCount = m.alerts.filter(a => a.severity === "critical").length;
  const highCount     = m.alerts.filter(a => a.severity === "high").length;
  if (criticalCount > 0 || highCount > 0) {
    lines.push(`Requires attention: ${criticalCount} critical + ${highCount} high-priority financial alerts.`);
  } else if (m.alerts.length === 0) {
    lines.push("No financial alerts — all systems operating normally.");
  }

  return lines.join(" ");
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function runCFOAnalysis(): Promise<CFOBriefing> {
  const now = new Date();

  const [
    revenueResult,
    feesResult,
    jobsResult,
    studioResult,
    stripeResult,
  ] = await Promise.allSettled([
    analyzeRevenue(),
    analyzeGuberFees(),
    analyzeJobEconomics(),
    analyzeStudioEconomics(),
    analyzeStripeBalance(),
  ]);

  const revenue = safe(revenueResult, {
    gmv30d: 0, gmv7d: 0, gmv24h: 0,
    payouts30d: 0, payouts7d: 0, refunds30d: 0,
  });
  const fees = safe(feesResult, { fees30d: 0, fees7d: 0, fees24h: 0 });
  const jobs = safe(jobsResult, {
    completed30d: 0, completed7d: 0, avgJobValue30d: 0,
    unpaidCompleted: 0, unpaidValue: 0, topCategories: [],
  });
  const studio = safe(studioResult, {
    creditsConsumed30d: 0, generations30d: 0, activeSubscriptions: 0, paidTierUsers: 0,
  });
  const stripe = safe(stripeResult as PromiseSettledResult<CFOMetrics["stripe"]>, {
    availableBalance: null, pendingBalance: null, currency: "usd", reachable: false, error: "Analysis failed",
  });

  const refundRate = revenue.gmv30d > 0
    ? parseFloat(((revenue.refunds30d / revenue.gmv30d) * 100).toFixed(2))
    : 0;

  const netRevenue30d  = fees.fees30d - revenue.refunds30d;
  const feeMargin30d   = revenue.gmv30d > 0
    ? parseFloat(((fees.fees30d / revenue.gmv30d) * 100).toFixed(2))
    : 0;

  const partialMetrics = {
    generatedAt: now.toISOString(),
    productionOnly: true,
    revenue: {
      gmv30d:          revenue.gmv30d,
      gmv7d:           revenue.gmv7d,
      gmv24h:          revenue.gmv24h,
      platformFees30d: fees.fees30d,
      platformFees7d:  fees.fees7d,
      platformFees24h: fees.fees24h,
      workerPayouts30d: revenue.payouts30d,
      workerPayouts7d:  revenue.payouts7d,
      refunds30d:       revenue.refunds30d,
      refundRate30d:    refundRate,
      netRevenue30d:    netRevenue30d,
      feeMargin30d:     feeMargin30d,
    },
    jobs: {
      completed30d:    jobs.completed30d,
      completed7d:     jobs.completed7d,
      avgJobValue30d:  jobs.avgJobValue30d,
      unpaidCompleted: jobs.unpaidCompleted,
      unpaidValue:     jobs.unpaidValue,
      topCategories:   jobs.topCategories,
    },
    studio: {
      creditsConsumed30d: studio.creditsConsumed30d,
      generations30d:     studio.generations30d,
      activeSubscriptions: studio.activeSubscriptions,
      paidTierUsers:      studio.paidTierUsers,
    },
    stripe,
  };

  const { alerts, healthScore } = buildAlertsAndScore(
    jobs,
    { gmv30d: revenue.gmv30d, refunds30d: revenue.refunds30d, payouts30d: revenue.payouts30d, fees30d: fees.fees30d },
    stripe,
  );

  const executiveSummary = buildExecutiveSummary({ ...partialMetrics, alerts });

  const metrics: CFOMetrics = {
    ...partialMetrics,
    alerts,
    healthScore,
    executiveSummary,
  };

  // Determine priority
  const critCount = alerts.filter(a => a.severity === "critical").length;
  const highCount = alerts.filter(a => a.severity === "high").length;
  const priority  = critCount > 0 ? "critical" : highCount > 0 ? "high" : "normal";

  const dateLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const title = `CFO Briefing — ${dateLabel}`;
  const body  = executiveSummary;

  const [row] = await db
    .insert(osBriefings)
    .values({
      agentKey: "cfo",
      period:   "daily",
      title,
      body,
      metrics:  metrics as unknown as Record<string, any>,
      priority,
    })
    .returning();

  return { id: row.id, generatedAt: now.toISOString(), metrics, title, body, priority };
}

// ── Read Latest ───────────────────────────────────────────────────────────────

export async function getLatestCFOBriefing(): Promise<CFOBriefing | null> {
  const [row] = await db
    .select()
    .from(osBriefings)
    .where(eq(osBriefings.agentKey, "cfo"))
    .orderBy(desc(osBriefings.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    id:           row.id,
    generatedAt:  row.createdAt?.toISOString() ?? new Date().toISOString(),
    metrics:      row.metrics as unknown as CFOMetrics,
    title:        row.title,
    body:         row.body,
    priority:     row.priority,
  };
}
