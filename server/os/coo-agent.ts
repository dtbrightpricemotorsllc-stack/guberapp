import { db } from "../db";
import { sql } from "drizzle-orm";
import { osBriefings } from "@shared/os-schema";
import { desc, eq } from "drizzle-orm";
import { proposeAction } from "./approval-engine";

export type ImpactLevel  = "critical" | "high" | "medium" | "low";
export type DataSourceBadge = "PRODUCTION" | "MIXED" | "UNKNOWN";

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
  // ── Data provenance ──────────────────────────────────────────────────────
  dataSource: DataSourceBadge;
  dataSourceFilters: string[];          // exact SQL predicates applied
  dataSourceCounts: Record<string, number>; // e.g. { real: 481, test: 0 }
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
  productionOnly: boolean;
  dataAudit: Record<string, Record<string, number>>; // category → counts
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safe<T>(r: PromiseSettledResult<T[]>): T[] {
  return r.status === "fulfilled" ? r.value : [];
}

// Standard production user sub-select (applied wherever a user_id FK exists)
// Excludes: is_test_user=true
const PROD_USER_IDS = sql`(SELECT id FROM users WHERE is_test_user = false)`;

// ── 1. Open Disputes ───────────────────────────────────────────────────────────
// Filters: opened_by_user_id IN real users only
// Tables: guber_disputes ⟶ users

async function analyzeDisputes(): Promise<COOFinding[]> {
  // Count real vs excluded so badge is data-backed
  const audit = await db.execute(sql`
    SELECT
      COUNT(*)::int                                              AS real_total,
      COUNT(*) FILTER (WHERE u.is_test_user = true)::int        AS excluded_test
    FROM guber_disputes d
    JOIN users u ON u.id = d.opened_by_user_id
    WHERE d.status = 'open'
  `);
  const a = audit.rows[0] as any;
  const excluded = a.excluded_test ?? 0;
  const badge: DataSourceBadge = excluded === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                           AS total,
      COUNT(*) FILTER (WHERE d.opened_at < NOW() - INTERVAL '48 hours')::int AS stale,
      COUNT(*) FILTER (WHERE d.opened_at < NOW() - INTERVAL '7 days')::int   AS very_stale,
      MIN(d.opened_at)                                                        AS oldest
    FROM guber_disputes d
    JOIN users u ON u.id = d.opened_by_user_id
    WHERE d.status = 'open'
      AND u.is_test_user = false
  `);
  const row = r.rows[0] as any;
  const total = row.total ?? 0;
  if (total === 0) return [];

  const stale     = row.stale      ?? 0;
  const veryStale = row.very_stale ?? 0;
  const oldestDays = row.oldest
    ? Math.floor((Date.now() - new Date(row.oldest).getTime()) / 86400000) : 0;
  const impact: ImpactLevel = veryStale > 0 ? "critical" : total > 2 ? "high" : "medium";

  return [{
    id: "disputes_open",
    category: "disputes",
    categoryLabel: "Open Disputes",
    issue: `${total} open dispute${total > 1 ? "s" : ""}${stale > 0 ? ` — ${stale} open >48h` : ""}`,
    detail: `${total} total · ${stale} open >48h · ${veryStale} open >7 days · oldest: ${oldestDays}d ago`,
    whyItMatters: veryStale > 0
      ? `${veryStale} dispute${veryStale > 1 ? "s are" : " is"} over 7 days old. Risk chargebacks, formal complaints, and direct reputation damage.`
      : `${total} open dispute${total > 1 ? "s" : ""} require attention. Each carries chargeback risk and signals broken trust.`,
    impactLevel: impact,
    recommendation: veryStale > 0
      ? `Immediately review the ${veryStale} dispute${veryStale > 1 ? "s" : ""} older than 7 days. Issue resolution or escalate to legal.`
      : `Review all ${total} open disputes in Admin panel. Prioritize the ${stale} cases open >48h.`,
    data: { total, stale, veryStale, oldestDays },
    score: veryStale > 0 ? 98 : total > 2 ? 85 : 65,
    dataSource: badge,
    dataSourceFilters: ["guber_disputes.status='open'", "users.is_test_user=false"],
    dataSourceCounts: { real: total, excluded_test: excluded },
  }];
}

// ── 2. Stuck Jobs ──────────────────────────────────────────────────────────────
// Filters: is_test_job=false, is_demo=false, posted_by_id IN real users

async function analyzeStuckJobs(): Promise<COOFinding[]> {
  const audit = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE j.is_test_job = false AND j.is_demo = false AND u.is_test_user = false)::int AS real_count,
      COUNT(*) FILTER (WHERE j.is_test_job = true)::int                                                   AS excluded_test_job,
      COUNT(*) FILTER (WHERE j.is_demo = true)::int                                                       AS excluded_demo,
      COUNT(*) FILTER (WHERE u.is_test_user = true)::int                                                  AS excluded_test_user
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.status = 'helper_confirmed'
      AND j.completed_at IS NULL
      AND j.locked_at < NOW() - INTERVAL '48 hours'
  `);
  const a = audit.rows[0] as any;
  const excluded = (a.excluded_test_job ?? 0) + (a.excluded_demo ?? 0) + (a.excluded_test_user ?? 0);
  const badge: DataSourceBadge = excluded === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                                 AS total,
      COUNT(*) FILTER (WHERE j.locked_at < NOW() - INTERVAL '72 hours')::int       AS very_stuck,
      COUNT(*) FILTER (WHERE j.category = 'Verify & Inspect')::int                 AS vi_stuck,
      MIN(j.locked_at)                                                              AS oldest_lock
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.status = 'helper_confirmed'
      AND j.completed_at IS NULL
      AND j.locked_at < NOW() - INTERVAL '48 hours'
      AND j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
  `);
  const row = r.rows[0] as any;
  const total = row.total ?? 0;
  if (total === 0) return [];

  const veryStuck  = row.very_stuck  ?? 0;
  const viStuck    = row.vi_stuck    ?? 0;
  const oldestDays = row.oldest_lock
    ? Math.floor((Date.now() - new Date(row.oldest_lock).getTime()) / 86400000) : 0;
  const impact: ImpactLevel = veryStuck > 3 ? "critical" : total > 5 ? "high" : "medium";

  return [{
    id: "stuck_jobs",
    category: "stuck_jobs",
    categoryLabel: "Stuck Jobs",
    issue: `${total} job${total > 1 ? "s" : ""} confirmed but not completed (>48h locked)`,
    detail: `${total} stuck · ${veryStuck} stuck >72h · ${viStuck} are V&I · oldest locked ${oldestDays}d ago`,
    whyItMatters: `Workers locked in but no completion recorded for >48h. Workers may be waiting for payout, job abandoned off-platform, or payment capture failed. Each is a potential dispute.`,
    impactLevel: impact,
    recommendation: `Review each stuck job in Admin. Check Stripe payment intent status. Initiate manual payout if worker completed work. Prioritize the ${veryStuck} jobs >72h.`,
    data: { total, veryStuck, viStuck, oldestDays },
    score: veryStuck > 3 ? 90 : total > 5 ? 75 : 55,
    dataSource: badge,
    dataSourceFilters: ["jobs.is_test_job=false", "jobs.is_demo=false", "users.is_test_user=false", "locked_at < NOW()-48h", "completed_at IS NULL"],
    dataSourceCounts: { real: a.real_count ?? 0, excluded_test_job: a.excluded_test_job ?? 0, excluded_demo: a.excluded_demo ?? 0, excluded_test_user: a.excluded_test_user ?? 0 },
  }];
}

// ── 3. High Cancellation Users ─────────────────────────────────────────────────
// Filters: is_test_job=false, is_demo=false, posted_by_id IN real users

async function analyzeCancellations(): Promise<COOFinding[]> {
  const audit = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE j.is_test_job = false AND j.is_demo = false AND u.is_test_user = false)::int AS real_cancelled,
      COUNT(*) FILTER (WHERE j.is_test_job = true OR j.is_demo = true OR u.is_test_user = true)::int      AS excluded
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.cancel_reason IS NOT NULL
  `);
  const a = audit.rows[0] as any;
  const badge: DataSourceBadge = (a.excluded ?? 0) === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(DISTINCT j.posted_by_id)::int  AS hirers,
      COUNT(*)::int                        AS total_cancels,
      MAX(cancel_count)::int               AS max_by_one
    FROM (
      SELECT j.posted_by_id, COUNT(*) AS cancel_count
      FROM jobs j
      JOIN users u ON u.id = j.posted_by_id
      WHERE j.cancel_reason IS NOT NULL
        AND j.is_test_job = false
        AND j.is_demo = false
        AND u.is_test_user = false
      GROUP BY j.posted_by_id HAVING COUNT(*) >= 3
    ) t
  `);
  const row = r.rows[0] as any;
  const hirers       = row.hirers        ?? 0;
  const totalCancels = row.total_cancels ?? 0;
  const maxByOne     = row.max_by_one    ?? 0;
  if (hirers === 0) return [];

  return [{
    id: "high_cancellation_hirers",
    category: "cancellations",
    categoryLabel: "High Cancellation Users",
    issue: `${hirers} real hirer${hirers > 1 ? "s" : ""} with 3+ cancellations`,
    detail: `${hirers} hirers · ${totalCancels} total cancellations · worst: ${maxByOne} by one user`,
    whyItMatters: `Repeat cancellations waste worker time and reduce acceptance rates. The top offender cancelled ${maxByOne} times — consistent with abuse or a broken booking flow.`,
    impactLevel: maxByOne >= 5 ? "high" : "medium",
    recommendation: `Review the ${hirers} identified hirer${hirers > 1 ? "s" : ""}. Consider issuing warnings, requiring upfront payment, or restricting further bookings.`,
    data: { hirers, totalCancels, maxByOne },
    score: maxByOne >= 5 ? 72 : 48,
    dataSource: badge,
    dataSourceFilters: ["jobs.is_test_job=false", "jobs.is_demo=false", "users.is_test_user=false", "cancel_reason IS NOT NULL", "≥3 cancellations per hirer"],
    dataSourceCounts: { real_cancelled: a.real_cancelled ?? 0, excluded: a.excluded ?? 0 },
  }];
}

// ── 4. Failed Payment Flows ────────────────────────────────────────────────────
// Filters: is_test_job=false, is_demo=false, posted_by_id IN real users

async function analyzeFailedFlows(): Promise<COOFinding[]> {
  const audit = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE j.is_test_job = false AND j.is_demo = false AND u.is_test_user = false)::int AS real_count,
      COUNT(*) FILTER (WHERE j.is_test_job = true OR j.is_demo = true OR u.is_test_user = true)::int      AS excluded
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.status = 'completed' AND j.is_paid = false AND j.final_price > 0
  `);
  const a = audit.rows[0] as any;
  const badge: DataSourceBadge = (a.excluded ?? 0) === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                       AS count,
      COALESCE(SUM(j.final_price),0)::real AS at_risk
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.status = 'completed'
      AND j.is_paid = false
      AND j.final_price > 0
      AND j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
  `);
  const row = r.rows[0] as any;
  const count  = row.count   ?? 0;
  const atRisk = row.at_risk ?? 0;
  if (count === 0) return [];

  return [{
    id: "failed_payment_flows",
    category: "failed_flows",
    categoryLabel: "Failed Payment Flows",
    issue: `${count} completed real job${count > 1 ? "s" : ""} with payment not captured`,
    detail: `${count} completed + is_paid=false · $${atRisk.toFixed(2)} at-risk worker payout`,
    whyItMatters: `Workers completed jobs but haven't been paid. Every unpaid completed job is earned wages in limbo. If unresolved these become disputes — and word spreads that GUBER doesn't pay.`,
    impactLevel: count > 3 ? "critical" : "high",
    recommendation: `Run a Stripe payment intent lookup for each of the ${count} job${count > 1 ? "s" : ""}. Check for requires_capture intents. $${atRisk.toFixed(2)} in worker payouts at risk.`,
    data: { count, atRisk: parseFloat(atRisk.toFixed(2)) },
    score: count > 3 ? 93 : 80,
    dataSource: badge,
    dataSourceFilters: ["jobs.is_test_job=false", "jobs.is_demo=false", "users.is_test_user=false", "status='completed'", "is_paid=false", "final_price>0"],
    dataSourceCounts: { real_count: a.real_count ?? 0, excluded: a.excluded ?? 0 },
  }];
}

// ── 5. Marketplace Inactivity ──────────────────────────────────────────────────
// Filters: is_sample=false (no user join needed — seller_id links to user)

async function analyzeMarketplaceInactivity(): Promise<COOFinding[]> {
  const audit = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE m.is_sample = false AND u.is_test_user = false)::int AS real_count,
      COUNT(*) FILTER (WHERE m.is_sample = true)::int                             AS excluded_sample,
      COUNT(*) FILTER (WHERE u.is_test_user = true)::int                          AS excluded_test_user
    FROM marketplace_items m
    JOIN users u ON u.id = m.seller_id
    WHERE m.status = 'available'
  `);
  const a = audit.rows[0] as any;
  const excluded = (a.excluded_sample ?? 0) + (a.excluded_test_user ?? 0);
  const badge: DataSourceBadge = excluded === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                  AS stale,
      COUNT(*) FILTER (WHERE m.view_count = 0)::int                 AS zero_views,
      COUNT(*) FILTER (WHERE m.contact_count = 0)::int              AS zero_contacts,
      ROUND(AVG(m.view_count)::numeric, 1)::real                    AS avg_views
    FROM marketplace_items m
    JOIN users u ON u.id = m.seller_id
    WHERE m.status = 'available'
      AND m.is_sample = false
      AND u.is_test_user = false
      AND m.created_at < NOW() - INTERVAL '14 days'
  `);
  const row = r.rows[0] as any;
  const stale       = row.stale         ?? 0;
  const zeroViews   = row.zero_views    ?? 0;
  const zeroContact = row.zero_contacts ?? 0;
  const avgViews    = row.avg_views     ?? 0;
  if (stale === 0) return [];

  return [{
    id: "marketplace_inactivity",
    category: "marketplace",
    categoryLabel: "Marketplace Inactivity",
    issue: `${stale} real listing${stale > 1 ? "s" : ""} stale >14 days${zeroViews > 0 ? ` (${zeroViews} zero views)` : ""}`,
    detail: `${stale} stale · ${zeroViews} zero views · ${zeroContact} zero contacts · avg ${avgViews} views`,
    whyItMatters: `${zeroViews} listings have zero views in 2+ weeks. Stale unviewed inventory signals poor discoverability or inactive sellers. A marketplace that looks empty discourages new buyers.`,
    impactLevel: zeroViews > 5 ? "medium" : "low",
    recommendation: `Identify the ${zeroViews} zero-view listings. Consider: seller nudges to update price/photos, re-indexing stale listings, or archiving from inactive accounts.`,
    data: { stale, zeroViews, zeroContact, avgViews },
    score: zeroViews > 5 ? 38 : 22,
    dataSource: badge,
    dataSourceFilters: ["marketplace_items.is_sample=false", "users.is_test_user=false", "created_at < NOW()-14d"],
    dataSourceCounts: { real: a.real_count ?? 0, excluded_sample: a.excluded_sample ?? 0, excluded_test_user: a.excluded_test_user ?? 0 },
  }];
}

// ── 6. V&I Bottlenecks ────────────────────────────────────────────────────────
// Filters: is_test_job=false, is_demo=false, posted_by_id IN real users

async function analyzeVIBottlenecks(): Promise<COOFinding[]> {
  const audit = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE j.is_test_job = false AND j.is_demo = false AND u.is_test_user = false)::int AS real_count,
      COUNT(*) FILTER (WHERE j.is_test_job = true)::int                                                   AS excluded_test_job,
      COUNT(*) FILTER (WHERE j.is_demo = true)::int                                                       AS excluded_demo,
      COUNT(*) FILTER (WHERE u.is_test_user = true)::int                                                  AS excluded_test_user
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.category = 'Verify & Inspect'
      AND j.status = 'posted_public'
      AND j.is_published = true
  `);
  const a = audit.rows[0] as any;
  const excluded = (a.excluded_test_job ?? 0) + (a.excluded_demo ?? 0) + (a.excluded_test_user ?? 0);
  const badge: DataSourceBadge = excluded === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                                   AS unmatched,
      COUNT(*) FILTER (WHERE j.urgent_switch = true)::int            AS urgent,
      COUNT(*) FILTER (WHERE j.start_time < NOW())::int              AS past_scheduled,
      COUNT(*) FILTER (WHERE j.start_time < NOW() - INTERVAL '72 hours')::int AS very_overdue
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.category = 'Verify & Inspect'
      AND j.status = 'posted_public'
      AND j.is_published = true
      AND j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
  `);
  const row = r.rows[0] as any;
  const unmatched     = row.unmatched      ?? 0;
  const urgent        = row.urgent         ?? 0;
  const pastScheduled = row.past_scheduled ?? 0;
  const veryOverdue   = row.very_overdue   ?? 0;
  if (unmatched === 0) return [];

  const impact: ImpactLevel = (urgent > 0 && pastScheduled > 0) ? "high" : unmatched > 10 ? "medium" : "low";

  return [{
    id: "vi_bottleneck",
    category: "vi_bottleneck",
    categoryLabel: "V&I Bottlenecks",
    issue: `${unmatched} real V&I job${unmatched > 1 ? "s" : ""} published without a worker${urgent > 0 ? ` (${urgent} urgent)` : ""}`,
    detail: `${unmatched} unmatched · ${pastScheduled} past scheduled · ${veryOverdue} overdue >72h · ${urgent} urgent`,
    whyItMatters: `V&I is GUBER's core product differentiator. ${unmatched} buyer-posted, published V&I jobs have no worker. ${urgent > 0 ? `${urgent} are buyer-marked urgent. ` : ""}When V&I supply doesn't meet demand, buyers abandon and competitors fill the gap.`,
    impactLevel: impact,
    recommendation: `Review the ${unmatched} unmatched V&I jobs. ${urgent > 0 ? `Address the ${urgent} urgent listing${urgent > 1 ? "s" : ""} first. ` : ""}Push to nearby V&I workers, lower match radius, or offer a budget boost incentive.`,
    data: { unmatched, urgent, pastScheduled, veryOverdue },
    score: urgent > 0 && pastScheduled > 0 ? 68 : unmatched > 10 ? 45 : 26,
    dataSource: badge,
    dataSourceFilters: ["jobs.is_test_job=false", "jobs.is_demo=false", "users.is_test_user=false", "category='Verify & Inspect'", "status='posted_public'", "is_published=true"],
    dataSourceCounts: { real: a.real_count ?? 0, excluded_test_job: a.excluded_test_job ?? 0, excluded_demo: a.excluded_demo ?? 0, excluded_test_user: a.excluded_test_user ?? 0 },
  }];
}

// ── 7. Load Board Bottlenecks ──────────────────────────────────────────────────
// Filters: poster_id IN real users (no is_test column on this table)

async function analyzeLoadBoard(): Promise<COOFinding[]> {
  const audit = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE u.is_test_user = false)::int AS real_count,
      COUNT(*) FILTER (WHERE u.is_test_user = true)::int  AS excluded_test_user
    FROM load_board_listings l
    JOIN users u ON u.id = l.poster_id
    WHERE l.status = 'posted'
  `);
  const a = audit.rows[0] as any;
  const badge: DataSourceBadge = (a.excluded_test_user ?? 0) === 0 ? "PRODUCTION" : "MIXED";

  const r = await db.execute(sql`
    SELECT
      COUNT(*)::int                                              AS unmatched,
      COUNT(*) FILTER (WHERE l.urgent = true)::int              AS urgent,
      COUNT(*) FILTER (WHERE l.pickup_flexibility = 'asap')::int AS asap
    FROM load_board_listings l
    JOIN users u ON u.id = l.poster_id
    WHERE l.status = 'posted'
      AND l.connected_carrier_id IS NULL
      AND u.is_test_user = false
  `);
  const row = r.rows[0] as any;
  const unmatched = row.unmatched ?? 0;
  const urgent    = row.urgent    ?? 0;
  const asap      = row.asap      ?? 0;
  if (unmatched === 0) return [];

  return [{
    id: "load_board_bottleneck",
    category: "load_board",
    categoryLabel: "Load Board Bottlenecks",
    issue: `${unmatched} real load${unmatched > 1 ? "s" : ""} posted without a carrier`,
    detail: `${unmatched} unmatched · ${urgent} urgent · ${asap} ASAP pickup`,
    whyItMatters: `${unmatched} load board listing${unmatched > 1 ? "s" : ""} have no connected carrier. ${asap > 0 ? `${asap} need ASAP pickup. ` : ""}Posters who don't get matched don't return.`,
    impactLevel: asap > 2 ? "medium" : "low",
    recommendation: `Review the ${unmatched} unmatched listing${unmatched > 1 ? "s" : ""}. ${asap > 0 ? `Prioritize ASAP jobs. ` : ""}Direct carrier outreach or featured placement to close quickly.`,
    data: { unmatched, urgent, asap },
    score: asap > 2 ? 35 : 18,
    dataSource: badge,
    dataSourceFilters: ["users.is_test_user=false", "load_board_listings.status='posted'", "connected_carrier_id IS NULL"],
    dataSourceCounts: { real: a.real_count ?? 0, excluded_test_user: a.excluded_test_user ?? 0 },
  }];
}

// ── 8. Platform Trends ─────────────────────────────────────────────────────────
// Filters: is_test_user=false (users), is_test_job=false + is_demo=false (jobs)

async function analyzePlatformTrends(): Promise<COOFinding[]> {
  const findings: COOFinding[] = [];

  // User growth audit
  const ua = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE is_test_user = false)::int  AS real_users,
      COUNT(*) FILTER (WHERE is_test_user = true)::int   AS excluded_test
    FROM users WHERE deleted_at IS NULL
  `);
  const uAudit = ua.rows[0] as any;
  const userBadge: DataSourceBadge = (uAudit.excluded_test ?? 0) === 0 ? "PRODUCTION" : "MIXED";

  const ur = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int                              AS this_week,
      COUNT(*) FILTER (WHERE created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days')::int AS last_week,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int                             AS this_month
    FROM users WHERE is_test_user = false AND deleted_at IS NULL
  `);
  const ur0      = ur.rows[0] as any;
  const thisWeek = ur0.this_week ?? 0;
  const lastWeek = ur0.last_week ?? 0;
  const growth   = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0;

  if (thisWeek < 3 && lastWeek > 3) {
    findings.push({
      id: "user_growth_decline",
      category: "trends",
      categoryLabel: "Platform Trends",
      issue: `User acquisition slowing: ${thisWeek} new real users this week vs ${lastWeek} last week (${growth}% WoW)`,
      detail: `${thisWeek} this week · ${lastWeek} last week · ${growth}% WoW · ${ur0.this_month} this month`,
      whyItMatters: `Acquisition dropped ${Math.abs(growth)}% week-over-week. Early-stage platforms depend on growth for network effects. A slowdown compounds fast.`,
      impactLevel: "medium",
      recommendation: "Audit acquisition channels for dropoffs. Check referral sources. Consider a targeted outreach or incentive push.",
      data: { thisWeek, lastWeek, growth, thisMonth: ur0.this_month },
      score: 42,
      dataSource: userBadge,
      dataSourceFilters: ["users.is_test_user=false", "users.deleted_at IS NULL"],
      dataSourceCounts: { real_users: uAudit.real_users ?? 0, excluded_test: uAudit.excluded_test ?? 0 },
    });
  }

  // Job cancellation rate audit
  const ja = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE j.is_test_job = false AND j.is_demo = false AND u.is_test_user = false)::int AS real_jobs,
      COUNT(*) FILTER (WHERE j.is_test_job = true OR j.is_demo = true OR u.is_test_user = true)::int      AS excluded
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.locked_at IS NOT NULL AND j.locked_at > NOW() - INTERVAL '30 days'
  `);
  const jAudit = ja.rows[0] as any;
  const jobBadge: DataSourceBadge = (jAudit.excluded ?? 0) === 0 ? "PRODUCTION" : "MIXED";

  const jr = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE j.status = 'completed')::int      AS completed,
      COUNT(*) FILTER (WHERE j.cancel_reason IS NOT NULL)::int AS cancelled,
      COUNT(*)::int                                            AS total
    FROM jobs j
    JOIN users u ON u.id = j.posted_by_id
    WHERE j.is_test_job = false
      AND j.is_demo = false
      AND u.is_test_user = false
      AND j.locked_at IS NOT NULL
      AND j.locked_at > NOW() - INTERVAL '30 days'
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
      issue: `High real-job cancellation rate: ${cancelRate}% of locked jobs cancelled (last 30d)`,
      detail: `${completed} completed · ${cancelled} cancelled · ${total} locked · ${cancelRate}% cancel rate`,
      whyItMatters: `${cancelRate}% of matched real jobs are being cancelled — significantly above a healthy <10% rate. Directly hits worker earnings and platform revenue.`,
      impactLevel: cancelRate > 40 ? "high" : "medium",
      recommendation: "Analyze cancellation root causes by category and cancel stage. Enforce fees for post-acceptance cancellations.",
      data: { completed, cancelled, total, cancelRate },
      score: cancelRate > 40 ? 65 : 36,
      dataSource: jobBadge,
      dataSourceFilters: ["jobs.is_test_job=false", "jobs.is_demo=false", "users.is_test_user=false", "locked_at > NOW()-30d"],
      dataSourceCounts: { real_jobs: jAudit.real_jobs ?? 0, excluded: jAudit.excluded ?? 0 },
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
  for (const f of allFindings) categoryCounts[f.category] = (categoryCounts[f.category] ?? 0) + 1;

  // Data audit summary (category → counts)
  const dataAudit: Record<string, Record<string, number>> = {};
  for (const f of allFindings) dataAudit[f.id] = f.dataSourceCounts;

  // Are all findings production-only?
  const productionOnly = allFindings.every(f => f.dataSource === "PRODUCTION");
  const mixedCount = allFindings.filter(f => f.dataSource === "MIXED").length;

  const critCount = allFindings.filter(f => f.impactLevel === "critical").length;
  const highCount = allFindings.filter(f => f.impactLevel === "high").length;
  const executiveSummary = buildSummary(allFindings, health, critCount, highCount, productionOnly);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const [row] = await db.insert(osBriefings).values({
    agentKey: "coo",
    period: "daily",
    title: `COO Briefing — ${dateStr}`,
    body: executiveSummary,
    metrics: { healthScore: health, categoryCounts, findings: allFindings, productionOnly, dataAudit } as any,
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
    productionOnly,
    dataAudit,
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
    productionOnly: m?.productionOnly ?? false,
    dataAudit: m?.dataAudit ?? {},
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
      dataSource: finding.dataSource,
      dataSourceFilters: finding.dataSourceFilters,
      dataSourceCounts: finding.dataSourceCounts,
      data: finding.data,
    },
    rationale: `COO Agent [${finding.dataSource}]: ${finding.issue}. ${finding.whyItMatters}`,
  });
  return action.id;
}

function buildSummary(
  findings: COOFinding[], health: number,
  critical: number, high: number, productionOnly: boolean,
): string {
  const dataNote = productionOnly
    ? "All data is production-only (test/demo/sample records excluded)."
    : "Note: some data sources contain mixed real/test records — review badges.";
  if (findings.length === 0)
    return `Platform health score: ${health}/100. No operational issues detected. ${dataNote}`;
  const top = findings[0];
  const catCount = new Set(findings.map(f => f.category)).size;
  return [
    `Platform health score: ${health}/100.`,
    critical > 0 ? `${critical} critical issue${critical > 1 ? "s" : ""} require immediate action.`
      : high > 0 ? `${high} high-impact issue${high > 1 ? "s" : ""} detected.`
      : "No critical issues.",
    `${findings.length} finding${findings.length > 1 ? "s" : ""} across ${catCount} area${catCount > 1 ? "s" : ""}.`,
    `Top priority: ${top.issue}.`,
    dataNote,
  ].join(" ");
}
