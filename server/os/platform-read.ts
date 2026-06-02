import { db } from "../db";
import { sql } from "drizzle-orm";

export interface PlatformHealth {
  userCount: number;
  jobCount: number;
  openDisputeCount: number;
  studioSessionCount: number;
  systemStatus: "healthy" | "degraded";
}

export interface RevenueStats {
  totalGmv: number;
  totalPayouts: number;
  totalRefunds: number;
  periodLabel: string;
}

export interface UserGrowthStats {
  totalUsers: number;
  newUsersLast7d: number;
  newUsersLast30d: number;
  verifiedUsers: number;
}

export async function getPlatformHealth(): Promise<PlatformHealth> {
  try {
    const [users, jobs, disputes, studio] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE banned = false
          AND is_test_user = false
          AND email NOT ILIKE '%@guberapp.internal'
          AND deleted_at IS NULL
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM jobs j
        JOIN users u ON u.id = j.posted_by_id
        WHERE j.is_test_job = false
          AND j.is_demo = false
          AND u.is_test_user = false
          AND u.email NOT ILIKE '%@guberapp.internal'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM guber_disputes d
        JOIN users u ON u.id = d.opened_by_user_id
        WHERE d.status = 'open'
          AND u.is_test_user = false
          AND u.email NOT ILIKE '%@guberapp.internal'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM studio_sessions ss
        JOIN users u ON u.id = ss.user_id
        WHERE ss.created_at > NOW() - INTERVAL '24 hours'
          AND u.is_test_user = false
          AND u.email NOT ILIKE '%@guberapp.internal'
      `),
    ]);
    return {
      userCount:        (users.rows[0] as any).count ?? 0,
      jobCount:         (jobs.rows[0] as any).count ?? 0,
      openDisputeCount: (disputes.rows[0] as any).count ?? 0,
      studioSessionCount: (studio.rows[0] as any).count ?? 0,
      systemStatus: "healthy",
    };
  } catch {
    return { userCount: 0, jobCount: 0, openDisputeCount: 0, studioSessionCount: 0, systemStatus: "degraded" };
  }
}

export async function getRevenueStats(): Promise<RevenueStats> {
  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN wt.type IN ('job_payment','vi_payment') THEN wt.amount ELSE 0 END), 0)::float AS gmv,
        COALESCE(SUM(CASE WHEN wt.type = 'payout' THEN ABS(wt.amount) ELSE 0 END), 0)::float AS payouts,
        COALESCE(SUM(CASE WHEN wt.type = 'refund' THEN ABS(wt.amount) ELSE 0 END), 0)::float AS refunds
      FROM wallet_transactions wt
      JOIN users u ON u.id = wt.user_id
      WHERE wt.created_at > NOW() - INTERVAL '30 days'
        AND u.is_test_user = false
        AND u.email NOT ILIKE '%@guberapp.internal'
    `);
    const row = result.rows[0] as any;
    return {
      totalGmv:     parseFloat(row.gmv     ?? "0"),
      totalPayouts: parseFloat(row.payouts ?? "0"),
      totalRefunds: parseFloat(row.refunds ?? "0"),
      periodLabel:  "Last 30 days",
    };
  } catch {
    return { totalGmv: 0, totalPayouts: 0, totalRefunds: 0, periodLabel: "Last 30 days" };
  }
}

export async function getUserGrowthStats(): Promise<UserGrowthStats> {
  try {
    const result = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int  AS new_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_30d,
        COUNT(*) FILTER (WHERE id_verified = true)::int AS verified
      FROM users
      WHERE banned = false
        AND is_test_user = false
        AND email NOT ILIKE '%@guberapp.internal'
        AND deleted_at IS NULL
    `);
    const row = result.rows[0] as any;
    return {
      totalUsers:       row.total    ?? 0,
      newUsersLast7d:   row.new_7d   ?? 0,
      newUsersLast30d:  row.new_30d  ?? 0,
      verifiedUsers:    row.verified ?? 0,
    };
  } catch {
    return { totalUsers: 0, newUsersLast7d: 0, newUsersLast30d: 0, verifiedUsers: 0 };
  }
}
