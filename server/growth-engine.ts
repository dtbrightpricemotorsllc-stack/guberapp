/**
 * GUBER Growth Engine — ZIP-based fallback tasks, credits/score, anti-abuse.
 *
 * Growth tasks are NOT marketplace jobs. They live in their own tables and
 * NEVER appear in real job counts, paid-work flows, or dashboard job stats.
 * Admin controls every tunable value via growth_reward_config; nothing is
 * hardcoded in this module.
 *
 * Credit math: 1000 growthCredits = $1. Min cashout = 25,000 credits ($25).
 * Day-1 OG members receive a per-template ogBonusPct bonus (default +25%).
 *
 * Referral pending flow:
 *   referral_creates_account  → status='pending', increments pending_credits
 *   referral_verifies_id      → approves pending signup credits; adds verified credits
 *   All other milestones       → direct approved credit grant + lifetime_credits_earned
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

  // 6. Record + award atomically (also writes credit_ledger)
  const creditsPerDollar = await getRewardConfigValue("credits_per_dollar", 1000);
  const dollarEq = (credits / creditsPerDollar).toFixed(4);

  await pool.query("BEGIN");
  try {
    const completionRes = await pool.query(
      `INSERT INTO growth_task_completions
         (user_id, template_id, zip, credits_awarded, score_awarded, submission_data,
          device_fingerprint, ip_address, lat, lng, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved')
       RETURNING id`,
      [userId, templateId, zip, credits, score,
       JSON.stringify(submissionData ?? {}),
       deviceFingerprint ?? null, ipAddress ?? null, lat ?? null, lng ?? null]
    );
    const completionId: number = completionRes.rows[0].id;
    await pool.query(
      `UPDATE users
       SET growth_credits          = COALESCE(growth_credits, 0)          + $1,
           guber_score             = COALESCE(guber_score, 0)             + $2,
           lifetime_credits_earned = COALESCE(lifetime_credits_earned, 0) + $1
       WHERE id = $3`,
      [credits, score, userId]
    );
    await pool.query(
      `INSERT INTO credit_ledger
         (user_id, amount, dollar_equivalent, source_type, task_completion_id, status, approved_at)
       VALUES ($1, $2, $3, 'map_mission', $4, 'approved', NOW())`,
      [userId, credits, dollarEq, completionId]
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
  const [rCr, rSc, creditsPerDollar] = await Promise.all([
    getRewardConfigValue(cfg.referrerCr, 0),
    getRewardConfigValue(cfg.referrerSc, 0),
    getRewardConfigValue("credits_per_dollar", 1000),
  ]);

  // referral_creates_account → credits go PENDING (wait for ID verify before approving)
  const isPending = event === "referral_creates_account";
  const sourceType = event.replace(/^referral_/, "referral_");

  if (rCr > 0) {
    const dollarEq = (rCr / creditsPerDollar).toFixed(4);
    if (isPending) {
      await pool.query(
        `UPDATE users SET pending_credits = COALESCE(pending_credits,0)+$1, guber_score = COALESCE(guber_score,0)+$2 WHERE id = $3`,
        [rCr, rSc, referrerId]
      );
      await pool.query(
        `INSERT INTO credit_ledger (user_id, amount, dollar_equivalent, source_type, status, reason)
         VALUES ($1, $2, $3, $4, 'pending', $5)`,
        [referrerId, rCr, dollarEq, sourceType, `Referred user #${referredId ?? "?"} — pending ID verify`]
      );
    } else {
      await pool.query(
        `UPDATE users
         SET growth_credits          = COALESCE(growth_credits,0)          + $1,
             guber_score             = COALESCE(guber_score,0)             + $2,
             lifetime_credits_earned = COALESCE(lifetime_credits_earned,0) + $1
         WHERE id = $3`,
        [rCr, rSc, referrerId]
      );
      await pool.query(
        `INSERT INTO credit_ledger (user_id, amount, dollar_equivalent, source_type, status, approved_at, reason)
         VALUES ($1, $2, $3, $4, 'approved', NOW(), $5)`,
        [referrerId, rCr, dollarEq, sourceType, `Referred user #${referredId ?? "?"} milestone: ${event}`]
      );
    }
  } else if (rSc > 0) {
    // score only, no credit
    await pool.query(
      `UPDATE users SET guber_score = COALESCE(guber_score,0)+$1 WHERE id = $2`,
      [rSc, referrerId]
    );
  }

  if ((event === "referral_og_purchase_referred") && referredId && cfg.referredCr && cfg.referredSc) {
    const [refCr, refSc] = await Promise.all([
      getRewardConfigValue(cfg.referredCr, 0),
      getRewardConfigValue(cfg.referredSc, 0),
    ]);
    if (refCr > 0 || refSc > 0) {
      const dollarEqRef = (refCr / creditsPerDollar).toFixed(4);
      await pool.query(
        `UPDATE users
         SET growth_credits          = COALESCE(growth_credits,0)          + $1,
             guber_score             = COALESCE(guber_score,0)             + $2,
             lifetime_credits_earned = COALESCE(lifetime_credits_earned,0) + $1
         WHERE id = $3`,
        [refCr, refSc, referredId]
      );
      await pool.query(
        `INSERT INTO credit_ledger (user_id, amount, dollar_equivalent, source_type, status, approved_at, reason)
         VALUES ($1, $2, $3, 'referral_og_purchase_referred', 'approved', NOW(), 'Purchased Day-1 OG via referral link')`,
        [referredId, refCr, dollarEqRef]
      );
    }
  }
}

/**
 * Called when a referred user verifies their ID.
 * Moves all 'pending' referral_creates_account ledger rows for their referrer to 'approved',
 * shifts pending_credits → growth_credits + lifetime_credits_earned.
 */
export async function approveReferralPendingCredits(referredUserId: number): Promise<void> {
  // Find who referred this user
  const refRow = await pool.query(
    `SELECT referred_by FROM users WHERE id = $1`,
    [referredUserId]
  );
  const referrerId: number | null = refRow.rows[0]?.referred_by ?? null;
  if (!referrerId) return;

  // Find pending ledger rows for this referrer from a referral_creates_account source
  // that haven't been approved yet and are tied to the referred user
  const pendingRows = await pool.query(
    `SELECT id, amount FROM credit_ledger
     WHERE user_id = $1
       AND source_type = 'referral_creates_account'
       AND status = 'pending'
       AND reason LIKE $2`,
    [referrerId, `Referred user #${referredUserId}%`]
  );
  if (pendingRows.rows.length === 0) return;

  const totalToApprove: number = pendingRows.rows.reduce((sum: number, r: any) => sum + r.amount, 0);
  const ids: number[] = pendingRows.rows.map((r: any) => r.id);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE credit_ledger
       SET status = 'approved', approved_at = NOW()
       WHERE id = ANY($1::int[])`,
      [ids]
    );
    await pool.query(
      `UPDATE users
       SET pending_credits         = GREATEST(0, COALESCE(pending_credits,0)         - $1),
           growth_credits          = COALESCE(growth_credits,0)                       + $1,
           lifetime_credits_earned = COALESCE(lifetime_credits_earned,0)              + $1
       WHERE id = $2`,
      [totalToApprove, referrerId]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
}

// ── Credit wallet balance ─────────────────────────────────────────────────────

export async function getCreditBalance(userId: number) {
  const [userRow, configRows] = await Promise.all([
    pool.query(
      `SELECT growth_credits, pending_credits, lifetime_credits_earned, lifetime_credits_redeemed,
              stripe_account_id, stripe_account_status, id_verified
       FROM users WHERE id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT key, value_int FROM growth_reward_config
       WHERE key IN ('credits_per_dollar','cashout_minimum_credits','cashout_enabled')`
    ),
  ]);
  const u = userRow.rows[0];
  if (!u) return null;
  const cfg: Record<string, number> = {};
  for (const r of configRows.rows) cfg[r.key] = r.value_int;

  const creditsPerDollar = cfg["credits_per_dollar"] ?? 1000;
  const minCashout       = cfg["cashout_minimum_credits"] ?? 25000;
  const cashoutEnabled   = (cfg["cashout_enabled"] ?? 0) === 1;

  const available  = u.growth_credits ?? 0;
  const pending    = u.pending_credits ?? 0;
  const earned     = u.lifetime_credits_earned ?? 0;
  const redeemed   = u.lifetime_credits_redeemed ?? 0;
  const dollarValue = (available / creditsPerDollar).toFixed(2);

  const stripeReady = u.stripe_account_status === "active" || u.stripe_account_status === "verified";
  const idVerified  = !!u.id_verified;
  const eligible    = cashoutEnabled && idVerified && stripeReady && available >= minCashout;

  const profileMissionRow = await pool.query(
    `SELECT id FROM credit_ledger WHERE user_id = $1 AND source_type = 'profile_availability' AND status = 'approved' LIMIT 1`,
    [userId]
  );

  return {
    available, pending, earned, redeemed,
    dollarValue,
    creditsPerDollar, minCashout, cashoutEnabled,
    stripeReady, idVerified,
    eligibleForCashout: eligible,
    stripeAccountStatus: u.stripe_account_status ?? null,
    profileMissionEarned: profileMissionRow.rows.length > 0,
  };
}

// ── Cashout request ───────────────────────────────────────────────────────────

export async function submitCashoutRequest(userId: number, credits: number, payoutMethod: string, payoutDetails?: string) {
  const balance = await getCreditBalance(userId);
  if (!balance) throw new Error("User not found");
  if (!balance.cashoutEnabled) throw new Error("Cashout is currently disabled");
  if (!balance.idVerified) throw new Error("ID verification required");
  if (!balance.stripeReady) throw new Error("Stripe Connect payout account required");
  if (credits < balance.minCashout) throw new Error(`Minimum cashout is ${balance.minCashout.toLocaleString()} credits`);
  if (credits > balance.available) throw new Error("Insufficient credits");

  // Check no open cashout request already pending
  const existing = await pool.query(
    `SELECT id FROM cashout_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
    [userId]
  );
  if (existing.rows.length > 0) throw new Error("You already have a pending cashout request");

  const dollarAmount = (credits / balance.creditsPerDollar).toFixed(2);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO cashout_requests (user_id, credits_requested, dollar_amount, status, payout_method, payout_details)
       VALUES ($1, $2, $3, 'pending', $4, $5)`,
      [userId, credits, dollarAmount, payoutMethod, payoutDetails ?? null]
    );
    // Reserve credits immediately — deduct from available, not lifetime
    await pool.query(
      `UPDATE users
       SET growth_credits = COALESCE(growth_credits,0) - $1
       WHERE id = $2`,
      [credits, userId]
    );
    await pool.query(
      `INSERT INTO credit_ledger (user_id, amount, dollar_equivalent, source_type, status, reason)
       VALUES ($1, $2, $3, 'cashout', 'pending', 'Cashout request submitted — awaiting admin approval')`,
      [userId, -credits, `-${(credits / balance.creditsPerDollar).toFixed(4)}`]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
  return { dollarAmount };
}

// ── Admin: cashout queue ──────────────────────────────────────────────────────

export async function listCashoutRequests(status?: string) {
  const where = status ? `WHERE cr.status = $1` : `WHERE cr.status = 'pending'`;
  const params = status ? [status] : [];
  const res = await pool.query(
    `SELECT cr.*, u.username, u.email, u.stripe_account_id, u.stripe_account_status
     FROM cashout_requests cr
     JOIN users u ON u.id = cr.user_id
     ${where}
     ORDER BY cr.created_at ASC`,
    params
  );
  return res.rows;
}

export async function reviewCashoutRequest(
  requestId: number,
  adminId: number,
  decision: "approved" | "denied",
  adminNote?: string
) {
  const reqRow = await pool.query(
    `SELECT * FROM cashout_requests WHERE id = $1`,
    [requestId]
  );
  const req = reqRow.rows[0];
  if (!req) throw new Error("Request not found");
  if (req.status !== "pending") throw new Error("Request already reviewed");

  const creditsPerDollar = await getRewardConfigValue("credits_per_dollar", 1000);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `UPDATE cashout_requests
       SET status = $1, admin_note = $2, reviewed_at = NOW(), reviewed_by = $3
       WHERE id = $4`,
      [decision, adminNote ?? null, adminId, requestId]
    );

    if (decision === "denied") {
      // Refund credits back to user
      await pool.query(
        `UPDATE users
         SET growth_credits = COALESCE(growth_credits,0) + $1
         WHERE id = $2`,
        [req.credits_requested, req.user_id]
      );
      await pool.query(
        `INSERT INTO credit_ledger (user_id, amount, dollar_equivalent, source_type, status, approved_at, reason)
         VALUES ($1, $2, $3, 'cashout', 'denied', NOW(), $4)`,
        [req.user_id, req.credits_requested, (req.credits_requested / creditsPerDollar).toFixed(4),
         `Cashout denied by admin: ${adminNote ?? "no reason"}`]
      );
    } else {
      // approved — admin will pay out manually; mark ledger redeemed
      await pool.query(
        `UPDATE users
         SET lifetime_credits_redeemed = COALESCE(lifetime_credits_redeemed,0) + $1
         WHERE id = $2`,
        [req.credits_requested, req.user_id]
      );
      await pool.query(
        `UPDATE credit_ledger
         SET status = 'redeemed', redeemed_at = NOW()
         WHERE user_id = $1 AND source_type = 'cashout' AND status = 'pending'
           AND amount = -$2`,
        [req.user_id, req.credits_requested]
      );
    }
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }
}

export async function getCreditAdminStats() {
  const res = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'approved' AND amount > 0 THEN amount ELSE 0 END), 0) AS total_credits_approved,
      COALESCE(SUM(CASE WHEN status = 'redeemed' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_credits_redeemed,
      COALESCE(SUM(CASE WHEN status = 'pending' AND amount > 0 THEN amount ELSE 0 END), 0) AS total_credits_pending,
      COUNT(CASE WHEN status = 'pending' AND amount > 0 THEN 1 END) AS pending_ledger_count
    FROM credit_ledger
  `);
  const cashouts = await pool.query(`
    SELECT
      COUNT(CASE WHEN status = 'pending'  THEN 1 END) AS pending_cashouts,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_cashouts,
      COUNT(CASE WHEN status = 'denied'   THEN 1 END) AS denied_cashouts,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN dollar_amount ELSE 0 END), 0) AS total_paid_out_usd
    FROM cashout_requests
  `);
  const cfgRow = await pool.query(
    `SELECT value_int FROM growth_reward_config WHERE key = 'credits_per_dollar'`
  );
  const creditsPerDollar = cfgRow.rows[0]?.value_int ?? 1000;
  const s = res.rows[0];
  const c = cashouts.rows[0];
  const liability = (parseInt(s.total_credits_approved) - parseInt(s.total_credits_redeemed));
  return {
    totalCreditsApproved:  parseInt(s.total_credits_approved),
    totalCreditsRedeemed:  parseInt(s.total_credits_redeemed),
    totalCreditsPending:   parseInt(s.total_credits_pending),
    outstandingLiability:  liability,
    estimatedLiabilityUsd: (liability / creditsPerDollar).toFixed(2),
    pendingCashouts:       parseInt(c.pending_cashouts),
    approvedCashouts:      parseInt(c.approved_cashouts),
    deniedCashouts:        parseInt(c.denied_cashouts),
    totalPaidOutUsd:       parseFloat(c.total_paid_out_usd).toFixed(2),
    creditsPerDollar,
  };
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

// ── Score Ranks ───────────────────────────────────────────────────────────────

export interface ScoreRank {
  id: number;
  title: string;
  emoji: string;
  minScore: number;
  maxScore: number | null;
  sortOrder: number;
}

export async function getScoreRanks(): Promise<ScoreRank[]> {
  const res = await pool.query(
    `SELECT id, title, emoji, min_score, max_score, sort_order
     FROM growth_score_ranks ORDER BY sort_order ASC`
  );
  return res.rows.map((r: any) => ({
    id: r.id, title: r.title, emoji: r.emoji,
    minScore: r.min_score, maxScore: r.max_score, sortOrder: r.sort_order,
  }));
}

export async function updateScoreRank(id: number, data: Partial<{
  title: string; emoji: string; minScore: number; maxScore: number | null; sortOrder: number;
}>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.title     !== undefined) { sets.push(`title = $${i++}`);      vals.push(data.title); }
  if (data.emoji     !== undefined) { sets.push(`emoji = $${i++}`);      vals.push(data.emoji); }
  if (data.minScore  !== undefined) { sets.push(`min_score = $${i++}`);  vals.push(data.minScore); }
  if (data.maxScore  !== undefined) { sets.push(`max_score = $${i++}`);  vals.push(data.maxScore); }
  if (data.sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(data.sortOrder); }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE growth_score_ranks SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export function computeRankTitle(score: number, ranks: ScoreRank[]): ScoreRank | null {
  const sorted = [...ranks].sort((a, b) => b.minScore - a.minScore);
  return sorted.find(r => score >= r.minScore) ?? null;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  userId: number;
  username: string;
  guberScore: number;
  growthCredits: number;
  referralCount: number;
  completionCount: number;
  zip: string | null;
}

export async function getLeaderboard(
  type: "global" | "state" | "city",
  value?: string,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const fetchLimit = type === "global" ? limit : 500;
  const res = await pool.query(
    `SELECT u.id AS user_id, u.username, u.guber_score, u.growth_credits,
            COALESCE(u.referral_count, 0) AS referral_count, u.zip,
            COUNT(c.id) AS completion_count
     FROM users u
     LEFT JOIN growth_task_completions c ON c.user_id = u.id AND c.status = 'approved'
     WHERE u.guber_score > 0
     GROUP BY u.id
     ORDER BY u.guber_score DESC
     LIMIT $1`,
    [fetchLimit]
  );
  let rows: LeaderboardEntry[] = res.rows.map((r: any) => ({
    userId: r.user_id,
    username: r.username,
    guberScore: r.guber_score,
    growthCredits: r.growth_credits,
    referralCount: r.referral_count,
    completionCount: parseInt(r.completion_count, 10),
    zip: r.zip,
  }));
  if ((type === "state" || type === "city") && value) {
    rows = rows.filter(r => {
      if (!r.zip) return false;
      const info = lookupZipCity(r.zip);
      if (!info) return false;
      return type === "state" ? info.state === value : info.city === value;
    }).slice(0, limit);
  }
  return rows;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface GrowthAnalytics {
  totalCreditsIssued: number;
  totalCreditsRedeemed: number;
  outstandingCreditLiability: number;
  estimatedUsdLiability: number;
  totalCompletions: number;
  approvedCompletions: number;
  suspiciousCompletions: number;
  totalReferrals: number;
  verifiedReferrals: number;
  stripeConnectedReferrals: number;
  day1OgSales: number;
  topCities: Array<{ city: string; state: string; count: number }>;
  topContributors: Array<{ username: string; guberScore: number; completions: number }>;
  completionsByTask: Array<{ title: string; emoji: string; count: number; totalCredits: number }>;
}

export async function getGrowthAnalytics(): Promise<GrowthAnalytics> {
  const [
    creditsRes, liabilityRes, completionsRes,
    referralsRes, ogRes, taskBreakdownRes, topUsersRes, zipBreakdownRes,
  ] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(credits_awarded),0) AS total FROM growth_task_completions WHERE status='approved'`),
    pool.query(`SELECT COALESCE(SUM(growth_credits),0) AS total FROM users`),
    pool.query(`SELECT
      COUNT(*) FILTER(WHERE status='approved')   AS approved,
      COUNT(*) FILTER(WHERE status='suspicious') AS suspicious,
      COUNT(*) AS total
      FROM growth_task_completions`),
    pool.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER(WHERE u.id_verified=true) AS verified,
             COUNT(*) FILTER(WHERE u.stripe_account_id IS NOT NULL) AS stripe_connected
      FROM referrals r
      JOIN users u ON u.id = r.referred_id`),
    pool.query(`SELECT COUNT(*) AS total FROM users WHERE day1_og=true`),
    pool.query(`
      SELECT t.title, t.emoji,
             COUNT(c.id) AS count,
             COALESCE(SUM(c.credits_awarded),0) AS total_credits
      FROM growth_task_completions c
      JOIN growth_task_templates t ON t.id = c.template_id
      WHERE c.status='approved'
      GROUP BY t.id, t.title, t.emoji
      ORDER BY count DESC`),
    pool.query(`
      SELECT u.username, u.guber_score, COUNT(c.id) AS completions
      FROM users u
      LEFT JOIN growth_task_completions c ON c.user_id=u.id AND c.status='approved'
      WHERE u.guber_score > 0
      GROUP BY u.id
      ORDER BY u.guber_score DESC
      LIMIT 10`),
    pool.query(`
      SELECT zip, COUNT(*) AS count
      FROM growth_task_completions
      WHERE status='approved' AND zip IS NOT NULL
      GROUP BY zip
      ORDER BY count DESC
      LIMIT 100`),
  ]);

  const creditsPerDollar = await getRewardConfigValue("credits_per_dollar", 100);
  const totalCreditsIssued = Number(creditsRes.rows[0]?.total ?? 0);
  const liability = Number(liabilityRes.rows[0]?.total ?? 0);

  const cityMap = new Map<string, number>();
  for (const row of zipBreakdownRes.rows) {
    const info = lookupZipCity(row.zip);
    if (info) {
      const key = `${info.city}||${info.state}`;
      cityMap.set(key, (cityMap.get(key) ?? 0) + parseInt(row.count, 10));
    }
  }
  const topCities = [...cityMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([key, count]) => { const [city, state] = key.split("||"); return { city, state, count }; });

  const refs = referralsRes.rows[0];
  return {
    totalCreditsIssued,
    totalCreditsRedeemed: 0,
    outstandingCreditLiability: liability,
    estimatedUsdLiability: +(liability / creditsPerDollar).toFixed(2),
    totalCompletions: parseInt(completionsRes.rows[0]?.total ?? "0", 10),
    approvedCompletions: parseInt(completionsRes.rows[0]?.approved ?? "0", 10),
    suspiciousCompletions: parseInt(completionsRes.rows[0]?.suspicious ?? "0", 10),
    totalReferrals: parseInt(refs?.total ?? "0", 10),
    verifiedReferrals: parseInt(refs?.verified ?? "0", 10),
    stripeConnectedReferrals: parseInt(refs?.stripe_connected ?? "0", 10),
    day1OgSales: parseInt(ogRes.rows[0]?.total ?? "0", 10),
    topCities,
    topContributors: topUsersRes.rows.map((r: any) => ({
      username: r.username, guberScore: r.guber_score, completions: parseInt(r.completions, 10),
    })),
    completionsByTask: taskBreakdownRes.rows.map((r: any) => ({
      title: r.title, emoji: r.emoji,
      count: parseInt(r.count, 10), totalCredits: parseInt(r.total_credits, 10),
    })),
  };
}

// ── Availability + Skills Mission ─────────────────────────────────────────────
// Skilled-labor keywords (matches Skilled Labor service types in routes.ts).
const SKILLED_KEYWORDS = [
  "plumb", "electric", "hvac", "carpent", "drywall", "weld",
  "auto repair", "roof", "marine", "boat repair", "towing", "haul",
  "electrician", "plumber", "carpenter", "welder", "roofer",
];

export async function maybeAwardAvailabilitySkillsMission(
  userId: number
): Promise<{ awarded: boolean; reason: string }> {
  // Idempotency — already credited?
  const existing = await pool.query(
    `SELECT id FROM credit_ledger WHERE user_id = $1 AND source_type = 'profile_availability' AND status = 'approved' LIMIT 1`,
    [userId]
  );
  if (existing.rows.length > 0) return { awarded: false, reason: "already_earned" };

  // Load user fields needed for eligibility
  const userRes = await pool.query(
    `SELECT is_available, skills, id_verified, credential_verified FROM users WHERE id = $1`,
    [userId]
  );
  const u = userRes.rows[0];
  if (!u) return { awarded: false, reason: "user_not_found" };
  if (!u.id_verified)  return { awarded: false, reason: "id_not_verified" };
  if (!u.is_available) return { awarded: false, reason: "not_available" };

  const skillsText = (u.skills || "").trim().toLowerCase();
  if (skillsText.length < 10) return { awarded: false, reason: "skills_too_short" };

  // Skilled-trade gate: if any skilled keyword is mentioned, credentials are required
  const mentionsSkilled = SKILLED_KEYWORDS.some(kw => skillsText.includes(kw));
  if (mentionsSkilled && !u.credential_verified) {
    return { awarded: false, reason: "skilled_needs_credential" };
  }

  const AWARD = 200;
  const creditsPerDollar = await getRewardConfigValue("credits_per_dollar", 1000);

  await pool.query("BEGIN");
  try {
    await pool.query(
      `INSERT INTO credit_ledger (user_id, amount, dollar_equivalent, source_type, status, reason)
       VALUES ($1, $2, $3, 'profile_availability', 'approved', 'Set availability + skills standby')`,
      [userId, AWARD, +(AWARD / creditsPerDollar).toFixed(4)]
    );
    await pool.query(
      `UPDATE users SET growth_credits = growth_credits + $1,
                        lifetime_credits_earned = lifetime_credits_earned + $1
       WHERE id = $2`,
      [AWARD, userId]
    );
    await pool.query("COMMIT");
  } catch (e) {
    await pool.query("ROLLBACK");
    throw e;
  }

  return { awarded: true, reason: "awarded" };
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
