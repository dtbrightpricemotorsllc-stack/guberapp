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
    case "send.briefing":
    case "generate.report":
    case "update.memory":
      // Read-tier actions: always succeed (data written before execution)
      return { ok: true, note: "read-tier action completed" };

    default:
      // Phase 1 shell: queue any other approved action for Phase 2 implementation
      return { ok: true, note: `phase-1-shell: "${actionType}" queued for Phase 2 implementation` };
  }
}
