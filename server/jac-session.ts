/**
 * JAC Workflow Session Memory
 *
 * Stores per-user mid-conversation state so JAC can resolve pronouns like
 * "change that" or "make it Friday" without restarting the workflow.
 *
 * Persistence: Postgres `jac_session_state` table (provisioned in server/index.ts).
 * Performance: 30-second in-memory read cache per user (single-process safe).
 * TTL: sessions older than 2 hours are treated as empty (user has moved on).
 *
 * Voice and text share the same session state, keyed purely by userId.
 */

import { pool } from "./db";

export interface JacSessionState {
  userId: number;
  /** Natural-language summary of what the user is trying to accomplish. */
  currentObjective: string | null;
  /**
   * Active workflow name:
   *   "create_job" | "edit_job" | "create_marketplace_listing" |
   *   "create_load" | "browse_jobs" | "browse_missions" | null
   */
  currentWorkflow: string | null;
  /**
   * ID of the job/listing/load/request currently being assembled or edited.
   * Stored as a string to cover both integer job IDs and UUID-style IDs.
   */
  draftObjectId: string | null;
  /** Partial field values collected across turns so far for the active draft. */
  collectedFields: Record<string, unknown>;
  /** jac_pending_actions.id waiting for user confirmation, or null. */
  pendingApprovalId: number | null;
  /**
   * Module the conversation is focused on:
   *   "jobs" | "marketplace" | "load_board" | "missions" | "profile" | null
   */
  selectedModule: string | null;
  updatedAt: Date | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Sessions older than 2 h are expired and treated as blank. */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** How long the in-process read cache is valid before we re-check the DB. */
const CACHE_TTL_MS = 30_000;

// ── In-memory cache ──────────────────────────────────────────────────────────

const _cache = new Map<number, { state: JacSessionState; loadedAt: number }>();

function _emptySession(userId: number): JacSessionState {
  return {
    userId,
    currentObjective: null,
    currentWorkflow: null,
    draftObjectId: null,
    collectedFields: {},
    pendingApprovalId: null,
    selectedModule: null,
    updatedAt: null,
  };
}

function _isExpired(state: JacSessionState): boolean {
  if (!state.updatedAt) return true;
  return Date.now() - state.updatedAt.getTime() > SESSION_TTL_MS;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Read the current session state for a user.
 * Returns an empty session if none exists or if the stored session has expired.
 * Never throws — DB errors are logged and an empty session is returned.
 */
export async function getJacSession(userId: number): Promise<JacSessionState> {
  // Serve from cache if fresh
  const cached = _cache.get(userId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return _isExpired(cached.state) ? _emptySession(userId) : cached.state;
  }

  try {
    const result = await pool.query(
      `SELECT user_id, current_objective, current_workflow, draft_object_id,
              collected_fields, pending_approval_id, selected_module, updated_at
       FROM jac_session_state WHERE user_id = $1`,
      [userId]
    );

    if (!result.rows.length) {
      const empty = _emptySession(userId);
      _cache.set(userId, { state: empty, loadedAt: Date.now() });
      return empty;
    }

    const row = result.rows[0];
    const state: JacSessionState = {
      userId,
      currentObjective: row.current_objective ?? null,
      currentWorkflow: row.current_workflow ?? null,
      draftObjectId: row.draft_object_id ?? null,
      collectedFields:
        row.collected_fields && typeof row.collected_fields === "object"
          ? (row.collected_fields as Record<string, unknown>)
          : {},
      pendingApprovalId: row.pending_approval_id ?? null,
      selectedModule: row.selected_module ?? null,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };

    if (_isExpired(state)) {
      const empty = _emptySession(userId);
      _cache.set(userId, { state: empty, loadedAt: Date.now() });
      return empty;
    }

    _cache.set(userId, { state, loadedAt: Date.now() });
    return state;
  } catch (e: any) {
    console.error("[jac-session] getJacSession error:", e.message);
    return _emptySession(userId);
  }
}

/**
 * Write a partial update to the session state.
 *
 * By default `collectedFields` are *merged* (not replaced) with the existing
 * fields so edit callers only need to pass the fields that changed.
 *
 * Pass `replaceFields: true` when starting a brand-new draft so stale fields
 * from a previous draft never bleed into the new one.
 *
 * Never throws — DB errors are logged silently.
 */
export async function setJacSession(
  userId: number,
  patch: Partial<Omit<JacSessionState, "userId" | "updatedAt">>,
  options: { replaceFields?: boolean } = {}
): Promise<boolean> {
  // Load current state (may come from cache)
  const existing = await getJacSession(userId);

  const merged: JacSessionState = {
    ...existing,
    ...patch,
    userId,
    // Replace collectedFields entirely when creating a new draft so stale
    // scheduling/location/pricing data from a previous draft doesn't carry over.
    // Merge (default) only for edit operations on the same active draft.
    collectedFields:
      patch.collectedFields !== undefined
        ? options.replaceFields
          ? patch.collectedFields                            // hard replace
          : { ...existing.collectedFields, ...patch.collectedFields }  // merge
        : existing.collectedFields,
    updatedAt: new Date(),
  };

  try {
    await pool.query(
      `INSERT INTO jac_session_state
         (user_id, current_objective, current_workflow, draft_object_id,
          collected_fields, pending_approval_id, selected_module, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         current_objective  = EXCLUDED.current_objective,
         current_workflow   = EXCLUDED.current_workflow,
         draft_object_id    = EXCLUDED.draft_object_id,
         collected_fields   = EXCLUDED.collected_fields,
         pending_approval_id = EXCLUDED.pending_approval_id,
         selected_module    = EXCLUDED.selected_module,
         updated_at         = NOW()`,
      [
        userId,
        merged.currentObjective,
        merged.currentWorkflow,
        merged.draftObjectId,
        JSON.stringify(merged.collectedFields),
        merged.pendingApprovalId,
        merged.selectedModule,
      ]
    );
    // Do not report a transferred/resumable workflow until it is durable.
    _cache.set(userId, { state: merged, loadedAt: Date.now() });
    return true;
  } catch (e: any) {
    console.error("[jac-session] setJacSession error:", e.message);
    return false;
  }
}

/**
 * Wipe the session entirely (e.g., user finishes a workflow or explicitly resets).
 * Never throws.
 */
export async function clearJacSession(userId: number): Promise<void> {
  _cache.delete(userId);
  try {
    await pool.query(`DELETE FROM jac_session_state WHERE user_id = $1`, [userId]);
  } catch (e: any) {
    console.error("[jac-session] clearJacSession error:", e.message);
  }
}

/**
 * Build a compact summary string that JAC's brain can include in prompts
 * to stay aware of the ongoing workflow without burning many tokens.
 */
export function summarizeSession(state: JacSessionState): string | null {
  if (!state.currentWorkflow && !state.draftObjectId && !state.currentObjective) {
    return null;
  }
  const parts: string[] = [];
  if (state.currentObjective) parts.push(`goal: "${state.currentObjective}"`);
  if (state.currentWorkflow) parts.push(`workflow: ${state.currentWorkflow}`);
  if (state.draftObjectId) parts.push(`draft_id: ${state.draftObjectId}`);
  if (state.selectedModule) parts.push(`module: ${state.selectedModule}`);
  const fieldKeys = Object.keys(state.collectedFields);
  if (fieldKeys.length) parts.push(`fields_collected: ${fieldKeys.join(", ")}`);
  if (state.pendingApprovalId) parts.push(`pending_approval: ${state.pendingApprovalId}`);
  return parts.join(" | ");
}
