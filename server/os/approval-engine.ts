import { db } from "../db";
import { osActions, osApprovals, type OSAction } from "@shared/os-schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "./logger";

export type RiskTier = "read" | "low" | "medium" | "high" | "founder";

const ACTION_TIER_MAP: Record<string, RiskTier> = {
  "notify.user": "low",
  "notify.segment": "medium",
  "send.briefing": "read",
  "update.memory": "read",
  "flag.user_for_review": "medium",
  "issue.refund": "high",
  "suspend.user": "high",
  "grant.studio_credits": "medium",
  "update.feature_flag": "high",
  "create.support_response": "low",
  "escalate.dispute": "medium",
  "generate.report": "read",
  "update.faq": "low",
  "alert.founder": "low",
};

export function classifyRiskTier(actionType: string): RiskTier {
  return ACTION_TIER_MAP[actionType] ?? "medium";
}

export interface ProposeActionInput {
  runId?: number;
  agentKey: string;
  actionType: string;
  payload: Record<string, any>;
  rationale: string;
}

export async function proposeAction(input: ProposeActionInput): Promise<OSAction> {
  const riskTier = classifyRiskTier(input.actionType);

  const [action] = await db
    .insert(osActions)
    .values({
      runId: input.runId,
      agentKey: input.agentKey,
      actionType: input.actionType,
      riskTier,
      payload: input.payload,
      rationale: input.rationale,
      status: "pending",
    })
    .returning();

  // Read-tier actions: auto-approve immediately
  if (riskTier === "read") {
    await db
      .update(osActions)
      .set({ status: "approved", approvedBy: "auto", approvedAt: new Date() })
      .where(eq(osActions.id, action.id));

    await writeAuditLog({
      agentKey: input.agentKey,
      actionId: action.id,
      eventType: "action.auto_approved",
      description: `Read-tier action "${input.actionType}" auto-approved`,
      afterState: { tier: "read", actionType: input.actionType },
    });

    return { ...action, status: "approved", approvedBy: "auto" };
  }

  // All other tiers: create approval request
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const requiredRole =
    riskTier === "high" || riskTier === "founder" ? "founder" : "admin";

  await db.insert(osApprovals).values({
    actionId: action.id,
    requiredRole,
    expiresAt,
  });

  await writeAuditLog({
    agentKey: input.agentKey,
    actionId: action.id,
    eventType: "action.queued_for_approval",
    description: `${riskTier}-tier action "${input.actionType}" queued — requires ${requiredRole} approval`,
    afterState: { tier: riskTier, requiredRole, expiresAt: expiresAt.toISOString() },
  });

  return action;
}

export async function decideAction(
  actionId: number,
  decidedBy: number,
  decision: "approved" | "rejected",
  note?: string
): Promise<void> {
  const [action] = await db
    .select()
    .from(osActions)
    .where(eq(osActions.id, actionId))
    .limit(1);

  if (!action) throw new Error(`Action ${actionId} not found`);
  if (action.status !== "pending")
    throw new Error(`Action ${actionId} is already ${action.status}`);

  await db
    .update(osActions)
    .set({
      status: decision,
      approvedBy: `admin:${decidedBy}`,
      approvedAt: new Date(),
      rejectionNote: note,
    })
    .where(eq(osActions.id, actionId));

  await db
    .update(osApprovals)
    .set({ decidedBy, decision, decidedAt: new Date(), note })
    .where(eq(osApprovals.actionId, actionId));

  await writeAuditLog({
    agentKey: action.agentKey,
    actionId,
    eventType: `action.${decision}`,
    description: `Action "${action.actionType}" ${decision} by admin:${decidedBy}${
      note ? ` — "${note}"` : ""
    }`,
    beforeState: { status: "pending" },
    afterState: { status: decision, decidedBy },
  });
}
