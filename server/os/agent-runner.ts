import { db } from "../db";
import { osAgents, osAgentRuns } from "@shared/os-schema";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "./logger";

export interface AgentContext {
  trigger: "cron" | "event";
  runId: number;
  triggerRefId?: number;
}

export interface AgentResult {
  summary: string;
  actionsProposed: number;
  briefingCreated: boolean;
}

export interface GUBERAgent {
  key: string;
  label: string;
  description: string;
  schedule: string;
  eventSubscriptions: string[];
  run(ctx: AgentContext): Promise<AgentResult>;
}

const registeredAgents = new Map<string, GUBERAgent>();

export function registerAgent(agent: GUBERAgent): void {
  registeredAgents.set(agent.key, agent);
  console.log(`[os/agent-runner] Registered agent: ${agent.key} (${agent.label})`);
}

export function getRegisteredAgent(key: string): GUBERAgent | undefined {
  return registeredAgents.get(key);
}

export function getRegisteredAgents(): GUBERAgent[] {
  return Array.from(registeredAgents.values());
}

export async function runAgent(
  agentKey: string,
  trigger: "cron" | "event",
  triggerRefId?: number
): Promise<void> {
  const agent = registeredAgents.get(agentKey);
  if (!agent) {
    console.warn(`[os/agent-runner] Agent "${agentKey}" not found in in-memory registry`);
    return;
  }

  const [run] = await db
    .insert(osAgentRuns)
    .values({
      agentKey,
      trigger,
      triggerRefId,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  try {
    const result = await agent.run({ trigger, runId: run.id, triggerRefId });

    await db
      .update(osAgentRuns)
      .set({
        status: "completed",
        summary: result.summary,
        actionsProposed: result.actionsProposed,
        completedAt: new Date(),
      })
      .where(eq(osAgentRuns.id, run.id));

    await db
      .update(osAgents)
      .set({ lastRunAt: new Date() })
      .where(eq(osAgents.key, agentKey));

    await writeAuditLog({
      agentKey,
      eventType: "agent.run_completed",
      description: `Agent "${agentKey}" run completed: ${result.summary}`,
      afterState: { runId: run.id, actionsProposed: result.actionsProposed },
    });
  } catch (err: any) {
    await db
      .update(osAgentRuns)
      .set({
        status: "failed",
        error: err.message,
        completedAt: new Date(),
      })
      .where(eq(osAgentRuns.id, run.id));

    await writeAuditLog({
      agentKey,
      eventType: "agent.run_failed",
      description: `Agent "${agentKey}" run failed: ${err.message}`,
    });

    console.error(`[os/agent-runner] Agent "${agentKey}" failed:`, err.message);
  }
}

let runnerHandle: ReturnType<typeof setInterval> | null = null;

export function startAgentRunner(): void {
  const count = registeredAgents.size;
  console.log(
    `[os/agent-runner] Started. ${count} agent${count === 1 ? "" : "s"} registered. Heartbeat: 60s.`
  );

  runnerHandle = setInterval(async () => {
    // Phase 1: heartbeat only. No agents registered yet.
    // Phase 2+: match registered agents' cron schedules and invoke runAgent().
    if (registeredAgents.size === 0) return;

    for (const [key, agent] of registeredAgents.entries()) {
      try {
        const [dbAgent] = await db
          .select({ enabled: osAgents.enabled })
          .from(osAgents)
          .where(eq(osAgents.key, key))
          .limit(1);
        if (!dbAgent?.enabled) continue;
        // Cron matching logic added in Phase 2
      } catch (_) {}
    }
  }, 60_000);
}

export function stopAgentRunner(): void {
  if (runnerHandle) {
    clearInterval(runnerHandle);
    runnerHandle = null;
    console.log("[os/agent-runner] Stopped.");
  }
}
