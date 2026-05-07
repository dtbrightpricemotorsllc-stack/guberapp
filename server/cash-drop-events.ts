import { db } from "./db";
import { cashDropEvents } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface RecordCashDropEvent {
  cashDropId: number;
  eventType: string;
  reasonCode?: string | null;
  actorUserId?: number | null;
  source?: "route" | "cron" | "webhook" | "system";
  payload?: Record<string, any> | null;
}

export async function recordCashDropEvent(e: RecordCashDropEvent): Promise<void> {
  try {
    await db.insert(cashDropEvents).values({
      cashDropId: e.cashDropId,
      eventType: e.eventType,
      reasonCode: e.reasonCode ?? null,
      actorUserId: e.actorUserId ?? null,
      source: e.source ?? "system",
      payload: e.payload ?? null,
    });
  } catch (err) {
    console.error("[cash-drop-events] insert failed:", err);
  }
}

export async function getCashDropEvents(cashDropId: number, limit = 200) {
  return db
    .select()
    .from(cashDropEvents)
    .where(eq(cashDropEvents.cashDropId, cashDropId))
    .orderBy(desc(cashDropEvents.createdAt))
    .limit(limit);
}
