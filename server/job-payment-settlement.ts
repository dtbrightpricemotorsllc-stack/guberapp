import type Stripe from "stripe";
import { pool } from "./db";

export type StandardJobSettlementResult =
  | { status: "captured"; grossCharge: number; workerShare: number }
  | { status: "already_captured"; grossCharge: number; workerShare: number }
  | { status: "capture_failed"; retryAt: Date; message: string }
  | { status: "capture_expired"; message: string }
  | { status: "capture_in_progress" }
  | { status: "not_standard_destination_charge" }
  | { status: "not_found" };

type SettlementRow = {
  id: number;
  posted_by_id: number;
  assigned_helper_id: number | null;
  title: string;
  status: string;
  stripe_payment_intent_id: string | null;
  payment_rail: string | null;
  payment_gross_cents: number | null;
  worker_payout_cents: number | null;
  worker_gross_share: number | null;
  capture_status: string;
  capture_attempts: number;
  last_attempt_at: Date | null;
};

const CAPTURE_RETRY_MS = 15 * 60 * 1000;

/**
 * Standard public jobs use Stripe destination charges. Stripe moves the worker
 * share as part of capture, so this routine must be the only release path and
 * must never create a second standalone Connect transfer.
 */
export async function settleStandardDestinationCharge(
  jobId: number,
  stripe: Pick<Stripe, "paymentIntents">,
): Promise<StandardJobSettlementResult> {
  const client = await pool.connect();
  let row: SettlementRow | undefined;
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO job_payment_settlements (job_id, capture_status)
      VALUES ($1, 'pending')
      ON CONFLICT (job_id) DO NOTHING
    `, [jobId]);
    const selected = await client.query<SettlementRow>(`
      SELECT j.id, j.posted_by_id, j.assigned_helper_id, j.title, j.status,
             j.stripe_payment_intent_id, j.payment_rail, j.payment_gross_cents,
             j.worker_payout_cents, j.worker_gross_share, s.capture_status, s.capture_attempts,
             s.last_attempt_at
      FROM jobs j
      JOIN job_payment_settlements s ON s.job_id = j.id
      WHERE j.id = $1
      FOR UPDATE OF j, s
    `, [jobId]);
    row = selected.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { status: "not_found" };
    }
    // Pre-migration public jobs do not have a payment_rail snapshot, but their
    // lock flow already created destination charges. Treat only an explicitly
    // different rail as legacy so those held authorizations can still settle.
    if ((row.payment_rail && row.payment_rail !== "destination_charge") || !row.stripe_payment_intent_id) {
      await client.query("ROLLBACK");
      return { status: "not_standard_destination_charge" };
    }
    const grossCharge = (row.payment_gross_cents || 0) / 100;
    const workerShare = (row.worker_payout_cents ?? Math.round((row.worker_gross_share || 0) * 100)) / 100;
    if (row.capture_status === "captured") {
      await client.query("COMMIT");
      return { status: "already_captured", grossCharge, workerShare };
    }
    if (row.capture_status === "expired") {
      await client.query("COMMIT");
      return { status: "capture_expired", message: "The payment authorization has expired." };
    }
    if (
      row.capture_status === "capturing" &&
      row.last_attempt_at &&
      row.last_attempt_at.getTime() > Date.now() - CAPTURE_RETRY_MS
    ) {
      await client.query("COMMIT");
      return { status: "capture_in_progress" };
    }

    await client.query(`
      UPDATE job_payment_settlements
      SET capture_status = 'capturing', capture_attempts = capture_attempts + 1,
          last_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
      WHERE job_id = $1
    `, [jobId]);
    await client.query(`
      UPDATE jobs
      SET status = CASE WHEN status = 'disputed' THEN status ELSE 'completion_submitted' END,
          payout_status = 'capture_pending',
          internal_payout_status = 'approved'
      WHERE id = $1
    `, [jobId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Stable key makes a retry after a process crash return Stripe's first
  // capture instead of charging the authorization twice.
  try {
    const captured = await stripe.paymentIntents.capture(
      row!.stripe_payment_intent_id!,
      {},
      { idempotencyKey: `guber-standard-job-${jobId}-capture-v1` },
    );
    const capturedCents = captured.amount_received || captured.amount || row!.payment_gross_cents || 0;
    const workerPayoutCents = row!.worker_payout_cents ?? Math.round((row!.worker_gross_share || 0) * 100);
    const platformFeeCents = capturedCents - workerPayoutCents;
    const finalize = await pool.connect();
    try {
      await finalize.query("BEGIN");
      const locked = await finalize.query<Pick<SettlementRow, "capture_status">>(
        "SELECT capture_status FROM job_payment_settlements WHERE job_id = $1 FOR UPDATE",
        [jobId],
      );
      if (locked.rows[0]?.capture_status === "captured") {
        await finalize.query("COMMIT");
        return {
          status: "already_captured",
          grossCharge: capturedCents / 100,
          workerShare: workerPayoutCents / 100,
        };
      }

      await finalize.query(`
        UPDATE jobs
        SET status = 'completed_paid', payout_status = 'paid_out',
            internal_payout_status = 'released', payout_amount = $2,
            charged_at = NOW(), paid_out_at = NOW(), auto_confirm_at = NULL,
            payment_rail = 'destination_charge',
            payment_gross_cents = $3, worker_payout_cents = $4
        WHERE id = $1
      `, [jobId, workerPayoutCents / 100, capturedCents, workerPayoutCents]);
      await finalize.query(`
        INSERT INTO money_ledger
          (job_id, user_id_owner, user_id_counterparty, ledger_type, amount, currency,
           source_system, source_reference_id, stripe_object_type, stripe_object_id,
           description, metadata_json, event_time)
        VALUES
          ($1, $2, $3, 'job_payment_captured', $4, 'usd', 'stripe', $5, 'payment_intent', $5,
           $6, $7::json, NOW()),
          ($1, $3, $2, 'job_earning', $8, 'usd', 'stripe', $5, 'payment_intent', $5,
           $9, $10::json, NOW()),
          ($1, NULL, NULL, 'platform_fee', $11, 'usd', 'stripe', $5, 'payment_intent', $5,
           $12, $13::json, NOW())
        `, [
        jobId, row!.posted_by_id, row!.assigned_helper_id, -(capturedCents / 100),
        row!.stripe_payment_intent_id, `Payment captured for job #${jobId}: ${row!.title}`,
        JSON.stringify({ settlementRail: "destination_charge", grossChargeCents: capturedCents }),
        workerPayoutCents / 100, `Earning released for job #${jobId}: ${row!.title}`,
        JSON.stringify({ settlementRail: "destination_charge", workerPayoutCents }),
        platformFeeCents / 100, `Platform fee for job #${jobId}: ${row!.title}`,
        JSON.stringify({ settlementRail: "destination_charge", platformFeeCents }),
      ]);
      const wallet = await finalize.query(`
        UPDATE wallet_transactions
        SET amount = $3, status = 'completed',
            description = $4
        WHERE job_id = $1 AND user_id = $2 AND type = 'earning'
        RETURNING id
      `, [jobId, row!.assigned_helper_id, workerPayoutCents / 100, `Payment released through Stripe for "${row!.title}"`]);
      if (wallet.rowCount === 0 && row!.assigned_helper_id) {
        await finalize.query(`
          INSERT INTO wallet_transactions (user_id, job_id, type, amount, status, description)
          VALUES ($1, $2, 'earning', $3, 'completed', $4)
        `, [row!.assigned_helper_id, jobId, workerPayoutCents / 100, `Payment released through Stripe for "${row!.title}"`]);
      }
      await finalize.query(`
        UPDATE job_payment_settlements
        SET capture_status = 'captured', captured_amount_cents = $2,
            captured_at = NOW(), last_error = NULL, updated_at = NOW()
        WHERE job_id = $1
      `, [jobId, capturedCents]);
      await finalize.query("COMMIT");
      return { status: "captured", grossCharge: capturedCents / 100, workerShare: workerPayoutCents / 100 };
    } catch (error) {
      await finalize.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      finalize.release();
    }
  } catch (error: any) {
    const expired = error?.code === "charge_expired_for_capture";
    const retryAt = new Date(Date.now() + CAPTURE_RETRY_MS);
    await pool.query(`
      UPDATE job_payment_settlements
      SET capture_status = $2, last_error = $3, updated_at = NOW()
      WHERE job_id = $1
    `, [jobId, expired ? "expired" : "failed", String(error?.message || "Stripe capture failed").slice(0, 1000)]);
    await pool.query(`
      UPDATE jobs
      SET status = 'completion_submitted',
          payout_status = $2, internal_payout_status = 'on_hold',
          auto_confirm_at = $3
      WHERE id = $1
    `, [jobId, expired ? "capture_expired" : "capture_failed", expired ? null : retryAt]);
    if (expired) return { status: "capture_expired", message: "The payment authorization has expired." };
    return { status: "capture_failed", retryAt, message: "The capture did not complete; it will retry automatically." };
  }
}