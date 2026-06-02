import { db } from "../db";
import { osAgentMemory, osFounderMemory, type OSAgentMemory, type OSFounderMemory } from "@shared/os-schema";
import { eq, and } from "drizzle-orm";

export class AgentMemoryService {
  constructor(private agentKey: string) {}

  async get(memoryKey: string): Promise<any> {
    const rows = await db
      .select()
      .from(osAgentMemory)
      .where(
        and(
          eq(osAgentMemory.agentKey, this.agentKey),
          eq(osAgentMemory.memoryKey, memoryKey)
        )
      )
      .limit(1);
    return rows[0]?.memoryValue ?? null;
  }

  async set(
    memoryKey: string,
    value: any,
    options: { confidence?: number; source?: string; expiresAt?: Date; scope?: string } = {}
  ): Promise<void> {
    const existing = await db
      .select({ id: osAgentMemory.id })
      .from(osAgentMemory)
      .where(
        and(
          eq(osAgentMemory.agentKey, this.agentKey),
          eq(osAgentMemory.memoryKey, memoryKey)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(osAgentMemory)
        .set({
          memoryValue: value,
          confidence: options.confidence ?? 1.0,
          source: options.source ?? "observed",
          expiresAt: options.expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(osAgentMemory.id, existing[0].id));
    } else {
      await db.insert(osAgentMemory).values({
        agentKey: this.agentKey,
        scope: options.scope ?? "agent",
        memoryKey,
        memoryValue: value,
        confidence: options.confidence ?? 1.0,
        source: options.source ?? "observed",
        expiresAt: options.expiresAt,
      });
    }
  }

  async getAll(): Promise<OSAgentMemory[]> {
    return db
      .select()
      .from(osAgentMemory)
      .where(eq(osAgentMemory.agentKey, this.agentKey));
  }
}

export class GlobalMemoryService {
  async getFounderMemory(topic?: string): Promise<OSFounderMemory[]> {
    if (topic) {
      return db
        .select()
        .from(osFounderMemory)
        .where(eq(osFounderMemory.topic, topic));
    }
    return db.select().from(osFounderMemory);
  }

  async getAllAgentMemory(agentKey: string): Promise<OSAgentMemory[]> {
    return db
      .select()
      .from(osAgentMemory)
      .where(eq(osAgentMemory.agentKey, agentKey));
  }
}
