/**
 * server/self-heal.ts — Layer 6 (self-healing PREP) of GUBER 24/7 Smart Monitoring.
 *
 * This is a deliberately small scaffold, NOT a full auto-remediation engine. The
 * automatic remediation that already ships lives in the monitoring pipeline
 * itself: every failure auto-creates a bug-report record (system_issues), the
 * scheduled probe sweep auto-resolves health-probe issues once the service
 * recovers, and Layer 4 attaches a suggested fix. This registry gives a future
 * version a single, typed place to plug in real recovery actions (retry a failed
 * external call, restart a stuck worker, re-warm a cache) per module without
 * re-plumbing the pipeline.
 *
 * Nothing here runs on a timer or performs destructive actions today.
 */

export interface SelfHealAction {
  /** Module this action can attempt to recover (matches system_issues.module). */
  module: string;
  /** Human-readable description of what the recovery does. */
  description: string;
  /**
   * Attempt recovery. Returns true if the action believes it healed the issue.
   * Implementations MUST be idempotent and side-effect-safe to call repeatedly.
   */
  attempt: (ctx: SelfHealContext) => Promise<boolean>;
}

export interface SelfHealContext {
  issueId: number;
  module: string;
  route?: string | null;
  errorMessage?: string | null;
}

const registry = new Map<string, SelfHealAction>();

/** Register a recovery action for a module. Later registrations override. */
export function registerSelfHeal(action: SelfHealAction): void {
  registry.set(action.module, action);
}

/** Look up a recovery action for a module, if one is registered. */
export function getSelfHeal(module: string): SelfHealAction | undefined {
  return registry.get(module);
}

/** List all registered recovery actions (for the admin dashboard / diagnostics). */
export function listSelfHealActions(): Array<{ module: string; description: string }> {
  return Array.from(registry.values()).map((a) => ({ module: a.module, description: a.description }));
}

// ── Example registration (safe no-op) ─────────────────────────────────────────
// Demonstrates the shape without taking any real action yet. A future version
// might, e.g., re-verify the Stripe balance endpoint and clear a transient flag.
registerSelfHeal({
  module: "network",
  description: "Placeholder: re-probe backend connectivity before escalating (no-op today).",
  attempt: async () => false,
});
