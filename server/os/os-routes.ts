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
import { runAllHealthChecks, runAppHealthChecks } from "./health-checks";
import { getOperationsData, getBusinessData, getGrowthData, getAdminData } from "./command-center";
import { runCOOAnalysis, getLatestCOOBriefing, queueRecommendation, type COOFinding } from "./coo-agent";
import { runCFOAnalysis, getLatestCFOBriefing } from "./cfo-agent";
import { runGrowthAnalysis, getLatestGrowthBriefing } from "./growth-agent";
import { seedSimulation, cleanupSimulation, runPostSeedAnalysis } from "./simulation";
import { runHealthMonitor } from "./health-monitor";
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

  // ── Platform service health — real checks via health-checks.ts ──────────

  app.get("/api/os/platform-health", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const results = await runAllHealthChecks();
      res.json({ services: results, checkedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Health check failed" });
    }
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

  // ── COO Agent ─────────────────────────────────────────────────────────────

  // GET latest saved briefing (fast — no DB analysis, just reads last stored row)
  app.get("/api/os/coo/briefing", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const briefing = await getLatestCOOBriefing();
      res.json({ briefing }); // null if never generated
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to fetch COO briefing" });
    }
  });

  // POST generate a fresh briefing (runs all 8 analyses, stores to DB)
  app.post("/api/os/coo/generate", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const briefing = await runCOOAnalysis();
      res.json({ briefing });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "COO analysis failed" });
    }
  });

  // POST queue a finding as a founder-review recommendation (creates osAction)
  app.post("/api/os/coo/queue", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const finding: COOFinding = req.body.finding;
    if (!finding?.id || !finding?.issue) {
      return res.status(400).json({ message: "finding required" });
    }
    try {
      const actionId = await queueRecommendation(finding);
      res.json({ actionId, message: "Queued for founder review" });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to queue recommendation" });
    }
  });

  // ── CFO Agent ─────────────────────────────────────────────────────────────

  app.get("/api/os/cfo/briefing", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const briefing = await getLatestCFOBriefing();
      res.json({ briefing });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed to fetch CFO briefing" });
    }
  });

  // ── Growth Agent ──────────────────────────────────────────────────────────

  app.get("/api/os/growth/briefing", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const briefing = await getLatestGrowthBriefing();
    res.json({ briefing });
  });

  app.post("/api/os/growth/generate", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const briefing = await runGrowthAnalysis();
      res.json(briefing);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Growth analysis failed" });
    }
  });

  app.post("/api/os/cfo/generate", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const briefing = await runCFOAnalysis();
      res.json({ briefing });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "CFO analysis failed" });
    }
  });

  // ── Simulation (dev/test data injection) ─────────────────────────────────

  app.post("/api/os/simulation/seed", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const summary = await seedSimulation();
      const analysis = await runPostSeedAnalysis();
      await writeAuditLog({
        eventType: "simulation.seeded",
        description: `Simulation data seeded: ${summary.jobs} jobs, ${summary.hirers + summary.workers} users, ${summary.disputes} dispute`,
        afterState: { summary, analysis },
      });
      res.json({ ok: true, summary, analysis });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Seed failed" });
    }
  });

  app.delete("/api/os/simulation/cleanup", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const deleted = await cleanupSimulation();
      await writeAuditLog({
        eventType: "simulation.cleaned",
        description: `Simulation data removed: ${deleted.users} users, ${deleted.jobs} jobs`,
        afterState: deleted,
      });
      res.json({ ok: true, deleted });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Cleanup failed" });
    }
  });

  // ── Health Monitor ────────────────────────────────────────────────────────

  app.post("/api/os/health/run", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const result = await runHealthMonitor();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Health monitor failed" });
    }
  });

  // ── Mission Control endpoints ──────────────────────────────────────────────

  app.get("/api/admin/growth-snapshot", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const { pool } = await import("../db");
      const [usersRes, zipsRes, ogsRes, trustBoxRes] = await Promise.all([
        pool.query<{ total: string; today: string; week: string }>(`
          SELECT
            COUNT(*)::text                                                             AS total,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day')::text      AS today,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text     AS week
          FROM users
          WHERE is_test_user = false AND email NOT ILIKE '%@guberapp.internal'
        `),
        pool.query<{ active: string; dead: string }>(`
          SELECT
            COUNT(*) FILTER (WHERE u_count >= 1)::text AS active,
            COUNT(*) FILTER (WHERE u_count = 0)::text  AS dead
          FROM (
            SELECT z.zip, COUNT(DISTINCT u.id) AS u_count
            FROM (
              SELECT DISTINCT SUBSTRING(zip_code, 1, 5) AS zip
              FROM users
              WHERE zip_code IS NOT NULL AND is_test_user = false
            ) z
            LEFT JOIN users u ON SUBSTRING(u.zip_code, 1, 5) = z.zip AND u.is_test_user = false
            GROUP BY z.zip
          ) t
        `),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM users WHERE day1_og = true AND is_test_user = false`
        ),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM users WHERE trust_box_purchased = true AND is_test_user = false`
        ),
      ]);
      res.json({
        totalUsers:               parseInt(usersRes.rows[0].total),
        newUsersToday:            parseInt(usersRes.rows[0].today),
        newUsersThisWeek:         parseInt(usersRes.rows[0].week),
        activeZipCodes:           parseInt(zipsRes.rows[0].active),
        deadZipCodes:             parseInt(zipsRes.rows[0].dead),
        day1OgCount:              parseInt(ogsRes.rows[0].cnt),
        trustToolboxSubscriptions: parseInt(trustBoxRes.rows[0].cnt),
      });
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed" });
    }
  });

  app.get("/api/admin/zip-health", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const { pool } = await import("../db");
      const { rows } = await pool.query<{
        zip: string;
        users: string;
        workers: string;
        open_jobs: string;
        completed_jobs: string;
        businesses: string;
      }>(`
        WITH zips AS (
          SELECT DISTINCT SUBSTRING(zip_code, 1, 5) AS zip
          FROM users
          WHERE zip_code IS NOT NULL AND is_test_user = false
        )
        SELECT
          z.zip,
          COUNT(DISTINCT u.id)::text                                                                     AS users,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'helper')::text                                    AS workers,
          COUNT(DISTINCT j.id) FILTER (WHERE j.status NOT IN ('completed','expired','cancelled'))::text  AS open_jobs,
          COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'completed')::text                              AS completed_jobs,
          COUNT(DISTINCT bp.id)::text                                                                    AS businesses
        FROM zips z
        LEFT JOIN users u         ON SUBSTRING(u.zip_code, 1, 5) = z.zip AND u.is_test_user = false
        LEFT JOIN jobs j          ON j.posted_by_id = u.id
        LEFT JOIN business_profiles bp ON bp.user_id = u.id
        GROUP BY z.zip
        ORDER BY COUNT(DISTINCT u.id) DESC
        LIMIT 100
      `);

      const result = rows.map(r => {
        const users    = parseInt(r.users);
        const workers  = parseInt(r.workers);
        const openJobs = parseInt(r.open_jobs);
        let healthStatus = "Healthy";
        if (users === 0)                              healthStatus = "Needs Users";
        else if (workers === 0)                       healthStatus = "Needs Workers";
        else if (openJobs >= 5 && workers <= 2)       healthStatus = "Hot Zone";
        else if (openJobs === 0)                      healthStatus = "Needs Jobs";
        return {
          code:           r.zip,
          users,
          workers,
          openJobs,
          completedJobs:  parseInt(r.completed_jobs),
          businesses:     parseInt(r.businesses),
          listings:       0,
          healthStatus,
        };
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed" });
    }
  });

  app.get("/api/admin/ai-recommendations", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const actions = await db
        .select()
        .from(osActions)
        .where(and(eq(osActions.agentKey, "growth"), eq(osActions.status, "pending")))
        .orderBy(desc(osActions.createdAt))
        .limit(20);

      const result = actions.map(a => {
        const p = (a.payload ?? {}) as Record<string, any>;
        return {
          id:         a.id,
          zipCode:    p.zip ?? (p.targetZips as string[] | undefined)?.[0] ?? "—",
          category:   a.actionType.replace(".", " / "),
          guidance:   a.rationale ?? "",
          actionType: a.actionType,
          targetType: a.riskTier,
        };
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed" });
    }
  });

  app.get("/api/admin/marketing-queue", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const actions = await db
        .select()
        .from(osActions)
        .where(and(eq(osActions.agentKey, "growth"), eq(osActions.status, "pending")))
        .orderBy(desc(osActions.createdAt))
        .limit(10);

      const PLATFORM_MAP: Record<string, string> = {
        "schedule.cash_drop": "All Channels",
        "queue.outreach":     "Email",
        "alert.founder":      "Internal",
      };
      const TIMESLOT_MAP: Record<string, string> = {
        "schedule.cash_drop": "ASAP",
        "queue.outreach":     "Next Batch",
        "alert.founder":      "Immediate",
      };

      const result = actions.map(a => {
        const p = (a.payload ?? {}) as Record<string, any>;
        const headline =
          a.actionType === "schedule.cash_drop"
            ? `Cash Drop — ZIP ${p.zip}`
            : a.actionType === "queue.outreach"
            ? `Worker Recruitment — ${(p.targetZips as string[] | undefined)?.join(", ") ?? "multiple ZIPs"}`
            : "Founder Alert — Growth Stall Detected";
        return {
          id:              a.id,
          platform:        PLATFORM_MAP[a.actionType] ?? "All Channels",
          timeSlot:        TIMESLOT_MAP[a.actionType] ?? "Scheduled",
          targetCityOrZip: p.zip ?? (p.targetZips as string[] | undefined)?.[0] ?? null,
          reasonGenerated: a.rationale ?? "Growth Agent analysis",
          headline,
          body: p.message ?? p.reason ?? a.rationale ?? "",
        };
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "Failed" });
    }
  });

  app.get("/api/admin/app-health", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    try {
      const report = await runAppHealthChecks();
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ message: e?.message ?? "App health check failed" });
    }
  });

  app.post("/api/admin/marketing/publish/:id", async (req, res) => {
    if (!(await requireOSAdmin(req, res))) return;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) return res.status(400).json({ message: "Invalid action ID" });
    const userId = (req as any).session.userId;
    try {
      await decideAction(actionId, userId, "approved", "Approved via Mission Control");
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ message: e?.message ?? "Failed" });
    }
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
