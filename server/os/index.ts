import type { Express } from "express";
import { pool } from "../db";
import { startOSEventListener } from "./event-bus";
import { startAgentRunner } from "./agent-runner";
import { registerOSRoutes } from "./os-routes";
import { writeAuditLog } from "./logger";

async function setupOSTables(): Promise<void> {
  await pool
    .query(`
      CREATE TABLE IF NOT EXISTS os_agents (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT,
        enabled BOOLEAN DEFAULT true,
        schedule_cron TEXT,
        risk_policy JSONB,
        last_run_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS os_agent_memory (
        id SERIAL PRIMARY KEY,
        agent_key TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'agent',
        memory_key TEXT NOT NULL,
        memory_value JSONB,
        confidence REAL DEFAULT 1.0,
        source TEXT DEFAULT 'observed',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(agent_key, memory_key)
      );

      CREATE TABLE IF NOT EXISTS os_founder_memory (
        id SERIAL PRIMARY KEY,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        visible_to JSONB DEFAULT '[]'::jsonb,
        pinned BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS os_events (
        id SERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'platform',
        payload JSONB,
        processed_by JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_os_events_type_created
        ON os_events(event_type, created_at DESC);

      CREATE TABLE IF NOT EXISTS os_agent_runs (
        id SERIAL PRIMARY KEY,
        agent_key TEXT NOT NULL,
        trigger TEXT NOT NULL,
        trigger_ref_id INTEGER,
        status TEXT NOT NULL DEFAULT 'running',
        thinking TEXT,
        summary TEXT,
        actions_proposed INTEGER DEFAULT 0,
        actions_approved INTEGER DEFAULT 0,
        actions_executed INTEGER DEFAULT 0,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS os_actions (
        id SERIAL PRIMARY KEY,
        run_id INTEGER,
        agent_key TEXT NOT NULL,
        action_type TEXT NOT NULL,
        risk_tier TEXT NOT NULL,
        payload JSONB,
        rationale TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        approved_by TEXT,
        approved_at TIMESTAMP,
        executed_at TIMESTAMP,
        result JSONB,
        rejection_note TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_os_actions_status
        ON os_actions(status, risk_tier);
      CREATE INDEX IF NOT EXISTS idx_os_actions_agent
        ON os_actions(agent_key, created_at DESC);

      CREATE TABLE IF NOT EXISTS os_briefings (
        id SERIAL PRIMARY KEY,
        agent_key TEXT NOT NULL,
        period TEXT NOT NULL DEFAULT 'daily',
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        metrics JSONB,
        priority TEXT NOT NULL DEFAULT 'normal',
        read_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS os_approvals (
        id SERIAL PRIMARY KEY,
        action_id INTEGER NOT NULL,
        required_role TEXT NOT NULL DEFAULT 'admin',
        requested_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        decided_by INTEGER,
        decision TEXT,
        decided_at TIMESTAMP,
        note TEXT
      );

      CREATE TABLE IF NOT EXISTS os_audit_log (
        id SERIAL PRIMARY KEY,
        agent_key TEXT NOT NULL DEFAULT 'system',
        action_id INTEGER,
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        before_state JSONB,
        after_state JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_os_audit_log_created
        ON os_audit_log(created_at DESC);
    `)
    .catch((e: Error) => console.error("[os] Table setup error:", e.message));
}

export async function startOSRuntime(app: Express): Promise<void> {
  console.log("[os] Initializing GUBER OS Phase 1 Foundation...");

  await setupOSTables();

  registerOSRoutes(app);

  await startOSEventListener((eventType, source) => {
    console.log(`[os/event-bus] Received: ${eventType} from ${source}`);
  });

  startAgentRunner();

  await writeAuditLog({
    eventType: "os.boot",
    description: "GUBER OS Phase 1 Foundation started — event bus, approval engine, audit logger operational",
    afterState: { phase: 1, timestamp: new Date().toISOString() },
  });

  console.log("[os] GUBER OS Phase 1 ready.");
}
