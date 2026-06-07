/**
 * GUBER Growth Engine — ZIP-based fallback tasks, credits/score, anti-abuse.
 *
 * Growth tasks are NOT marketplace jobs. They live in their own tables and
 * NEVER appear in real job counts, paid-work flows, or dashboard job stats.
 * Admin controls every tunable value via growth_reward_config; nothing is
 * hardcoded in this module.
 *
 * Credit math: 100 growthCredits = $1. Min cashout = 1,000 credits ($10).
 * Day-1 OG members receive a per-template ogBonusPct bonus (default +25%).
 */

import { pool } from "./db";
import { isFeatureEnabledFor } from "./feature-flags";
import { lookupZipCity } from "./zip-geocode";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GrowthTask {
  id: number;
  emoji: string;
  title: string;
  description: string | null;
  rewardCredits: number;
  rewardScore: number;
  ogBonusPct: number;
  category: string;
  sortOrder: number;
}

export interface ZipFallbackResult {
  hasFallback: boolean;
  realJobCount: number;
  showAlongsideReal: boolean;
  tasks: GrowthTask[];
  maxTasksShown: number;
}

export type ReferralMilestone =
  | "referral_creates_account"
  | "referral_verifies_id"
  | "referral_stripe_connected"
  | "referral_first_paid_job"
  | "referral_og_purchase_referrer"
  | "referral_og_purchase_referred";

// ── Fallback config lookup (most-specific scope wins) ─────────────────────────

async function getFallbackConfig(zip: string): Promise<{
  enabled: boolean;
  showWhenRealJobsExist: boolean;
  maxTasksShown: number;
}> {
  const cityRow = lookupZipCity(zip);
  const city = cityRow?.city ?? null;
  const state = cityRow?.state ?? null;

  const scopeValues: string[] = [zip];
  if (city) scopeValues.push(city);
  if (state) scopeValues.push(state);

  const res = await pool.query(
    `SELECT enabled, show_when_real_jobs_exist, max_tasks_shown, scope
     FROM zip_fallback_settings
     WHERE (scope = 'zip'    AND scope_value = $1)
        OR (scope = 'city'   AND scope_value = $2)
        OR (scope = 'state'  AND scope_value = $3)
        OR (scope = 'global')
     ORDER BY CASE scope
       WHEN 'zip'    THEN 1
       WHEN 'city'   THEN 2
       WHEN 'state'  THEN 3
       ELSE 4
     END
     LIMIT 1`,
    [zip, city ?? "", state ?? ""]
  );
  const row = res.rows[0];
  return row
    ? {
        enabled: row.enabled,
        showWhenRealJobsExist: row.show_when_real_jobs_exist,
        maxTasksShown: row.max_tasks_shown,
      }
    : { enabled: true, showWhenRealJobsExist: false, maxTasksShown: 6 };
}

// ── Count real user-posted jobs in a ZIP ─────────────────────────────────────

export async function countRealJobsInZip(zip: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) FROM jobs
     WHERE zip = $1
       AND status = 'posted_public'
       AND is_test_job = false
       AND is_published = true`,
    [zip]
  );
  return parseInt(res.rows[0]?.count ?? "0", 10);
}

// ── Main: get ZIP fallback tasks for display ──────────────────────────────────

export async function getZipFallbackTasks(
  zip: string,
  viewer?: { id?: number | null; role?: string | null } | null
): Promise<ZipFallbackResult> {
  const flagEnabled = await isFeatureEnabledFor("zip_fallback_growth_tasks", viewer ?? null);
  if (!flagEnabled) {
    return { hasFallback: false, realJobCount: 0, showAlongsideReal: false, tasks: [], maxTasksShown: 6 };
  }

  const cfg = await getFallbackConfig(zip);
  if (!cfg.enabled) {
    return { hasFallback: false, realJobCount: 0, showAlongsideReal: false, tasks: [], maxTasksShown: cfg.maxTasksShown };
  }

  const realJobCount = await countRealJobsInZip(zip);

  if (realJobCount > 0 && !cfg.showWhenRealJobsExist) {
    return { hasFallback: false, realJobCount, showAlongsideReal: false, tasks: [], maxTasksShown: cfg.maxTasksShown };
  }

  const res = await pool.query(
    `SELECT id, emoji, title, description, reward_credits, reward_score,
            og_bonus_pct, category, sort_order
     FROM growth_task_templates
     WHERE is_active = true AND paused = false
     ORDER BY sort_order ASC, id ASC
     LIMIT $1`,
    [cfg.maxTasksShown]
  );

  const tasks: GrowthTask[] = res.rows.map((r: any) => ({
    id: r.id,
    emoji: r.emoji,
    title: r.title,
    description: r.description,
    rewardCredits: r.reward_credits,
    rewardScore: r.reward_score,
    ogBonusPct: r.og_bonus_pct,
    category: r.category,
    sortOrder: r.sort_order,
  }));

  return {
    hasFallback: tasks.length > 0,
    realJobCount,
    showAlongsideReal: cfg.showWhenRealJobsExist,
    tasks,
    maxTasksShown: cfg.maxTasksShown,
  };
}

// ── Reward config helpers ─────────────────────────────────────────────────────

export async function getRewardConfigValue(key: string, fallback: number): Promise<number> {
  const res = await pool.query(`SELECT value_int FROM growth_reward_config WHERE key = $1`, [key]);
  return res.rows[0] ? parseInt(res.rows[0].value_int, 10) : fallback;
}

export async function getRewardConfigAll(): Promise<Array<{ key: string; valueInt: number; label: string; description: string | null }>> {
  const res = await pool.query(
    `SELECT key, value_int AS "valueInt", label, description FROM growth_reward_config ORDER BY key`
  );
  return res.rows;
}

export async function updateRewardConfigKey(key: string, valueInt: number): Promise<void> {
  await pool.query(
    `UPDATE growth_reward_config SET value_int = $1, updated_at = NOW() WHERE key = $2`,
    [valueInt, key]
  );
}

// ── Complete a growth task (with anti-abuse) ──────────────────────────────────

export interface CompleteGrowthTaskParams {
  userId: number;
  templateId: number;
  zip: string;
  submissionData?: Record<string, unknown>;
  deviceFingerprint?: string;
  ipAddress?: string;
  lat?: number;
  lng?: number;
  isDay1OG?: boolean;
}

export interface CompleteGrowthTaskResult {
  success: boolean;
  creditsAwarded: number;
  scoreAwarded: number;
  rejectionReason?: string;
}

export async function completeGrowthTask(params: CompleteGrowthTaskParams): Promise<CompleteGrowthTaskResult> {
  const { userId, templateId, zip, submissionData, deviceFingerprint, ipAddress, lat, lng, isDay1OG } = params;

  // 1. Load & validate template
  const tplRes = await pool.query(
    `SELECT id, reward_credits, reward_score, og_bonus_pct, is_active, paused FROM growth_task_templates WHERE id = $1`,
    [templateId]
  );
  const tpl = tplRes.rows[0];
  if (!tpl || !tpl.is_active || tpl.paused) {
    return { success: false, creditsAwarded: 0, scoreAwarded: 0, rejectionReason: "Task not available" };
  }

  // 2. Same-user same-day dedup
  const dupRes = await pool.query(
    `SELECT id FROM growth_task_completions
     WHERE user_id = $1 AND template_id = $2 AND status = 'approved'
       AND created_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [userId, templateId]
  );
  if (dupRes.rows.length > 0) {
    return { success: false, creditsAwarded: 0, scoreAwarded: 0, rejectionReason: "Already completed today" };
  }

  // 3. Same-device guard (different user, same device, same task, same day)
  if (deviceFingerprint) {
    const devRes = await pool.query(
      `SELECT id FROM growth_task_completions
       WHERE device_fingerprint = $1 AND template_id = $2 AND user_id != $3 AND status = 'approved'
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [deviceFingerprint, templateId, userId]
    );
    if (devRes.rows.length > 0) {
      await pool.query(
        `INSERT INTO growth_task_completions
           (user_id, template_id, zip, credits_awarded, score_awarded, submission_data,
            device_fingerprint, ip_address, lat, lng, status, rejection_reason)
         VALUES ($1,$2,$3,0,0,$4,$5,$6,$7,$8,'suspicious','same_device_different_user')`,
        [userId, templateId, zip, JSON.stringify(submissionData ?? {}),
         deviceFingerprint, ipAddress ?? null, lat ?? null, lng ?? null]
      );
      return { success: false, creditsAwarded: 0, scoreAwarded: 0, rejectionReason: "Device already used today" };
    }
  }

  // 4. GPS sanity (must be plausible US coordinates if provided)
  if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
    const inUS = lat >= 18 && lat <= 72 && lng >= -180 && lng <= -65;
    if (!inUS) {
      await pool.query(
        `INSERT INTO growth_task_completions
           (user_id, template_id, zip, credits_awarded, score_awarded, submission_data,
            device_fingerprint, ip_address, lat, lng, status, rejection_reason)
         VALUES ($1,$2,$3,0,0,$4,$5,$6,$7,$8,'suspicious','gps_out_of_bounds')`,
        [userId, templateId, zip, JSON.stringify(submissionData ?? {}),
         deviceFingerprint ?? null, ipAddress ?? null, lat, lng]
      );
      return { success: false, creditsAwarded: 0, scoreAwarded: 0, rejectionReason: "Location check failed" };
    }
  }

  // 5. Compute reward (OG bonus applied on top)
  let credits: number = tpl.reward_credits;
  let score: number = tpl.reward_score;
  if (isDay1OG) {
    const bonusPct: number = tpl.og_bonus_pct ?? 25;
    credits = Math.round(credits * (1 + bonusPct / 100));
    score   = Math.round(score   * (1 + bonusPct / 100));
  }

  // 6. Record + award atomically
  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO growth_task_completions
         (user_id, template_id, zip, credits_awarded, score_awarded, submission_data,
          device_fingerprint, ip_address, lat, lng, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved')`,
      [userId, templateId, zip, credits, score,
       JSON.stringify(submissionData ?? {}),
       deviceFingerprint ?? null, ipAddress ?? null, lat ?? null, lng ?? null]
    );
    await pool.query(
      `UPDATE users
       SET growth_credits = COALESCE(growth_credits, 0) + $1,
           guber_score    = COALESCE(guber_score, 0)    + $2
       WHERE id = $3`,
      [credits, score, userId]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  return { success: true, creditsAwarded: credits, scoreAwarded: score };
}

// ── Referral milestone credit/score awards ────────────────────────────────────

const REFERRAL_CONFIG_KEYS: Record<ReferralMilestone, { referrerCr: string; referrerSc: string; referredCr?: string; referredSc?: string }> = {
  referral_creates_account:      { referrerCr: "referral_signup_credits",             referrerSc: "referral_signup_score" },
  referral_verifies_id:          { referrerCr: "referral_verified_credits",           referrerSc: "referral_verified_score" },
  referral_stripe_connected:     { referrerCr: "referral_stripe_connected_credits",   referrerSc: "referral_stripe_connected_score" },
  referral_first_paid_job:       { referrerCr: "referral_first_paid_job_credits",     referrerSc: "referral_first_paid_job_score" },
  referral_og_purchase_referrer: { referrerCr: "referral_og_purchase_referrer_credits", referrerSc: "referral_og_purchase_referrer_score" },
  referral_og_purchase_referred: { referrerCr: "referral_og_purchase_referred_credits", referrerSc: "referral_og_purchase_referred_score" },
};

export async function awardReferralGrowthCredits(
  event: ReferralMilestone,
  referrerId: number,
  referredId?: number
): Promise<void> {
  const cfg = REFERRAL_CONFIG_KEYS[event];
  const [rCr, rSc] = await Promise.all([
    getRewardConfigValue(cfg.referrerCr, 0),
    getRewardConfigValue(cfg.referrerSc, 0),
  ]);
  if (rCr > 0 || rSc > 0) {
    await pool.query(
      `UPDATE users SET growth_credits = COALESCE(growth_credits,0)+$1, guber_score = COALESCE(guber_score,0)+$2 WHERE id = $3`,
      [rCr, rSc, referrerId]
    );
  }
  if ((event === "referral_og_purchase_referred") && referredId && cfg.referredCr && cfg.referredSc) {
    const [refCr, refSc] = await Promise.all([
      getRewardConfigValue(cfg.referredCr, 0),
      getRewardConfigValue(cfg.referredSc, 0),
    ]);
    if (refCr > 0 || refSc > 0) {
      await pool.query(
        `UPDATE users SET growth_credits = COALESCE(growth_credits,0)+$1, guber_score = COALESCE(guber_score,0)+$2 WHERE id = $3`,
        [refCr, refSc, referredId]
      );
    }
  }
}

// ── Admin helpers ─────────────────────────────────────────────────────────────

export async function listGrowthTaskTemplates() {
  const res = await pool.query(
    `SELECT id, emoji, title, description, reward_credits, reward_score, og_bonus_pct,
            category, is_active, paused, sort_order, created_at, updated_at
     FROM growth_task_templates ORDER BY sort_order ASC, id ASC`
  );
  return res.rows;
}

export async function createGrowthTaskTemplate(data: {
  emoji: string; title: string; description?: string;
  rewardCredits: number; rewardScore: number; ogBonusPct?: number;
  category?: string; sortOrder?: number;
}) {
  const res = await pool.query(
    `INSERT INTO growth_task_templates
       (emoji, title, description, reward_credits, reward_score, og_bonus_pct, category, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [data.emoji, data.title, data.description ?? null, data.rewardCredits, data.rewardScore,
     data.ogBonusPct ?? 25, data.category ?? "community", data.sortOrder ?? 0]
  );
  return res.rows[0];
}

export async function updateGrowthTaskTemplate(id: number, data: Partial<{
  emoji: string; title: string; description: string | null;
  rewardCredits: number; rewardScore: number; ogBonusPct: number;
  category: string; isActive: boolean; paused: boolean; sortOrder: number;
}>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.emoji       !== undefined) { sets.push(`emoji = $${i++}`);          vals.push(data.emoji); }
  if (data.title       !== undefined) { sets.push(`title = $${i++}`);          vals.push(data.title); }
  if (data.description !== undefined) { sets.push(`description = $${i++}`);    vals.push(data.description); }
  if (data.rewardCredits !== undefined) { sets.push(`reward_credits = $${i++}`); vals.push(data.rewardCredits); }
  if (data.rewardScore   !== undefined) { sets.push(`reward_score = $${i++}`);   vals.push(data.rewardScore); }
  if (data.ogBonusPct    !== undefined) { sets.push(`og_bonus_pct = $${i++}`);   vals.push(data.ogBonusPct); }
  if (data.category      !== undefined) { sets.push(`category = $${i++}`);       vals.push(data.category); }
  if (data.isActive      !== undefined) { sets.push(`is_active = $${i++}`);      vals.push(data.isActive); }
  if (data.paused        !== undefined) { sets.push(`paused = $${i++}`);          vals.push(data.paused); }
  if (data.sortOrder     !== undefined) { sets.push(`sort_order = $${i++}`);     vals.push(data.sortOrder); }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE growth_task_templates SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function deleteGrowthTaskTemplate(id: number): Promise<void> {
  await pool.query(`DELETE FROM growth_task_templates WHERE id = $1`, [id]);
}

export async function listZipSettings() {
  const res = await pool.query(
    `SELECT id, scope, scope_value, enabled, show_when_real_jobs_exist, max_tasks_shown, updated_at
     FROM zip_fallback_settings
     ORDER BY CASE scope WHEN 'global' THEN 1 WHEN 'state' THEN 2 WHEN 'city' THEN 3 ELSE 4 END, scope_value`
  );
  return res.rows;
}

export async function upsertZipSetting(scope: string, scopeValue: string, data: {
  enabled?: boolean;
  showWhenRealJobsExist?: boolean;
  maxTasksShown?: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO zip_fallback_settings (scope, scope_value, enabled, show_when_real_jobs_exist, max_tasks_shown, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (scope, scope_value) DO UPDATE
       SET enabled                 = EXCLUDED.enabled,
           show_when_real_jobs_exist = EXCLUDED.show_when_real_jobs_exist,
           max_tasks_shown         = EXCLUDED.max_tasks_shown,
           updated_at              = NOW()`,
    [scope, scopeValue, data.enabled ?? true, data.showWhenRealJobsExist ?? false, data.maxTasksShown ?? 6]
  );
}

export async function deleteZipSetting(id: number): Promise<void> {
  await pool.query(`DELETE FROM zip_fallback_settings WHERE id = $1 AND scope != 'global'`, [id]);
}

export async function listGrowthCompletions(page = 1, pageSize = 50) {
  const offset = (page - 1) * pageSize;
  const res = await pool.query(
    `SELECT c.id, c.user_id, c.template_id, t.title, t.emoji,
            c.zip, c.credits_awarded, c.score_awarded, c.status, c.rejection_reason,
            c.device_fingerprint, c.ip_address, c.lat, c.lng, c.created_at,
            u.username, u.email
     FROM growth_task_completions c
     JOIN growth_task_templates t ON t.id = c.template_id
     JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  const countRes = await pool.query(`SELECT COUNT(*) FROM growth_task_completions`);
  return { rows: res.rows, total: parseInt(countRes.rows[0].count, 10) };
}
