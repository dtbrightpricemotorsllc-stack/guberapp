/**
 * server/os/health-monitor.ts
 *
 * Active health monitoring with two autonomous tracks.
 * Production-only data: is_test_job=false, is_test_user=false,
 * email NOT ILIKE '%@guberapp.internal', is_demo=false.
 *
 * Track A — Auto-recovery (no human approval needed):
 *   Jobs stuck in payout_eligible / paid_out with NO stripe_transfer_id
 *   and worker has an active Stripe Connect account → fires the transfer
 *   immediately and logs to audit trail.
 *
 * Track B — Alert staging (routes to /os/approve as alert.founder):
 *   - capture_expired jobs (7-day Stripe auth lapsed, manual re-charge needed)
 *   - Orphaned payouts: worker owed money >7 days but no Connect account set up
 *
 * NOT implemented: autonomous code generation or deployment. Code-level issues
 * are staged as alert.founder with diagnosis so the founder can act quickly.
 */

import Stripe from "stripe";
import { pool } from "../db";
import { proposeAction } from "./approval-engine";
import { writeAuditLog } from "./logger";

const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia" as any,
});

const PROD_JOB_FILTER = `
  j.is_test_job = false
  AND (j.is_demo IS NULL OR j.is_demo = false)
  AND u_poster.is_test_user = false
  AND u_poster.email NOT ILIKE '%@guberapp.internal'
`;

export interface HealthMonitorResult {
  autoRecovered: number;
  alertsStaged: number;
  errors: string[];
  summary: string;
  details: {
    autoPayouts: { jobId: number; transferId: string; amount: number }[];
    captureExpiredAlerts: number;
    orphanedPayoutAlerts: number;
  };
}

export async function runHealthMonitor(): Promise<HealthMonitorResult> {
  const result: HealthMonitorResult = {
    autoRecovered: 0,
    alertsStaged: 0,
    errors: [],
    summary: "",
    details: { autoPayouts: [], captureExpiredAlerts: 0, orphanedPayoutAlerts: 0 },
  };

  await Promise.allSettled([
    trackA_autoPayoutRecovery(result),
    trackB_captureExpiredAlerts(result),
    trackB_orphanedPayoutAlerts(result),
  ]);

  result.summary =
    `Health monitor: auto-recovered ${result.autoRecovered} stuck payout(s)` +
    `, staged ${result.alertsStaged} alert(s)` +
    (result.errors.length ? `, ${result.errors.length} error(s)` : "");

  console.log(`[os/health-monitor] ${result.summary}`);
  return result;
}

// ── Track A: Auto-recover stuck payouts ──────────────────────────────────────
// These jobs completed mutual confirmation and the real-time transfer attempt
// either failed silently or was skipped. Safe to retry: the PI was already
// captured (chargedAt is set), so GUBER holds the funds.

async function trackA_autoPayoutRecovery(result: HealthMonitorResult): Promise<void> {
  try {
    const { rows } = await pool.query<{
      id: number;
      title: string;
      assigned_helper_id: number;
      helper_payout: number;
      stripe_payment_intent_id: string | null;
      charged_at: Date | null;
      stripe_account_id: string;
    }>(`
      SELECT
        j.id, j.title, j.assigned_helper_id, j.helper_payout,
        j.stripe_payment_intent_id, j.charged_at,
        u_worker.stripe_account_id
      FROM jobs j
      JOIN users u_poster ON u_poster.id = j.posted_by_id
      JOIN users u_worker ON u_worker.id = j.assigned_helper_id
      WHERE j.payout_status IN ('payout_eligible', 'paid_out')
        AND j.stripe_transfer_id IS NULL
        AND j.completed_at < NOW() - INTERVAL '1 hour'
        AND j.helper_payout > 0
        AND u_worker.stripe_account_id IS NOT NULL
        AND u_worker.stripe_account_status = 'active'
        AND u_worker.is_test_user = false
        AND u_worker.email NOT ILIKE '%@guberapp.internal'
        AND ${PROD_JOB_FILTER}
      ORDER BY j.completed_at ASC
      LIMIT 25
    `);

    for (const job of rows) {
      try {
        // Guard: if this job has a PI, it must be captured before we can transfer.
        if (job.stripe_payment_intent_id && !job.charged_at) {
          console.log(`[os/health-monitor] Track A: job ${job.id} PI not captured yet — skipping`);
          continue;
        }

        const transfer = await stripe.transfers.create({
          amount: Math.round(job.helper_payout * 100),
          currency: "usd",
          destination: job.stripe_account_id,
          transfer_group: `job_${job.id}`,
          description: `GUBER auto-recovery payout: ${job.title}`,
          metadata: {
            jobId: String(job.id),
            userId: String(job.assigned_helper_id),
            source: "health_monitor",
          },
        });

        await pool.query(
          `UPDATE jobs
           SET payout_status = 'sent', stripe_transfer_id = $1, paid_out_at = NOW()
           WHERE id = $2`,
          [transfer.id, job.id],
        );

        await pool.query(
          `UPDATE wallet_transactions
           SET stripe_transfer_id = $1,
               description = 'Auto-recovery payout: $' || $2::text || ' for "' || $3 || '"'
           WHERE job_id = $4
             AND user_id = $5
             AND type = 'earning'
             AND stripe_transfer_id IS NULL`,
          [transfer.id, job.helper_payout.toFixed(2), job.title, job.id, job.assigned_helper_id],
        );

        result.autoRecovered++;
        result.details.autoPayouts.push({
          jobId: job.id,
          transferId: transfer.id,
          amount: job.helper_payout,
        });

        console.log(
          `[os/health-monitor] auto-payout job=${job.id} transfer=${transfer.id} amount=$${job.helper_payout}`,
        );

        await writeAuditLog({
          agentKey: "health_monitor",
          eventType: "payout.auto_recovered",
          description: `Auto-recovery Stripe transfer ${transfer.id} fired for job #${job.id} — $${job.helper_payout}`,
          afterState: { jobId: job.id, transferId: transfer.id, amount: job.helper_payout },
        });
      } catch (err: any) {
        const msg = `Track A job ${job.id}: ${err.message}`;
        result.errors.push(msg);
        console.error(`[os/health-monitor] ${msg}`);
      }
    }
  } catch (err: any) {
    const msg = `Track A query failed: ${err.message}`;
    result.errors.push(msg);
    console.error(`[os/health-monitor] ${msg}`);
  }
}

// ── Track B-1: capture_expired — alert.founder ───────────────────────────────
// The 7-day Stripe authorization window lapsed before mutual confirmation.
// GUBER never captured the funds. Requires manual decision: re-charge the
// hirer or issue a goodwill payout.

async function trackB_captureExpiredAlerts(result: HealthMonitorResult): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT j.id, j.title, j.assigned_helper_id, j.helper_payout, j.completed_at,
             u_worker.email AS worker_email
      FROM jobs j
      JOIN users u_poster ON u_poster.id = j.posted_by_id
      JOIN users u_worker ON u_worker.id = j.assigned_helper_id
      WHERE j.payout_status = 'capture_expired'
        AND ${PROD_JOB_FILTER}
        AND NOT EXISTS (
          SELECT 1 FROM os_actions oa
          WHERE oa.action_type = 'alert.founder'
            AND (oa.payload->>'alertType') = 'capture_expired'
            AND (oa.payload->>'jobId')::int = j.id
            AND oa.status IN ('pending', 'approved', 'executed')
            AND oa.created_at > NOW() - INTERVAL '7 days'
        )
      ORDER BY j.completed_at ASC
      LIMIT 10
    `);

    for (const job of rows) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(job.completed_at).getTime()) / 86_400_000,
      );
      await proposeAction({
        agentKey: "health_monitor",
        actionType: "alert.founder",
        payload: {
          alertType: "capture_expired",
          jobId: job.id,
          jobTitle: job.title,
          workerId: job.assigned_helper_id,
          workerEmail: job.worker_email,
          amount: job.helper_payout,
          completedAt: job.completed_at,
          daysAgo,
        },
        rationale:
          `Job #${job.id} "${job.title}" completed ${daysAgo}d ago but the Stripe authorization ` +
          `window (7 days) lapsed before capture. Worker ${job.worker_email} is owed ` +
          `$${job.helper_payout}. Options: (1) re-charge the hirer off-platform and ` +
          `manually transfer, or (2) issue a goodwill payout from platform reserves.`,
      });
      result.alertsStaged++;
      result.details.captureExpiredAlerts++;
    }
  } catch (err: any) {
    const msg = `Track B1 query failed: ${err.message}`;
    result.errors.push(msg);
    console.error(`[os/health-monitor] ${msg}`);
  }
}

// ── Track B-2: orphaned payouts — alert.founder ───────────────────────────────
// Job completed >7 days ago, worker is owed money, but worker has not set up
// a Stripe Connect account. Funds sit in GUBER's wallet as "available" but
// cannot be transferred until the worker onboards.

async function trackB_orphanedPayoutAlerts(result: HealthMonitorResult): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT j.id, j.title, j.assigned_helper_id, j.helper_payout, j.completed_at,
             u_worker.email AS worker_email,
             u_worker.stripe_account_status
      FROM jobs j
      JOIN users u_poster ON u_poster.id = j.posted_by_id
      JOIN users u_worker ON u_worker.id = j.assigned_helper_id
      WHERE j.payout_status IN ('payout_eligible', 'paid_out')
        AND j.stripe_transfer_id IS NULL
        AND j.completed_at < NOW() - INTERVAL '7 days'
        AND j.helper_payout > 0
        AND (u_worker.stripe_account_id IS NULL OR u_worker.stripe_account_status != 'active')
        AND u_worker.is_test_user = false
        AND u_worker.email NOT ILIKE '%@guberapp.internal'
        AND ${PROD_JOB_FILTER}
        AND NOT EXISTS (
          SELECT 1 FROM os_actions oa
          WHERE oa.action_type = 'alert.founder'
            AND (oa.payload->>'alertType') = 'orphaned_payout'
            AND (oa.payload->>'jobId')::int = j.id
            AND oa.status IN ('pending', 'approved', 'executed')
            AND oa.created_at > NOW() - INTERVAL '14 days'
        )
      ORDER BY j.completed_at ASC
      LIMIT 10
    `);

    for (const job of rows) {
      const daysAgo = Math.floor(
        (Date.now() - new Date(job.completed_at).getTime()) / 86_400_000,
      );
      await proposeAction({
        agentKey: "health_monitor",
        actionType: "alert.founder",
        payload: {
          alertType: "orphaned_payout",
          jobId: job.id,
          jobTitle: job.title,
          workerId: job.assigned_helper_id,
          workerEmail: job.worker_email,
          amount: job.helper_payout,
          completedAt: job.completed_at,
          daysAgo,
          stripeAccountStatus: job.stripe_account_status,
        },
        rationale:
          `Job #${job.id} "${job.title}" completed ${daysAgo}d ago. Worker ${job.worker_email} ` +
          `is owed $${job.helper_payout} but has not completed Stripe Connect onboarding ` +
          `(status: ${job.stripe_account_status ?? "none"}). The funds are captured and ` +
          `held. Recommend sending a targeted push/email nudge to complete payout setup.`,
      });
      result.alertsStaged++;
      result.details.orphanedPayoutAlerts++;
    }
  } catch (err: any) {
    const msg = `Track B2 query failed: ${err.message}`;
    result.errors.push(msg);
    console.error(`[os/health-monitor] ${msg}`);
  }
}
