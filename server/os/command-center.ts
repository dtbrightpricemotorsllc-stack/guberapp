/**
 * server/os/command-center.ts
 * Aggregates all operational, business, growth, and admin metrics
 * for the GUBER Command Center dashboard.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import type { CheckResult } from "./health-checks";

export type MetricItem = CheckResult; // same shape — unified type

type S = "healthy" | "warning" | "critical" | "unknown";

const now = () => new Date().toISOString();

function good(key: string, name: string, value: string | number | null, detail: string): MetricItem {
  return { key, name, status: "healthy", value, detail, lastSuccess: now(), lastFailure: null, failureReason: null, recommendedAction: null };
}
function bad(key: string, name: string, value: string | number | null, detail: string, action: string | null, status: S = "warning"): MetricItem {
  return { key, name, status, value, detail, lastSuccess: null, lastFailure: now(), failureReason: detail, recommendedAction: action };
}
function err(key: string, name: string, reason: string): MetricItem {
  return { key, name, status: "critical", value: null, detail: `Query failed: ${reason}`, lastSuccess: null, lastFailure: now(), failureReason: reason, recommendedAction: "Check server logs." };
}

// ── OPERATIONS ────────────────────────────────────────────────────────────────

export async function getOperationsData(): Promise<MetricItem[]> {
  const items: MetricItem[] = [];

  // Users
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_today,
        COUNT(*) FILTER (WHERE banned = true)::int AS banned,
        COUNT(*) FILTER (WHERE under_review = true)::int AS under_review,
        COUNT(*) FILTER (WHERE suspended = true)::int AS suspended
      FROM users WHERE deleted_at IS NULL
    `);
    const row = r.rows[0] as any;
    const total = row.total ?? 0;
    const banned = row.banned ?? 0;
    const banPct = total > 0 ? (banned / total) * 100 : 0;
    const status: S = banPct > 5 ? "warning" : "healthy";
    const item = good("users", "Users", total,
      `${total} total · ${row.new_today ?? 0} new today · ${banned} banned · ${row.under_review ?? 0} under review · ${row.suspended ?? 0} suspended`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = `Ban rate ${banPct.toFixed(1)}% — review recent bans.`;
    }
    items.push(item);
  } catch (e: any) { items.push(err("users", "Users", e?.message ?? "Unknown")); }

  // Jobs
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'posted_public')::int AS open,
        COUNT(*) FILTER (WHERE status = 'helper_confirmed')::int AS active,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'disputed')::int AS disputed,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_today
      FROM jobs WHERE is_test_job = false
    `);
    const row = r.rows[0] as any;
    const total = row.total ?? 0;
    const disputed = row.disputed ?? 0;
    const disputePct = total > 0 ? (disputed / total) * 100 : 0;
    const status: S = disputePct > 10 ? "critical" : disputePct > 5 ? "warning" : "healthy";
    const item = good("jobs", "Jobs", total,
      `${row.open ?? 0} open · ${row.active ?? 0} active · ${row.completed ?? 0} completed · ${disputed} disputed · ${row.new_today ?? 0} new today`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = `Dispute rate ${disputePct.toFixed(1)}% — review open disputes immediately.`;
    }
    items.push(item);
  } catch (e: any) { items.push(err("jobs", "Jobs", e?.message ?? "Unknown")); }

  // Marketplace
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'available')::int AS active,
        COUNT(*) FILTER (WHERE status = 'sold')::int AS sold,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_today
      FROM marketplace_items
    `);
    const row = r.rows[0] as any;
    items.push(good("marketplace", "Marketplace", row.active ?? 0,
      `${row.active ?? 0} active listings · ${row.sold ?? 0} sold · ${row.new_today ?? 0} listed today`));
  } catch (e: any) { items.push(err("marketplace", "Marketplace", e?.message ?? "Unknown")); }

  // Verify & Inspect
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE category = 'Verify & Inspect'
          AND status IN ('posted_public','helper_confirmed'))::int AS active,
        COUNT(*) FILTER (WHERE category = 'Verify & Inspect' AND status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE category = 'Verify & Inspect' AND status = 'disputed')::int AS disputed
      FROM jobs WHERE is_test_job = false
    `);
    const row = r.rows[0] as any;
    items.push(good("vi", "Verify & Inspect", row.active ?? 0,
      `${row.active ?? 0} active · ${row.completed ?? 0} completed · ${row.disputed ?? 0} disputed`));
  } catch (e: any) { items.push(err("vi", "Verify & Inspect", e?.message ?? "Unknown")); }

  // Load Board
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'posted')::int AS open,
        COUNT(*) FILTER (WHERE status = 'accepted')::int AS accepted,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS new_today
      FROM load_board_listings
    `);
    const row = r.rows[0] as any;
    items.push(good("load_board", "Load Board", row.open ?? 0,
      `${row.open ?? 0} open · ${row.accepted ?? 0} accepted · ${row.new_today ?? 0} posted today`));
  } catch (e: any) { items.push(err("load_board", "Load Board", e?.message ?? "Unknown")); }

  // AI or Not
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE ai_or_not_credits > 0)::int AS with_credits,
        COALESCE(SUM(ai_or_not_credits),0)::int AS total_credits,
        COUNT(*) FILTER (WHERE ai_or_not_unlimited_text = true)::int AS unlimited
      FROM users WHERE deleted_at IS NULL AND banned = false
    `);
    const row = r.rows[0] as any;
    items.push(good("ai_or_not", "AI or Not", row.with_credits ?? 0,
      `${row.with_credits ?? 0} users with credits · ${row.total_credits ?? 0} credits in circulation · ${row.unlimited ?? 0} unlimited`));
  } catch (e: any) { items.push(err("ai_or_not", "AI or Not", e?.message ?? "Unknown")); }

  // GUBER Studio
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS sessions_24h,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_now
      FROM studio_sessions WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const row = r.rows[0] as any;
    const falOk = !!process.env.FAL_KEY;
    const item = good("studio", "GUBER Studio", `${row.sessions_24h ?? 0} sessions`,
      `${row.sessions_24h ?? 0} sessions (24h) · ${row.active_now ?? 0} active · FAL.ai: ${falOk ? "configured" : "NOT SET"}`);
    if (!falOk) { item.status = "critical"; item.recommendedAction = "Set FAL_KEY — generation returns 503 without it."; }
    items.push(item);
  } catch (e: any) { items.push(err("studio", "GUBER Studio", e?.message ?? "Unknown")); }

  return items;
}

// ── BUSINESS ──────────────────────────────────────────────────────────────────

export async function getBusinessData(): Promise<MetricItem[]> {
  const items: MetricItem[] = [];

  // Revenue today
  try {
    const r = await db.execute(sql`
      SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0),0)::float AS gmv
      FROM wallet_transactions
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND type IN ('job_payment','vi_payment','studio_credit_purchase','trust_box_purchase','studio_subscription')
    `);
    const row = r.rows[0] as any;
    const v = parseFloat(row.gmv ?? "0");
    items.push(good("revenue_today", "Revenue Today", `$${v.toFixed(2)}`, `$${v.toFixed(2)} GMV in the last 24 hours`));
  } catch (e: any) { items.push(err("revenue_today", "Revenue Today", e?.message ?? "Unknown")); }

  // Revenue this month + refunds
  try {
    const r = await db.execute(sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE amount > 0
          AND type IN ('job_payment','vi_payment','studio_credit_purchase','trust_box_purchase','studio_subscription')),0)::float AS gmv,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE type = 'refund'),0)::float AS refunds
      FROM wallet_transactions
      WHERE created_at > DATE_TRUNC('month', NOW())
    `);
    const row = r.rows[0] as any;
    const gmv = parseFloat(row.gmv ?? "0");
    const refunds = parseFloat(row.refunds ?? "0");
    const refundPct = gmv > 0 ? (refunds / gmv) * 100 : 0;
    items.push(good("revenue_month", "Revenue This Month", `$${gmv.toFixed(2)}`,
      `$${gmv.toFixed(2)} GMV this month · $${refunds.toFixed(2)} refunded`));
    const refundStatus: S = refundPct > 15 ? "critical" : refundPct > 5 ? "warning" : "healthy";
    const refundItem = good("refunds", "Refunds", `$${refunds.toFixed(2)}`,
      `$${refunds.toFixed(2)} refunded this month (${refundPct.toFixed(1)}% of GMV)`);
    if (refundStatus !== "healthy") {
      refundItem.status = refundStatus;
      refundItem.recommendedAction = "High refund rate — review dispute resolutions and refund patterns.";
    }
    items.push(refundItem);
  } catch (e: any) {
    items.push(err("revenue_month", "Revenue This Month", e?.message ?? "Unknown"));
    items.push(err("refunds", "Refunds", e?.message ?? "Unknown"));
  }

  // Platform fees collected
  try {
    const r = await db.execute(sql`
      SELECT COALESCE(SUM(platform_fee_amount),0)::float AS fees
      FROM guber_payments
      WHERE created_at > DATE_TRUNC('month', NOW())
    `);
    const row = r.rows[0] as any;
    const fees = parseFloat(row.fees ?? "0");
    items.push(good("stripe_fees", "Platform Fees (Month)", `$${fees.toFixed(2)}`,
      `$${fees.toFixed(2)} GUBER platform fees collected this month`));
  } catch (e: any) {
    items.push({ key: "stripe_fees", name: "Platform Fees (Month)", status: "unknown", value: "N/A",
      detail: "guber_payments query failed — table may not yet exist", lastSuccess: null,
      lastFailure: now(), failureReason: e?.message ?? "Unknown", recommendedAction: null });
  }

  // Active Studio subscriptions
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE studio_tier = 'standard')::int AS standard,
        COUNT(*) FILTER (WHERE studio_tier = 'business')::int AS business,
        COUNT(*) FILTER (WHERE studio_tier = 'enterprise')::int AS enterprise
      FROM users
      WHERE studio_subscription_status = 'active' AND deleted_at IS NULL
    `);
    const row = r.rows[0] as any;
    const total = (row.standard ?? 0) + (row.business ?? 0) + (row.enterprise ?? 0);
    items.push(good("subscriptions", "Active Subscriptions", total,
      `${total} active · ${row.standard ?? 0} Standard · ${row.business ?? 0} Business · ${row.enterprise ?? 0} Enterprise`));
  } catch (e: any) { items.push(err("subscriptions", "Active Subscriptions", e?.message ?? "Unknown")); }

  // Day-1 OG count
  try {
    const r = await db.execute(sql`SELECT COUNT(*)::int AS count FROM users WHERE day1_og = true AND deleted_at IS NULL`);
    items.push(good("og_count", "Day-1 OG Members", (r.rows[0] as any).count ?? 0,
      `${(r.rows[0] as any).count ?? 0} Day-1 OG members`));
  } catch (e: any) { items.push(err("og_count", "Day-1 OG Members", e?.message ?? "Unknown")); }

  // Active businesses
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM users
      WHERE account_type = 'business' AND deleted_at IS NULL AND banned = false
    `);
    items.push(good("businesses", "Active Businesses", (r.rows[0] as any).count ?? 0,
      `${(r.rows[0] as any).count ?? 0} business accounts`));
  } catch (e: any) { items.push(err("businesses", "Active Businesses", e?.message ?? "Unknown")); }

  // Active workers
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM users
      WHERE jobs_accepted > 0 AND deleted_at IS NULL AND banned = false AND suspended = false
    `);
    items.push(good("workers", "Active Workers", (r.rows[0] as any).count ?? 0,
      `${(r.rows[0] as any).count ?? 0} workers with at least 1 accepted job`));
  } catch (e: any) { items.push(err("workers", "Active Workers", e?.message ?? "Unknown")); }

  return items;
}

// ── GROWTH ────────────────────────────────────────────────────────────────────

export async function getGrowthData(): Promise<MetricItem[]> {
  const items: MetricItem[] = [];

  // New users
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS d1,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS d7,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS d30
      FROM users WHERE deleted_at IS NULL
    `);
    const row = r.rows[0] as any;
    items.push(good("new_users", "New Users", row.d1 ?? 0,
      `${row.d1 ?? 0} today · ${row.d7 ?? 0} last 7 days · ${row.d30 ?? 0} last 30 days`));
  } catch (e: any) { items.push(err("new_users", "New Users", e?.message ?? "Unknown")); }

  // Engagement (proxy: users with at least 1 completed job)
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE jobs_completed > 0)::int AS engaged,
        COUNT(*)::int AS total
      FROM users WHERE deleted_at IS NULL AND banned = false AND created_at < NOW() - INTERVAL '7 days'
    `);
    const row = r.rows[0] as any;
    const total = row.total ?? 0;
    const engaged = row.engaged ?? 0;
    const pct = total > 0 ? Math.round((engaged / total) * 100) : 0;
    items.push(good("retention", "User Engagement", `${pct}%`,
      `${engaged} of ${total} users (7d+ old) have completed ≥1 job — ${pct}% engagement proxy`));
  } catch (e: any) { items.push(err("retention", "User Engagement", e?.message ?? "Unknown")); }

  // Top ZIP codes
  try {
    const r = await db.execute(sql`
      SELECT zipcode, COUNT(*)::int AS cnt
      FROM users WHERE zipcode IS NOT NULL AND deleted_at IS NULL
      GROUP BY zipcode ORDER BY cnt DESC LIMIT 5
    `);
    const rows = r.rows as any[];
    const list = rows.map(row => `${row.zipcode} (${row.cnt})`).join(" · ");
    items.push(good("top_zips", "Top ZIP Codes", rows[0]?.zipcode ?? "N/A", list || "No location data yet"));
  } catch (e: any) { items.push(err("top_zips", "Top ZIP Codes", e?.message ?? "Unknown")); }

  // Top job categories
  try {
    const r = await db.execute(sql`
      SELECT category, COUNT(*)::int AS cnt
      FROM jobs WHERE is_test_job = false AND category IS NOT NULL
      GROUP BY category ORDER BY cnt DESC LIMIT 5
    `);
    const rows = r.rows as any[];
    const list = rows.map(row => `${row.category} (${row.cnt})`).join(" · ");
    items.push(good("top_categories", "Top Categories", rows[0]?.category ?? "N/A", list || "No job data yet"));
  } catch (e: any) { items.push(err("top_categories", "Top Categories", e?.message ?? "Unknown")); }

  // Referral activity
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS d30,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS d7
      FROM users WHERE referred_by IS NOT NULL AND deleted_at IS NULL
    `);
    const row = r.rows[0] as any;
    items.push(good("referrals", "Referral Activity", row.d30 ?? 0,
      `${row.d30 ?? 0} referred users last 30d · ${row.d7 ?? 0} last 7d`));
  } catch (e: any) { items.push(err("referrals", "Referral Activity", e?.message ?? "Unknown")); }

  return items;
}

// ── ADMIN ─────────────────────────────────────────────────────────────────────

export async function getAdminData(): Promise<MetricItem[]> {
  const items: MetricItem[] = [];

  // Pending approvals
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE risk_tier IN ('high','founder'))::int AS critical
      FROM os_actions WHERE status = 'pending'
    `);
    const row = r.rows[0] as any;
    const total = row.total ?? 0;
    const crit = row.critical ?? 0;
    const status: S = crit > 0 ? "critical" : total > 3 ? "warning" : total > 0 ? "warning" : "healthy";
    const item = good("pending_approvals", "Pending Approvals", total,
      `${total} pending · ${crit} high/founder-tier`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = crit > 0
        ? `${crit} critical-tier action${crit > 1 ? "s" : ""} need immediate founder review.`
        : `${total} action${total > 1 ? "s" : ""} awaiting approval — review in OS Approvals.`;
    }
    items.push(item);
  } catch (e: any) { items.push(err("pending_approvals", "Pending Approvals", e?.message ?? "Unknown")); }

  // Open disputes
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE opened_at < NOW() - INTERVAL '3 days')::int AS stale
      FROM guber_disputes WHERE status = 'open'
    `);
    const row = r.rows[0] as any;
    const total = row.total ?? 0;
    const stale = row.stale ?? 0;
    const status: S = total > 5 ? "critical" : total > 0 ? "warning" : "healthy";
    const item = good("disputes", "Disputes", total,
      `${total} open · ${stale} open > 3 days`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = stale > 0
        ? `${stale} dispute${stale > 1 ? "s" : ""} open > 3 days — resolve before SLA breach.`
        : "Open disputes need review.";
    }
    items.push(item);
  } catch (e: any) { items.push(err("disputes", "Disputes", e?.message ?? "Unknown")); }

  // Flagged users
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE strikes > 0)::int AS with_strikes,
        COUNT(*) FILTER (WHERE risk_level != 'normal')::int AS at_risk,
        COUNT(*) FILTER (WHERE under_review = true)::int AS under_review
      FROM users WHERE deleted_at IS NULL AND banned = false
    `);
    const row = r.rows[0] as any;
    const atRisk = row.at_risk ?? 0;
    const status: S = atRisk > 10 ? "warning" : "healthy";
    const item = good("flagged_users", "Flagged Users", row.with_strikes ?? 0,
      `${row.with_strikes ?? 0} with strikes · ${atRisk} elevated risk · ${row.under_review ?? 0} under review`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = "High number of at-risk users — review Safety Queue.";
    }
    items.push(item);
  } catch (e: any) { items.push(err("flagged_users", "Flagged Users", e?.message ?? "Unknown")); }

  // Failed payments (last 7 days)
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM guber_payments
      WHERE payment_status IN ('failed','refunded') AND created_at > NOW() - INTERVAL '7 days'
    `);
    const count = (r.rows[0] as any).count ?? 0;
    const status: S = count > 5 ? "critical" : count > 0 ? "warning" : "healthy";
    const item = good("failed_payments", "Failed Payments", count,
      `${count} failed/refunded payments in last 7 days`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = "Review failed payments in Stripe dashboard.";
    }
    items.push(item);
  } catch (e: any) {
    items.push({ key: "failed_payments", name: "Failed Payments", status: "unknown", value: "N/A",
      detail: "guber_payments query failed", lastSuccess: null, lastFailure: now(),
      failureReason: e?.message ?? "Unknown", recommendedAction: null });
  }

  // Failed push notifications (last 24h)
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM push_send_log WHERE success = false AND sent_at > NOW() - INTERVAL '24 hours'
    `);
    const count = (r.rows[0] as any).count ?? 0;
    const status: S = count > 20 ? "critical" : count > 5 ? "warning" : "healthy";
    const item = good("failed_notifications", "Failed Notifications", count,
      `${count} push failures in last 24 hours (web + APNs + FCM)`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = "High push failure rate — check APNs/VAPID/FCM config and token freshness.";
    }
    items.push(item);
  } catch (e: any) {
    items.push({ key: "failed_notifications", name: "Failed Notifications", status: "unknown", value: "N/A",
      detail: "push_send_log query failed", lastSuccess: null, lastFailure: now(),
      failureReason: e?.message ?? "Unknown", recommendedAction: null });
  }

  // OS error events (last 24h)
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM os_audit_log
      WHERE (event_type LIKE '%error%' OR event_type LIKE '%fail%' OR event_type LIKE '%unauthorized%')
        AND created_at > NOW() - INTERVAL '24 hours'
    `);
    const count = (r.rows[0] as any).count ?? 0;
    const status: S = count > 10 ? "warning" : "healthy";
    const item = good("error_logs", "Error Log Events", count,
      `${count} error/failure/unauthorized events in OS audit log last 24h`);
    if (status !== "healthy") {
      item.status = status;
      item.recommendedAction = "Review OS Audit Log for error patterns.";
    }
    items.push(item);
  } catch (e: any) { items.push(err("error_logs", "Error Log Events", e?.message ?? "Unknown")); }

  return items;
}
