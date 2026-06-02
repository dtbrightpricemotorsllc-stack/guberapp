/**
 * server/os/simulation.ts
 * Simulation seed for CFO / COO agent testing.
 *
 * Seeds realistic "production" data (is_test_user=false, is_test_job=false,
 * is_demo=false) using @guber-sim.local emails so the cleanup is safe and
 * targeted. All records are identifiable by that email domain.
 *
 * POST  /api/os/simulation/seed    — insert data + trigger CFO+COO analysis
 * DELETE /api/os/simulation/cleanup — wipe all sim records
 */

import { pool } from "../db";
import { runCFOAnalysis } from "./cfo-agent";
import { runCOOAnalysis } from "./coo-agent";

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 3600000);
}

// Platform fee is 15 %, worker gets 80 %, Stripe ~5 %
function splitAmount(gross: number) {
  const platformFee = parseFloat((gross * 0.15).toFixed(2));
  const netToWorker = parseFloat((gross * 0.80).toFixed(2));
  return { platformFee, netToWorker };
}

// ── Seed ─────────────────────────────────────────────────────────────────────

export async function seedSimulation(): Promise<Record<string, any>> {
  // ── 1. Hirers ─────────────────────────────────────────────────────────────
  const hirerRes = await pool.query(`
    INSERT INTO users
      (email, password, username, full_name, role, tier, is_test_user,
       id_verified, email_verified, profile_complete, zip, trust_score)
    VALUES
      ('sim-hirer-01@guber-sim.local','$2b$10$placeholder','sim_hirer_01','Jordan Avery',   'buyer','community',false,true, true,true,'27401',72),
      ('sim-hirer-02@guber-sim.local','$2b$10$placeholder','sim_hirer_02','Casey Monroe',   'buyer','community',false,true, true,true,'27406',68),
      ('sim-hirer-03@guber-sim.local','$2b$10$placeholder','sim_hirer_03','Riley Carter',   'buyer','community',false,false,true,true,'27403',55),
      ('sim-hirer-04@guber-sim.local','$2b$10$placeholder','sim_hirer_04','Morgan Wells',   'buyer','community',false,true, true,true,'27410',80),
      ('sim-hirer-05@guber-sim.local','$2b$10$placeholder','sim_hirer_05','Taylor Brooks',  'buyer','community',false,true, true,true,'27260',63),
      ('sim-hirer-06@guber-sim.local','$2b$10$placeholder','sim_hirer_06','Avery Simmons',  'buyer','community',false,false,true,true,'27215',59)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email
  `);
  const hirers = hirerRes.rows;

  // ── 2. Workers ────────────────────────────────────────────────────────────
  const workerRes = await pool.query(`
    INSERT INTO users
      (email, password, username, full_name, role, tier, is_test_user,
       id_verified, email_verified, profile_complete, zip, trust_score,
       stripe_account_id, stripe_account_status, jobs_completed, rating, review_count)
    VALUES
      ('sim-worker-01@guber-sim.local','$2b$10$placeholder','sim_worker_01','Devon Hartley',
       'helper','community',false,true,true,true,'27401',91,
       'acct_sim001','active',14,4.8,11),
      ('sim-worker-02@guber-sim.local','$2b$10$placeholder','sim_worker_02','Peyton Ingram',
       'helper','community',false,true,true,true,'27406',85,
       'acct_sim002','active',8,4.6,7),
      ('sim-worker-03@guber-sim.local','$2b$10$placeholder','sim_worker_03','Quinn Flores',
       'helper','community',false,true,true,true,'27403',78,
       'acct_sim003','active',5,4.4,4),
      ('sim-worker-04@guber-sim.local','$2b$10$placeholder','sim_worker_04','Reese Caldwell',
       'helper','standard',false,true,true,true,'27215',88,
       'acct_sim004','active',20,4.9,18)
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email
  `);
  const workers = workerRes.rows;

  if (hirers.length === 0 || workers.length === 0) {
    // Already seeded — fetch existing IDs
    const hRes = await pool.query(
      `SELECT id, email FROM users WHERE email ILIKE '%@guber-sim.local' AND role='buyer' ORDER BY id`
    );
    const wRes = await pool.query(
      `SELECT id, email FROM users WHERE email ILIKE '%@guber-sim.local' AND role='helper' ORDER BY id`
    );
    hirers.push(...hRes.rows);
    workers.push(...wRes.rows);
  }

  const [h1, h2, h3, h4, h5, h6] = hirers.map((r: any) => r.id);
  const [w1, w2, w3, w4]          = workers.map((r: any) => r.id);

  // Studio subscriptions — 2 paid-tier users
  await pool.query(`
    UPDATE users SET studio_tier = 'standard', studio_subscription_status = 'active'
    WHERE email IN ('sim-worker-04@guber-sim.local', 'sim-hirer-04@guber-sim.local')
  `);

  // ── 3. Jobs ───────────────────────────────────────────────────────────────
  // 12 completed + 1 completed-but-unpaid (triggers CFO alert)
  const jobRows = [
    // [posted_by_id, assigned_helper_id, title, category, final_price, days_completed_ago]
    [h1, w1, 'Help Moving Furniture',              'General Labor',      150.00, 27],
    [h2, w2, 'Lawn Mowing & Edging',               'General Labor',       60.00, 24],
    [h1, w3, 'Vehicle Inspection — Honda Civic',   'Verify & Inspect',    85.00, 21],
    [h3, w1, 'Leaking Kitchen Faucet Repair',      'Skilled Labor',      180.00, 19],
    [h4, w2, 'Dog Walking — 3 Days',               'On-Demand Help',      75.00, 17],
    [h2, w4, 'IKEA Furniture Assembly',            'General Labor',       50.00, 14],
    [h5, w1, 'Apartment Inspection for Sublease',  'Verify & Inspect',   120.00, 11],
    [h3, w3, 'Outlet & Panel Inspection',          'Skilled Labor',      200.00,  9],
    [h6, w2, 'Yard Cleanup & Hauling',             'General Labor',       80.00,  6],
    [h4, w4, 'Grocery & Errand Run',               'On-Demand Help',      35.00,  4],
    [h1, w1, 'Interior Painting — 2 Rooms',        'Skilled Labor',      250.00,  2],
    [h5, w3, 'Deep Clean — 3BR Apartment',         'General Labor',       95.00,  1],
    // 13th job: completed but payment NOT captured → triggers CFO alert
    [h6, w4, 'Window Cleaning & Inspection',       'Verify & Inspect',    90.00,  3],
  ];

  const insertedJobs: Array<{ id: number; finalPrice: number; postedById: number; assignedHelperId: number; isPaid: boolean }> = [];

  for (let i = 0; i < jobRows.length; i++) {
    const [posterId, helperId, title, category, price, daysAgoN] = jobRows[i] as any;
    const isPaid    = i < 12; // last one unpaid
    const completedAt = daysAgo(daysAgoN as number);
    const lockedAt    = new Date(completedAt.getTime() - 3600000 * 2); // locked 2h before completion

    const res = await pool.query(`
      INSERT INTO jobs
        (title, category, budget, final_price, status, visibility,
         posted_by_id, assigned_helper_id, is_test_job, is_demo, is_paid,
         is_published, helper_confirmed, buyer_confirmed,
         locked_at, completed_at,
         pay_type, zip, lat, lng, platform_fee, helper_payout)
      VALUES ($1,$2,$3,$3,'completed','public',
              $4,$5,false,false,$6,
              true,true,true,
              $7,$8,
              'Flat Rate','27401',36.07,-79.79,
              $9,$10)
      RETURNING id
    `, [
      title, category, price,
      posterId, helperId, isPaid,
      lockedAt, completedAt,
      splitAmount(price).platformFee,
      splitAmount(price).netToWorker,
    ]);
    insertedJobs.push({
      id: res.rows[0].id,
      finalPrice: price,
      postedById: posterId,
      assignedHelperId: helperId,
      isPaid,
    });
  }

  // ── 4. Wallet Transactions ────────────────────────────────────────────────
  for (const job of insertedJobs) {
    const completedDaysAgo = jobRows[insertedJobs.indexOf(job)][5] as number;
    const txDate = daysAgo(completedDaysAgo as number);

    if (job.isPaid) {
      // GMV: payment from hirer
      await pool.query(`
        INSERT INTO wallet_transactions (user_id, job_id, type, amount, status, description, created_at)
        VALUES ($1,$2,'job_payment',$3,'completed','Job payment',$4)
      `, [job.postedById, job.id, job.finalPrice, txDate]);

      // Payout to worker
      const payout = splitAmount(job.finalPrice).netToWorker;
      await pool.query(`
        INSERT INTO wallet_transactions (user_id, job_id, type, amount, status, description, created_at)
        VALUES ($1,$2,'payout',$3,'completed','Worker payout',$4)
      `, [job.assignedHelperId, job.id, payout, txDate]);
    }
  }

  // Small refund on job[1] ($45 partial refund — hirer dispute resolved)
  const refundJob = insertedJobs[1];
  await pool.query(`
    INSERT INTO wallet_transactions (user_id, job_id, type, amount, status, description, created_at)
    VALUES ($1,$2,'refund',45,'completed','Partial refund — resolved dispute',$3)
  `, [refundJob.postedById, refundJob.id, daysAgo(20)]);

  // ── 5. Guber Payments (platform-fee records) ──────────────────────────────
  for (const job of insertedJobs.filter(j => j.isPaid)) {
    const { platformFee, netToWorker } = splitAmount(job.finalPrice);
    const completedDaysAgo = jobRows[insertedJobs.indexOf(job)][5] as number;
    const payDate = daysAgo(completedDaysAgo as number);

    await pool.query(`
      INSERT INTO guber_payments
        (job_id, payer_user_id, payee_user_id,
         gross_amount, platform_fee_amount, net_to_worker,
         currency, payment_status, funded_at, released_at)
      VALUES ($1,$2,$3,$4,$5,$6,'usd','captured',$7,$7)
    `, [
      job.id, job.postedById, job.assignedHelperId,
      job.finalPrice, platformFee, netToWorker,
      payDate,
    ]);
  }

  // ── 6. Open Dispute ───────────────────────────────────────────────────────
  // Filed by hirer h3 against worker w1 for job[3] — opened 8 days ago, unresolved
  const disputeJob = insertedJobs[3];
  await pool.query(`
    INSERT INTO guber_disputes
      (job_id, opened_by_user_id, against_user_id, filed_by_role,
       reason_code, description, status, opened_at)
    VALUES ($1,$2,$3,'buyer',
            'work_not_completed',
            'Faucet still leaks after repair. Worker unresponsive.',
            'open', $4)
  `, [disputeJob.id, h3, w1, daysAgo(8)]);

  // ── 7. Studio Generation Log ──────────────────────────────────────────────
  const studioEntries = [
    [w4, 'wan_motion_5s',          30, daysAgo(5)],
    [w4, 'wan_motion_5s',          30, daysAgo(4)],
    [w4, 'kling_motion_control',   80, daysAgo(3)],
    [h4, 'minimax_music',           5, daysAgo(6)],
    [h4, 'minimax_music',           5, daysAgo(5)],
    [h4, 'wan_motion_10s',         60, daysAgo(2)],
    [w4, 'wan_motion_5s',          30, daysAgo(1)],
  ];
  for (const [userId, toolKey, credits, createdAt] of studioEntries) {
    await pool.query(`
      INSERT INTO studio_generation_log
        (user_id, tool_key, credits_cost, created_at)
      VALUES ($1,$2,$3,$4)
    `, [userId, toolKey, credits, createdAt]);
  }

  // ── 8. Stuck job (COO: helper_confirmed > 48h, not completed) ─────────────
  await pool.query(`
    INSERT INTO jobs
      (title, category, budget, status, visibility,
       posted_by_id, assigned_helper_id, is_test_job, is_demo, is_paid,
       is_published, helper_confirmed, locked_at, pay_type, zip)
    VALUES ('Electrical Panel Audit','Skilled Labor',175,'helper_confirmed','public',
            $1,$2,false,false,false,
            true,true,$3,'Flat Rate','27401')
  `, [h5, w3, daysAgo(3)]);

  return {
    hirers:      hirers.length || 6,
    workers:     workers.length || 4,
    jobs:        insertedJobs.length,
    paidJobs:    insertedJobs.filter(j => j.isPaid).length,
    unpaidJobs:  insertedJobs.filter(j => !j.isPaid).length,
    disputes:    1,
    studioLogs:  studioEntries.length,
    stuckJobs:   1,
  };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export async function cleanupSimulation(): Promise<Record<string, number>> {
  // Fetch sim user IDs first
  const uRes = await pool.query(
    `SELECT id FROM users WHERE email ILIKE '%@guber-sim.local'`
  );
  const simIds: number[] = uRes.rows.map((r: any) => r.id);
  if (simIds.length === 0) return { users: 0, jobs: 0, transactions: 0, payments: 0, disputes: 0, studio: 0 };

  const ids = simIds.join(",");

  // Jobs posted by sim users
  const jRes = await pool.query(
    `SELECT id FROM jobs WHERE posted_by_id IN (${ids}) OR assigned_helper_id IN (${ids})`
  );
  const jobIds: number[] = jRes.rows.map((r: any) => r.id);
  const jIds = jobIds.length > 0 ? jobIds.join(",") : "0";

  // Delete in dependency order
  const [d1] = await Promise.all([
    pool.query(`DELETE FROM guber_disputes WHERE opened_by_user_id IN (${ids}) OR against_user_id IN (${ids})`),
  ]);
  const [d2] = await Promise.all([
    pool.query(`DELETE FROM wallet_transactions WHERE user_id IN (${ids})`),
  ]);
  const [d3] = await Promise.all([
    pool.query(`DELETE FROM guber_payments WHERE payer_user_id IN (${ids}) OR payee_user_id IN (${ids})`),
  ]);
  const [d4] = await Promise.all([
    pool.query(`DELETE FROM studio_generation_log WHERE user_id IN (${ids})`),
  ]);
  const [d5] = await Promise.all([
    pool.query(`DELETE FROM jobs WHERE posted_by_id IN (${ids}) OR assigned_helper_id IN (${ids})`),
  ]);
  const [d6] = await Promise.all([
    pool.query(`DELETE FROM users WHERE email ILIKE '%@guber-sim.local'`),
  ]);

  return {
    users:        d6.rowCount ?? 0,
    jobs:         d5.rowCount ?? 0,
    transactions: d2.rowCount ?? 0,
    payments:     d3.rowCount ?? 0,
    disputes:     d1.rowCount ?? 0,
    studio:       d4.rowCount ?? 0,
  };
}

// ── Run analysis after seed ────────────────────────────────────────────────────

export async function runPostSeedAnalysis() {
  const [cfo, coo] = await Promise.allSettled([
    runCFOAnalysis(),
    runCOOAnalysis(),
  ]);
  return {
    cfo: cfo.status === "fulfilled" ? { title: cfo.value.title, healthScore: cfo.value.metrics.healthScore } : { error: (cfo as any).reason?.message },
    coo: coo.status === "fulfilled" ? { title: coo.value.title, score: coo.value.platformHealthScore } : { error: (coo as any).reason?.message },
  };
}
