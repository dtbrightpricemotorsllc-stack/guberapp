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
      db.execute(sql`SELECT COUNT(*)::int AS count FROM users WHERE banned = false`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM jobs`),
      db.execute(
        sql`SELECT COUNT(*)::int AS count FROM guber_disputes WHERE status = 'open'`
      ),
      db.execute(
        sql`SELECT COUNT(*)::int AS count FROM studio_sessions WHERE created_at > NOW() - INTERVAL '24 hours'`
      ),
    ]);
    return {
      userCount: (users.rows[0] as any).count ?? 0,
      jobCount: (jobs.rows[0] as any).count ?? 0,
      openDisputeCount: (disputes.rows[0] as any).count ?? 0,
      studioSessionCount: (studio.rows[0] as any).count ?? 0,
      systemStatus: "healthy",
    };
  } catch {
    return {
      userCount: 0,
      jobCount: 0,
      openDisputeCount: 0,
      studioSessionCount: 0,
      systemStatus: "degraded",
    };
  }
}

export async function getRevenueStats(): Promise<RevenueStats> {
  try {
    const result = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN type IN ('job_payment','vi_payment') THEN amount ELSE 0 END), 0)::float AS gmv,
        COALESCE(SUM(CASE WHEN type = 'payout' THEN ABS(amount) ELSE 0 END), 0)::float AS payouts,
        COALESCE(SUM(CASE WHEN type = 'refund' THEN ABS(amount) ELSE 0 END), 0)::float AS refunds
      FROM wallet_transactions
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const row = result.rows[0] as any;
    return {
      totalGmv: parseFloat(row.gmv ?? "0"),
      totalPayouts: parseFloat(row.payouts ?? "0"),
      totalRefunds: parseFloat(row.refunds ?? "0"),
      periodLabel: "Last 30 days",
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
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_30d,
        COUNT(*) FILTER (WHERE id_verified = true)::int AS verified
      FROM users
      WHERE banned = false
    `);
    const row = result.rows[0] as any;
    return {
      totalUsers: row.total ?? 0,
      newUsersLast7d: row.new_7d ?? 0,
      newUsersLast30d: row.new_30d ?? 0,
      verifiedUsers: row.verified ?? 0,
    };
  } catch {
    return { totalUsers: 0, newUsersLast7d: 0, newUsersLast30d: 0, verifiedUsers: 0 };
  }
}
