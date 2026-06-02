import type { Express, Request, Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  osAgents,
  osEvents,
  osAgentRuns,
  osActions,
  osBriefings,
  osApprovals,
  osAuditLog,
  osFounderMemory,
  osAgentMemory,
} from "@shared/os-schema";
import { eq, desc, and, inArray, sql as drizzleSql } from "drizzle-orm";
import { proposeAction, decideAction } from "./approval-engine";
import { executeAction } from "./action-executor";
import { emitOSEvent } from "./event-bus";
import { writeAuditLog } from "./logger";
import { runAllHealthChecks } from "./health-checks";
import { getOperationsData, getBusinessData, getGrowthData, getAdminData } from "./command-center";
import { getPlatformHealth, getRevenueStats, getUserGrowthStats } from "./platform-read";

async function requireOSAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = (req as any).session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  const user = await storage.getUser(userId);
  if (!user || user.role !== "admin") {
    res.status(403).json({ message: "Forbidden — OS access requires admin role" });
    return false;
  }
  return true;
}

export function registerOSRoutes(app: Express): void {

  // ── Command Center — all live data in one shot ─────────────────────────────

  app.get("/api/os/command-center", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const [technical, operations, business, growth, admin] = await Promise.allSettled([
      runAllHealthChecks(),
      getOperationsData(),
      getBusinessData(),
      getGrowthData(),
      getAdminData(),
    ]);
    res.json({
      technical:  technical.status  === "fulfilled" ? technical.value  : [],
      operations: operations.status === "fulfilled" ? operations.value : [],
      business:   business.status   === "fulfilled" ? business.value   : [],
      growth:     growth.status     === "fulfilled" ? growth.value     : [],
      admin:      admin.status      === "fulfilled" ? admin.value      : [],
      generatedAt: new Date().toISOString(),
    });
  });

  // ── Lightweight status (used by Admin page indicator) ─────────────────────

  app.get("/api/os/status", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const [health, pendingRows, criticalRows] = await Promise.all([
        getPlatformHealth(),
        db.select({ count: drizzleSql<number>`COUNT(*)::int` })
          .from(osActions)
          .where(eq(osActions.status, "pending")),
        db.select({ count: drizzleSql<number>`COUNT(*)::int` })
          .from(osActions)
          .where(and(eq(osActions.status, "pending"), inArray(osActions.riskTier, ["high", "founder"]))),
      ]);
      const pending = pendingRows[0]?.count ?? 0;
      const critical = criticalRows[0]?.count ?? 0;

      let status: "green" | "yellow" | "red" = "green";
      let reason = "";
      if (health.systemStatus === "degraded" || critical > 0) {
        status = "red";
        reason = health.systemStatus === "degraded"
          ? "Platform degraded"
          : `${critical} critical action${critical > 1 ? "s" : ""} need attention`;
      } else if (pending > 0) {
        status = "yellow";
        reason = `${pending} action${pending > 1 ? "s" : ""} awaiting approval`;
      }

      res.json({ status, reason, pendingActions: pending, criticalActions: critical, platformHealth: health.systemStatus });
    } catch {
      res.json({ status: "red", reason: "Status check failed", pendingActions: 0, criticalActions: 0, platformHealth: "unknown" });
    }
  });

  // ── Unauthorized attempt logger (called by frontend OSAdminRoute) ──────────

  app.post("/api/os/unauthorized", async (req, res) => {
    const userId = (req as any).session?.userId;
    const { path, role } = req.body;
    await writeAuditLog({
      eventType: "os.unauthorized_access_attempt",
      description: `Unauthorized OS access: path="${path ?? "unknown"}" role="${role ?? "none"}" userId=${userId ?? "anonymous"}`,
    });
    res.json({ ok: true });
  });

  // ── Platform service health (honest — only DB gets a real check) ─────────

  app.get("/api/os/platform-health", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;

    type ServiceStatus = "unknown" | "healthy" | "warning" | "critical";
    type ServiceResult = { key: string; name: string; status: ServiceStatus; detail: string };

    const services: ServiceResult[] = [];
    const now = new Date().toISOString();

    // Database — real check
    try {
      await db.execute(drizzleSql`SELECT 1`);
      services.push({ key: "database", name: "Database", status: "healthy", detail: "SELECT 1 passed" });
    } catch (e: any) {
      services.push({ key: "database", name: "Database", status: "critical", detail: e?.message ?? "Query failed" });
    }

    // All others — no monitoring wired yet
    const unmonitored: Array<[string, string]> = [
      ["google_login", "Google Login"],
      ["apple_login", "Apple Login"],
      ["stripe", "Stripe"],
      ["push_notifications", "Push Notifications"],
      ["cloudinary", "Cloudinary"],
      ["r2_storage", "R2 Storage"],
      ["marketplace", "Marketplace"],
      ["verify_inspect", "Verify & Inspect"],
      ["load_board", "Load Board"],
      ["ai_or_not", "AI or Not"],
    ];
    for (const [key, name] of unmonitored) {
      services.push({ key, name, status: "unknown", detail: "No live check wired" });
    }

    res.json({ services, checkedAt: now });
  });

  // ── System Health ─────────────────────────────────────────────────────────

  app.get("/api/os/health", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const [health, agentRows, eventRows, pendingRows, auditRows] = await Promise.all([
        getPlatformHealth(),
        db.select({ count: drizzleSql<number>`COUNT(*)::int` }).from(osAgents),
        db.select({ count: drizzleSql<number>`COUNT(*)::int` }).from(osEvents),
        db
          .select({ count: drizzleSql<number>`COUNT(*)::int` })
          .from(osActions)
          .where(eq(osActions.status, "pending")),
        db.select({ count: drizzleSql<number>`COUNT(*)::int` }).from(osAuditLog),
      ]);
      res.json({
        status: "operational",
        platform: health,
        os: {
          agentsInRegistry: agentRows[0]?.count ?? 0,
          eventsLogged: eventRows[0]?.count ?? 0,
          pendingActions: pendingRows[0]?.count ?? 0,
          auditEntries: auditRows[0]?.count ?? 0,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Dashboard Summary ─────────────────────────────────────────────────────

  app.get("/api/os/dashboard", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const [health, revenue, growth, recentBriefings, pendingActions, recentEvents, recentRuns] =
        await Promise.all([
          getPlatformHealth(),
          getRevenueStats(),
          getUserGrowthStats(),
          db.select().from(osBriefings).orderBy(desc(osBriefings.createdAt)).limit(5),
          db
            .select()
            .from(osActions)
            .where(eq(osActions.status, "pending"))
            .orderBy(desc(osActions.createdAt))
            .limit(10),
          db.select().from(osEvents).orderBy(desc(osEvents.createdAt)).limit(20),
          db.select().from(osAgentRuns).orderBy(desc(osAgentRuns.startedAt)).limit(5),
        ]);
      res.json({
        health,
        revenue,
        growth,
        recentBriefings,
        pendingActions,
        recentEvents,
        recentRuns,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Agents ────────────────────────────────────────────────────────────────

  app.get("/api/os/agents", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const agents = await db.select().from(osAgents).orderBy(osAgents.key);
    res.json(agents);
  });

  app.patch("/api/os/agents/:key", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const { key } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== "boolean")
      return res.status(400).json({ message: "enabled (boolean) required" });
    await db.update(osAgents).set({ enabled }).where(eq(osAgents.key, key));
    await writeAuditLog({
      eventType: "agent.toggled",
      description: `Agent "${key}" ${enabled ? "enabled" : "disabled"} by admin`,
    });
    res.json({ ok: true });
  });

  // ── Events ────────────────────────────────────────────────────────────────

  app.get("/api/os/events", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);
    const offset = parseInt(req.query.offset as string || "0", 10);
    const events = await db
      .select()
      .from(osEvents)
      .orderBy(desc(osEvents.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(events);
  });

  app.post("/api/os/events/test", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const { eventType, payload } = req.body;
    await emitOSEvent(
      eventType ?? "system.test",
      payload ?? { message: "Test event from OS dashboard" },
      "system"
    );
    res.json({ ok: true });
  });

  // ── Actions Queue ─────────────────────────────────────────────────────────

  app.get("/api/os/actions", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const { status } = req.query;
    const query = db.select().from(osActions).orderBy(desc(osActions.createdAt)).limit(100);
    if (status && typeof status === "string") {
      const actions = await db
        .select()
        .from(osActions)
        .where(eq(osActions.status, status))
        .orderBy(desc(osActions.createdAt))
        .limit(100);
      return res.json(actions);
    }
    res.json(await query);
  });

  app.post("/api/os/actions/test", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const { actionType, payload, rationale } = req.body;
    const action = await proposeAction({
      agentKey: "system",
      actionType: actionType ?? "send.briefing",
      payload: payload ?? { message: "Test action from OS dashboard" },
      rationale: rationale ?? "Manual test — admin triggered",
    });
    res.json(action);
  });

  app.post("/api/os/actions/:id/decide", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) return res.status(400).json({ message: "Invalid action ID" });
    const userId = (req as any).session.userId;
    const { decision, note } = req.body;
    if (!["approved", "rejected"].includes(decision))
      return res.status(400).json({ message: "decision must be 'approved' or 'rejected'" });
    try {
      await decideAction(actionId, userId, decision, note);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/os/actions/:id/execute", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) return res.status(400).json({ message: "Invalid action ID" });
    try {
      await executeAction(actionId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ── Briefings ─────────────────────────────────────────────────────────────

  app.get("/api/os/briefings", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const briefings = await db
      .select()
      .from(osBriefings)
      .orderBy(desc(osBriefings.createdAt))
      .limit(50);
    res.json(briefings);
  });

  app.post("/api/os/briefings/:id/read", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const id = parseInt(req.params.id, 10);
    await db
      .update(osBriefings)
      .set({ readAt: new Date() })
      .where(eq(osBriefings.id, id));
    res.json({ ok: true });
  });

  // ── Founder Memory ────────────────────────────────────────────────────────

  app.get("/api/os/memory/founder", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const memories = await db
      .select()
      .from(osFounderMemory)
      .orderBy(desc(osFounderMemory.createdAt));
    res.json(memories);
  });

  app.post("/api/os/memory/founder", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const { topic, content, visibleTo, pinned } = req.body;
    if (!topic || !content)
      return res.status(400).json({ message: "topic and content are required" });
    const [mem] = await db
      .insert(osFounderMemory)
      .values({ topic, content, visibleTo: visibleTo ?? [], pinned: pinned ?? false })
      .returning();
    await writeAuditLog({
      eventType: "founder_memory.created",
      description: `Founder memory created: topic="${topic}"`,
    });
    res.json(mem);
  });

  app.patch("/api/os/memory/founder/:id", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const id = parseInt(req.params.id, 10);
    const { content, visibleTo, pinned } = req.body;
    await db
      .update(osFounderMemory)
      .set({ content, visibleTo, pinned, updatedAt: new Date() })
      .where(eq(osFounderMemory.id, id));
    await writeAuditLog({
      eventType: "founder_memory.updated",
      description: `Founder memory #${id} updated`,
    });
    res.json({ ok: true });
  });

  app.delete("/api/os/memory/founder/:id", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const id = parseInt(req.params.id, 10);
    await db.delete(osFounderMemory).where(eq(osFounderMemory.id, id));
    await writeAuditLog({
      eventType: "founder_memory.deleted",
      description: `Founder memory #${id} deleted`,
    });
    res.json({ ok: true });
  });

  app.get("/api/os/memory/agent/:key", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const memories = await db
      .select()
      .from(osAgentMemory)
      .where(eq(osAgentMemory.agentKey, req.params.key));
    res.json(memories);
  });

  // ── Agent Runs ────────────────────────────────────────────────────────────

  app.get("/api/os/runs", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const runs = await db
      .select()
      .from(osAgentRuns)
      .orderBy(desc(osAgentRuns.startedAt))
      .limit(50);
    res.json(runs);
  });

  // ── Audit Log ─────────────────────────────────────────────────────────────

  app.get("/api/os/audit-log", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const limit = Math.min(parseInt(req.query.limit as string || "100", 10), 500);
    const offset = parseInt(req.query.offset as string || "0", 10);
    const logs = await db
      .select()
      .from(osAuditLog)
      .orderBy(desc(osAuditLog.createdAt))
      .limit(limit)
      .offset(offset);
    res.json(logs);
  });
}
