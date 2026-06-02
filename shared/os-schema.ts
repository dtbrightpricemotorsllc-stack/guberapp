import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  real,
  serial,
  json,
} from "drizzle-orm/pg-core";

// ── GUBER OS Foundation Schema ─────────────────────────────────────────────
// All tables prefixed os_*. Zero changes to any existing GUBER tables.

export const osAgents = pgTable("os_agents", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  enabled: boolean("enabled").default(true),
  scheduleCron: text("schedule_cron"),
  riskPolicy: json("risk_policy").$type<Record<string, any>>(),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const osAgentMemory = pgTable("os_agent_memory", {
  id: serial("id").primaryKey(),
  agentKey: text("agent_key").notNull(),
  scope: text("scope").notNull().default("agent"),
  memoryKey: text("memory_key").notNull(),
  memoryValue: json("memory_value").$type<any>(),
  confidence: real("confidence").default(1.0),
  source: text("source").default("observed"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const osFounderMemory = pgTable("os_founder_memory", {
  id: serial("id").primaryKey(),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  visibleTo: json("visible_to").$type<string[]>().default([]),
  pinned: boolean("pinned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const osEvents = pgTable("os_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  source: text("source").notNull().default("platform"),
  payload: json("payload").$type<Record<string, any>>(),
  processedBy: json("processed_by").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const osAgentRuns = pgTable("os_agent_runs", {
  id: serial("id").primaryKey(),
  agentKey: text("agent_key").notNull(),
  trigger: text("trigger").notNull(),
  triggerRefId: integer("trigger_ref_id"),
  status: text("status").notNull().default("running"),
  thinking: text("thinking"),
  summary: text("summary"),
  actionsProposed: integer("actions_proposed").default(0),
  actionsApproved: integer("actions_approved").default(0),
  actionsExecuted: integer("actions_executed").default(0),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  error: text("error"),
});

export const osActions = pgTable("os_actions", {
  id: serial("id").primaryKey(),
  runId: integer("run_id"),
  agentKey: text("agent_key").notNull(),
  actionType: text("action_type").notNull(),
  riskTier: text("risk_tier").notNull(),
  payload: json("payload").$type<Record<string, any>>(),
  rationale: text("rationale"),
  status: text("status").notNull().default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  executedAt: timestamp("executed_at"),
  result: json("result").$type<Record<string, any>>(),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const osBriefings = pgTable("os_briefings", {
  id: serial("id").primaryKey(),
  agentKey: text("agent_key").notNull(),
  period: text("period").notNull().default("daily"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  metrics: json("metrics").$type<Record<string, any>>(),
  priority: text("priority").notNull().default("normal"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const osApprovals = pgTable("os_approvals", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id").notNull(),
  requiredRole: text("required_role").notNull().default("admin"),
  requestedAt: timestamp("requested_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  decidedBy: integer("decided_by"),
  decision: text("decision"),
  decidedAt: timestamp("decided_at"),
  note: text("note"),
});

export const osAuditLog = pgTable("os_audit_log", {
  id: serial("id").primaryKey(),
  agentKey: text("agent_key").notNull().default("system"),
  actionId: integer("action_id"),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  beforeState: json("before_state").$type<Record<string, any>>(),
  afterState: json("after_state").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Inferred types ──────────────────────────────────────────────────────────
export type OSAgent = typeof osAgents.$inferSelect;
export type OSAgentMemory = typeof osAgentMemory.$inferSelect;
export type OSFounderMemory = typeof osFounderMemory.$inferSelect;
export type OSEvent = typeof osEvents.$inferSelect;
export type OSAgentRun = typeof osAgentRuns.$inferSelect;
export type OSAction = typeof osActions.$inferSelect;
export type OSBriefing = typeof osBriefings.$inferSelect;
export type OSApproval = typeof osApprovals.$inferSelect;
export type OSAuditLogEntry = typeof osAuditLog.$inferSelect;
