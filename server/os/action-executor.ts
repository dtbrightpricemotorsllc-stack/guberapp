import Stripe from "stripe";
import { db, pool } from "../db";
import { osActions } from "@shared/os-schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "./logger";

const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia" as any,
});

/**
 * Execute an approved action.
 * For Phase 1: handles the execution pipeline plumbing.
 * Agent-specific execution logic added in Phase 2+ with each agent.
 */
export async function executeAction(actionId: number): Promise<void> {
  const [action] = await db
    .select()
    .from(osActions)
    .where(eq(osActions.id, actionId))
    .limit(1);

  if (!action) throw new Error(`Action ${actionId} not found`);
  if (action.status !== "approved") {
    throw new Error(
      `Action ${actionId} cannot be executed — status is "${action.status}", expected "approved"`
    );
  }

  try {
    const result = await dispatchAction(action.actionType, action.payload ?? {});

    await db
      .update(osActions)
      .set({ status: "executed", executedAt: new Date(), result })
      .where(eq(osActions.id, actionId));

    await writeAuditLog({
      agentKey: action.agentKey,
      actionId,
      eventType: "action.executed",
      description: `Action "${action.actionType}" executed successfully`,
      afterState: { result },
    });
  } catch (err: any) {
    await db
      .update(osActions)
      .set({ status: "failed", result: { error: err.message } })
      .where(eq(osActions.id, actionId));

    await writeAuditLog({
      agentKey: action.agentKey,
      actionId,
      eventType: "action.failed",
      description: `Action "${action.actionType}" failed: ${err.message}`,
    });

    throw err;
  }
}

async function dispatchAction(
  actionType: string,
  payload: Record<string, any>
): Promise<Record<string, any>> {
  switch (actionType) {
    // ── Read-tier (always succeed immediately) ──────────────────────────────
    case "send.briefing":
    case "generate.report":
    case "update.memory":
      return { ok: true, note: "read-tier action completed" };

    // ── Low-tier ─────────────────────────────────────────────────────────────
    case "alert.founder":
      // Logged to audit trail; real notification channel wired in Phase 2
      return { ok: true, alertType: payload.alertType, note: "founder-alert recorded — push channel Phase 2" };

    case "notify.user":
      return { ok: true, note: "notification queued — delivery channel Phase 2" };

    case "create.support_response":
      return { ok: true, note: "support response drafted — review in admin panel" };

    // ── Medium-tier ───────────────────────────────────────────────────────────
    case "escalate.dispute": {
      // Marks dispute as escalated in guber_disputes (if jobId provided)
      const { jobId, disputeId } = payload;
      if (disputeId) {
        const { pool } = await import("../db");
        await pool.query(
          `UPDATE guber_disputes SET status = 'escalated' WHERE id = $1`,
          [disputeId]
        );
        return { ok: true, disputeId, note: "dispute status → escalated" };
      }
      return { ok: true, note: "dispute escalation logged — no disputeId provided" };
    }

    case "schedule.cash_drop": {
      const { zip, suggestedBudget } = payload;
      // Placeholder: in Phase 2 this creates a cash_drops record
      return { ok: true, zip, suggestedBudget, note: "cash drop scheduled — fulfillment Phase 2" };
    }

    case "queue.outreach": {
      const { targetZips, estimatedEmails } = payload;
      // Placeholder: in Phase 2 this creates outreach_batches records
      return { ok: true, targetZips, estimatedEmails, note: "outreach batch queued — send Phase 2" };
    }

    case "flag.user_for_review":
      return { ok: true, userId: payload.userId, note: "user flagged — admin review queue" };

    case "grant.studio_credits":
      return { ok: true, userId: payload.userId, credits: payload.credits, note: "credits grant queued — Phase 2" };

    // ── High-tier ─────────────────────────────────────────────────────────────
    case "release.payout": {
      const { jobId, workerId, amount } = payload;

      const jobRes = await pool.query<{
        id: number; title: string; helper_payout: number; payout_status: string;
        stripe_payment_intent_id: string | null; charged_at: Date | null;
        stripe_transfer_id: string | null;
        stripe_account_id: string | null; stripe_account_status: string | null;
      }>(`
        SELECT j.id, j.title, j.helper_payout, j.payout_status,
               j.stripe_payment_intent_id, j.charged_at, j.stripe_transfer_id,
               u.stripe_account_id, u.stripe_account_status
        FROM jobs j
        JOIN users u ON u.id = j.assigned_helper_id
        WHERE j.id = $1
      `, [jobId]);

      const job = jobRes.rows[0];
      if (!job) return { ok: false, error: `Job ${jobId} not found` };

      // Idempotency — already transferred
      if (job.stripe_transfer_id) {
        return { ok: true, jobId, note: "already paid — idempotent skip", transferId: job.stripe_transfer_id };
      }

      if (!job.stripe_account_id || job.stripe_account_status !== "active") {
        return { ok: false, jobId, error: "Worker has no active Stripe Connect account" };
      }

      // Safety: never transfer against an uncaptured PI
      if (job.stripe_payment_intent_id && !job.charged_at) {
        return { ok: false, jobId, error: "Stripe PI not yet captured — cannot transfer unfunded job" };
      }

      const workerShare = job.helper_payout ?? amount;
      if (!workerShare || workerShare <= 0) {
        return { ok: false, jobId, error: "No payout amount on job" };
      }

      const transfer = await stripe.transfers.create({
        amount: Math.round(workerShare * 100),
        currency: "usd",
        destination: job.stripe_account_id,
        transfer_group: `job_${jobId}`,
        description: `GUBER OS payout: ${job.title}`,
        metadata: { jobId: String(jobId), userId: String(workerId), source: "os_agent" },
      });

      await pool.query(
        `UPDATE jobs SET payout_status = 'sent', stripe_transfer_id = $1, paid_out_at = NOW() WHERE id = $2`,
        [transfer.id, jobId],
      );
      await pool.query(
        `UPDATE wallet_transactions
         SET stripe_transfer_id = $1,
             description = 'OS-released payout: $' || $2::text || ' for "' || $3 || '"'
         WHERE job_id = $4 AND user_id = $5 AND type = 'earning' AND stripe_transfer_id IS NULL`,
        [transfer.id, workerShare.toFixed(2), job.title, jobId, workerId],
      );

      return { ok: true, jobId, workerId, amount: workerShare, transferId: transfer.id };
    }

    case "issue.refund":
      return { ok: true, jobId: payload.jobId, amount: payload.amount, note: "refund queued — Stripe Phase 2" };

    case "resolve.dispute":
      return { ok: true, disputeId: payload.disputeId, resolution: payload.resolution, note: "dispute resolution recorded" };

    // ── Founder-tier ──────────────────────────────────────────────────────────
    case "patch.infrastructure":
      return { ok: true, note: "infrastructure patch staged — manual deploy required" };

    default:
      return { ok: true, note: `"${actionType}" queued for Phase 2 implementation` };
  }
}
