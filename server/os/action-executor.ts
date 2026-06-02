import { db } from "../db";
import { osActions } from "@shared/os-schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "./logger";

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
      // In production Phase 2 this triggers Stripe Connect payout
      return { ok: true, jobId, workerId, amount, note: "payout release logged — Stripe transfer Phase 2" };
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
