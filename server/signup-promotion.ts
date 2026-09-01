import type { PoolClient } from "pg";
import { pool } from "./db";

export const SIGNUP_PROMOTION_BASELINE = 517;
export const SIGNUP_PROMOTION_INTERVAL = 500;
export const SIGNUP_PROMOTION_PRIZE_CENTS = 5000;

export class PromotionWinnerUpdateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PromotionWinnerUpdateError";
    this.statusCode = statusCode;
  }
}

export function validatePromotionWinnerUpdate(
  currentStatus: string,
  nextStatus: string,
  payoutMethod: string | null | undefined,
  payoutHandle: string | null | undefined,
  adminNotes: string | null | undefined,
): void {
  const validTransitions: Record<string, string[]> = {
    pending_claim: ["pending_claim", "claimed", "disqualified"],
    claimed: ["claimed", "paid", "disqualified"],
    paid: ["paid"],
    disqualified: ["disqualified"],
  };
  if (!validTransitions[currentStatus]?.includes(nextStatus)) {
    throw new PromotionWinnerUpdateError(`Cannot change winner from ${currentStatus} to ${nextStatus}`);
  }
  if (nextStatus !== "paid") return;

  if (payoutMethod !== "cash_app" && payoutMethod !== "venmo") {
    throw new PromotionWinnerUpdateError("Payout method is required before marking the prize paid");
  }
  if (!/^[$@]?[A-Za-z0-9._-]{1,50}$/.test(String(payoutHandle ?? "").trim())) {
    throw new PromotionWinnerUpdateError("A valid payout handle is required before marking the prize paid");
  }
  if (String(adminNotes ?? "").trim().length < 5) {
    throw new PromotionWinnerUpdateError("An audit note of at least 5 characters is required before marking the prize paid");
  }
}

type PromotionUser = {
  id: number;
  email?: string | null;
  accountType?: string | null;
  role?: string | null;
  isTestUser?: boolean | null;
  suspended?: boolean | null;
  banned?: boolean | null;
  deletedAt?: Date | string | null;
};

export type PromotionEntry = {
  id: number;
  userId: number;
  eligible: boolean;
  reason: string | null;
  sequenceNumber: number | null;
  globalSignupNumber: number | null;
  createdAt: Date;
  winner: {
    id: number;
    status: string;
    prizeCents: number;
    payoutMethod: string | null;
    payoutHandle: string | null;
    claimedAt: Date | null;
    paidAt: Date | null;
    disqualificationReason: string | null;
    adminNotes: string | null;
  } | null;
};

function normalizedEmail(email: string | null | undefined): string | null {
  const value = typeof email === "string" ? email.trim().toLowerCase() : "";
  return value || null;
}

export function classifyPromotionUser(user: PromotionUser): string | null {
  if (user.accountType === "business" || user.accountType === "pending_business") return "business_account";
  if (user.role === "admin") return "admin_account";
  if (user.isTestUser) return "test_account";
  if (user.suspended) return "suspended_account";
  if (user.banned) return "banned_account";
  if (user.deletedAt) return "deleted_account";
  if (!normalizedEmail(user.email)) return "missing_email";
  return null;
}

export function promotionGlobalSignupNumber(sequenceNumber: number, baseline = SIGNUP_PROMOTION_BASELINE): number {
  return baseline + sequenceNumber;
}

export function isPromotionWinner(sequenceNumber: number): boolean {
  return sequenceNumber > 0 && sequenceNumber % SIGNUP_PROMOTION_INTERVAL === 0;
}

async function ensureConfig(client: PoolClient) {
  await client.query(
    `INSERT INTO signup_promotion_config
       (id, baseline, milestone_interval, prize_cents, enabled, activated_at)
     VALUES (1, $1, $2, $3, true, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [SIGNUP_PROMOTION_BASELINE, SIGNUP_PROMOTION_INTERVAL, SIGNUP_PROMOTION_PRIZE_CENTS],
  );
}

function toEntry(row: any): PromotionEntry {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    eligible: Boolean(row.eligible),
    reason: row.reason ?? null,
    sequenceNumber: row.sequence_number == null ? null : Number(row.sequence_number),
    globalSignupNumber: row.global_signup_number == null ? null : Number(row.global_signup_number),
    createdAt: row.created_at,
    winner: row.winner_id
      ? {
          id: Number(row.winner_id),
          status: row.winner_status,
          prizeCents: Number(row.prize_cents),
          payoutMethod: row.payout_method ?? null,
          payoutHandle: row.payout_handle ?? null,
          claimedAt: row.claimed_at ?? null,
          paidAt: row.paid_at ?? null,
          disqualificationReason: row.disqualification_reason ?? null,
          adminNotes: row.admin_notes ?? null,
        }
      : null,
  };
}

async function getEntryForUser(client: PoolClient, userId: number): Promise<PromotionEntry | null> {
  const result = await client.query(
    `SELECT e.*, w.id AS winner_id, w.status AS winner_status, w.prize_cents,
            w.payout_method, w.payout_handle, w.claimed_at, w.paid_at,
            w.disqualification_reason, w.admin_notes
       FROM signup_promotion_entries e
       LEFT JOIN signup_promotion_winners w ON w.entry_id = e.id
      WHERE e.user_id = $1
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? toEntry(result.rows[0]) : null;
}

/**
 * Allocates at most one promotion entry for a newly-created user.
 *
 * The config row is locked for the full transaction. That makes the
 * post-activation sequence a true serialized ordinal rather than a count
 * that can race under concurrent signups. Eligibility is intentionally
 * snapshotted here and never recomputed.
 */
export async function recordSignupPromotionForNewUser(user: PromotionUser): Promise<PromotionEntry> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureConfig(client);

    const existing = await getEntryForUser(client, user.id);
    if (existing) {
      await client.query("COMMIT");
      return existing;
    }

    const configResult = await client.query(
      `SELECT * FROM signup_promotion_config WHERE id = 1 FOR UPDATE`,
    );
    const config = configResult.rows[0];
    const disabledReason = config.enabled ? null : "promotion_disabled";
    const classificationReason = classifyPromotionUser(user);
    let eligible = !disabledReason && !classificationReason;
    let reason = disabledReason || classificationReason;
    let sequenceNumber: number | null = null;
    let globalSignupNumber: number | null = null;

    // Serialize duplicate detection with the config lock. The users table
    // remains untouched, including its existing case-sensitive email rules.
    if (eligible) {
      const duplicate = await client.query(
        `SELECT id FROM signup_promotion_entries
          WHERE normalized_email = $1
          LIMIT 1`,
        [normalizedEmail(user.email)],
      );
      if (duplicate.rows.length > 0) {
        eligible = false;
        reason = "duplicate_email";
      }
    }

    if (eligible) {
      const next = await client.query(
        `UPDATE signup_promotion_config
            SET eligible_signup_count = eligible_signup_count + 1,
                updated_at = NOW()
          WHERE id = 1
        RETURNING eligible_signup_count, baseline`,
      );
      sequenceNumber = Number(next.rows[0].eligible_signup_count);
      globalSignupNumber = promotionGlobalSignupNumber(sequenceNumber, Number(next.rows[0].baseline));
      reason = null;
    }

    const entryResult = await client.query(
      `INSERT INTO signup_promotion_entries
         (user_id, normalized_email, eligible, reason, sequence_number, global_signup_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        user.id,
        normalizedEmail(user.email),
        eligible,
        reason,
        sequenceNumber,
        globalSignupNumber,
      ],
    );
    const entry = entryResult.rows[0];

    if (eligible && isPromotionWinner(sequenceNumber!)) {
      const winnerResult = await client.query(
        `INSERT INTO signup_promotion_winners
           (entry_id, user_id, global_signup_number, prize_cents)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (entry_id) DO UPDATE SET entry_id = EXCLUDED.entry_id
         RETURNING id`,
        [entry.id, user.id, globalSignupNumber, SIGNUP_PROMOTION_PRIZE_CENTS],
      );
      const winnerId = Number(winnerResult.rows[0].id);

      await client.query(
        `INSERT INTO signup_promotion_alerts (winner_id, details)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (winner_id) DO NOTHING`,
        [
          winnerId,
          JSON.stringify({
            kind: "signup_promotion_winner",
            userId: user.id,
            sequenceNumber,
            globalSignupNumber,
            prizeCents: SIGNUP_PROMOTION_PRIZE_CENTS,
          }),
        ],
      );

      await client.query(
        `INSERT INTO notifications
           (user_id, title, body, type, cta_url, cta_label, display_mode)
         SELECT $1, $2, $3, $4, $5, $6, $7
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications
             WHERE user_id = $1 AND type = 'signup_promotion_winner'
               AND cta_url = '/signup-promotion'
          )`,
        [
          user.id,
          "You won GUBER's signup promotion!",
          `You're eligible for a $50 prize as signup #${globalSignupNumber}. Claim your payout details to get started.`,
          "signup_promotion_winner",
          "/signup-promotion",
          "Claim prize",
          "toast",
        ],
      );
    }

    await client.query("COMMIT");
    const saved = await getEntryForUser(client, user.id);
    return saved || toEntry(entry);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getPromotionForUser(userId: number): Promise<PromotionEntry | null> {
  const client = await pool.connect();
  try {
    return await getEntryForUser(client, userId);
  } finally {
    client.release();
  }
}

export async function recordSignupPromotionSafely(user: PromotionUser): Promise<void> {
  try {
    await recordSignupPromotionForNewUser(user);
  } catch (err: any) {
    await enqueueSignupPromotionRetry(user.id, err?.message || "Promotion allocation failed").catch((queueErr: any) => {
      console.error(`[signup-promotion] could not queue retry for user ${user.id}:`, queueErr?.message || queueErr);
    });
    console.error(`[signup-promotion] allocation deferred for user ${user.id}:`, err?.message || err);
  }
}

export async function enqueueSignupPromotionRetry(userId: number, errorMessage: string): Promise<void> {
  await pool.query(
    `INSERT INTO signup_promotion_retries (user_id, last_error, next_attempt_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET attempts = signup_promotion_retries.attempts + 1,
           last_error = EXCLUDED.last_error,
           next_attempt_at = NOW(),
           updated_at = NOW(),
           resolved_at = NULL`,
    [userId, errorMessage.slice(0, 500)],
  );
}

export async function retrySignupPromotionAllocations(limit = 25): Promise<number> {
  const pending = await pool.query<{ user_id: number }>(
    `SELECT user_id
       FROM signup_promotion_retries
      WHERE resolved_at IS NULL
        AND next_attempt_at <= NOW()
      ORDER BY updated_at ASC
      LIMIT $1`,
    [limit],
  );
  let resolved = 0;
  for (const row of pending.rows) {
    try {
      const userResult = await pool.query(
        `SELECT id, email, account_type AS "accountType", role,
                is_test_user AS "isTestUser", suspended, banned,
                deleted_at AS "deletedAt"
           FROM users WHERE id = $1`,
        [row.user_id],
      );
      const user = userResult.rows[0];
      if (!user) {
        await pool.query(
          `UPDATE signup_promotion_retries SET resolved_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
          [row.user_id],
        );
      } else {
        await recordSignupPromotionForNewUser(user);
        await pool.query(
          `UPDATE signup_promotion_retries SET resolved_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
          [row.user_id],
        );
      }
      resolved++;
    } catch (err: any) {
      await pool.query(
        `UPDATE signup_promotion_retries
            SET attempts = attempts + 1,
                last_error = $2,
                next_attempt_at = NOW() + INTERVAL '5 minutes',
                updated_at = NOW()
          WHERE user_id = $1`,
        [row.user_id, String(err?.message || err).slice(0, 500)],
      ).catch(() => {});
    }
  }
  return resolved;
}

export async function acknowledgePromotionAlert(alertId: number, adminId: number) {
  const result = await pool.query(
    `UPDATE signup_promotion_alerts
        SET status = 'acknowledged',
            acknowledged_at = COALESCE(acknowledged_at, NOW()),
            acknowledged_by = COALESCE(acknowledged_by, $2)
      WHERE id = $1
      RETURNING *`,
    [alertId, adminId],
  );
  return result.rows[0] ?? null;
}

export async function getPromotionStatus() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureConfig(client);
    const configResult = await client.query(
      `SELECT id, baseline, milestone_interval, prize_cents, enabled,
              activated_at, eligible_signup_count, updated_at, updated_by
         FROM signup_promotion_config WHERE id = 1`,
    );
    const winnerCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM signup_promotion_winners`,
    );
    const openAlertCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM signup_promotion_alerts WHERE status = 'open'`,
    );
    await client.query("COMMIT");
    return {
      ...configResult.rows[0],
      winnerCount: Number(winnerCount.rows[0]?.count ?? 0),
      openAlertCount: Number(openAlertCount.rows[0]?.count ?? 0),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listPromotionWinners() {
  const result = await pool.query(
    `SELECT w.*, e.sequence_number, e.normalized_email, e.created_at AS signup_at,
            u.username, u.full_name, u.email,
             a.id AS alert_id, a.status AS alert_status, a.details AS alert_details,
            a.acknowledged_at AS alert_acknowledged_at
       FROM signup_promotion_winners w
       JOIN signup_promotion_entries e ON e.id = w.entry_id
       JOIN users u ON u.id = w.user_id
       LEFT JOIN signup_promotion_alerts a ON a.winner_id = w.id
      ORDER BY w.created_at DESC`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    sequenceNumber: Number(row.sequence_number),
    globalSignupNumber: Number(row.global_signup_number),
    prizeCents: Number(row.prize_cents),
    status: row.status,
    payoutMethod: row.payout_method,
    payoutHandle: row.payout_handle,
    claimedAt: row.claimed_at,
    paidAt: row.paid_at,
    disqualificationReason: row.disqualification_reason,
    adminNotes: row.admin_notes,
    alertStatus: row.alert_status ?? null,
    alertId: row.alert_id == null ? null : Number(row.alert_id),
    alertDetails: row.alert_details ?? null,
    alertAcknowledgedAt: row.alert_acknowledged_at ?? null,
    signupAt: row.signup_at,
    createdAt: row.created_at,
  }));
}

export async function updatePromotionConfig(enabled: boolean, adminId: number) {
  const result = await pool.query(
    `INSERT INTO signup_promotion_config
       (id, baseline, milestone_interval, prize_cents, enabled, activated_at, updated_by)
     VALUES (1, $1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, $5)
     ON CONFLICT (id) DO UPDATE
       SET enabled = EXCLUDED.enabled,
           activated_at = CASE
             WHEN signup_promotion_config.activated_at IS NULL AND EXCLUDED.enabled THEN NOW()
             ELSE signup_promotion_config.activated_at
           END,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by
     RETURNING *`,
    [SIGNUP_PROMOTION_BASELINE, SIGNUP_PROMOTION_INTERVAL, SIGNUP_PROMOTION_PRIZE_CENTS, enabled, adminId],
  );
  return result.rows[0];
}

export async function updatePromotionWinner(
  winnerId: number,
  patch: {
    status?: "pending_claim" | "claimed" | "paid" | "disqualified";
    payoutMethod?: "cash_app" | "venmo" | null;
    payoutHandle?: string | null;
    disqualificationReason?: string | null;
    adminNotes?: string | null;
    paidBy?: number | null;
  },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT * FROM signup_promotion_winners WHERE id = $1 FOR UPDATE`,
      [winnerId],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const row = current.rows[0];
    const nextStatus = patch.status ?? row.status;
    validatePromotionWinnerUpdate(
      row.status,
      nextStatus,
      patch.payoutMethod ?? row.payout_method,
      patch.payoutHandle ?? row.payout_handle,
      patch.adminNotes ?? row.admin_notes,
    );
    const paidNow = nextStatus === "paid" && row.status !== "paid";
    const result = await client.query(
      `UPDATE signup_promotion_winners
          SET status = $2,
              payout_method = COALESCE($3, payout_method),
              payout_handle = COALESCE($4, payout_handle),
              disqualification_reason = CASE WHEN $2 = 'disqualified' THEN COALESCE($5, disqualification_reason) ELSE NULL END,
              admin_notes = COALESCE($6, admin_notes),
              paid_by = CASE WHEN $2 = 'paid' THEN COALESCE($7, paid_by) ELSE paid_by END,
              claimed_at = CASE WHEN $2 = 'claimed' AND claimed_at IS NULL THEN NOW() ELSE claimed_at END,
              paid_at = CASE WHEN $2 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
              updated_at = NOW()
        WHERE id = $1
      RETURNING *`,
      [
        winnerId,
        nextStatus,
        patch.payoutMethod ?? null,
        patch.payoutHandle ?? null,
        patch.disqualificationReason ?? null,
        patch.adminNotes ?? null,
        patch.paidBy ?? null,
      ],
    );

    if (paidNow) {
      await client.query(
        `INSERT INTO notifications (user_id, title, body, type, cta_url, cta_label)
         SELECT user_id, $2, $3, $4, '/signup-promotion', 'View prize'
           FROM signup_promotion_winners
          WHERE id = $1
            AND NOT EXISTS (
              SELECT 1 FROM notifications n
               WHERE n.user_id = signup_promotion_winners.user_id
                 AND n.type = 'signup_promotion_paid'
                 AND n.cta_url = '/signup-promotion'
            )`,
        [
          winnerId,
          "Signup promotion prize paid",
          "An admin marked your $50 signup promotion prize as paid.",
          "signup_promotion_paid",
        ],
      );
    }

    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}