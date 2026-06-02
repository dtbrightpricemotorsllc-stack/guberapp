import { db } from "../db";
import { osAuditLog } from "@shared/os-schema";

export interface AuditEntry {
  agentKey?: string;
  actionId?: number;
  eventType: string;
  description: string;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
}

/**
 * Write-once immutable audit log entry.
 * Never updated or deleted after creation.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(osAuditLog).values({
      agentKey: entry.agentKey ?? "system",
      actionId: entry.actionId,
      eventType: entry.eventType,
      description: entry.description,
      beforeState: entry.beforeState,
      afterState: entry.afterState,
    });
  } catch (err) {
    console.error("[os/logger] Failed to write audit log:", err);
  }
}
