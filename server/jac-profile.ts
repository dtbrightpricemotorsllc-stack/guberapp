/**
 * JAC Profile Sync — auto-syncs structured GUBER user data into jac_memory.
 * Called fire-and-forget from /api/jac/context so the profile stays fresh.
 * The onboard and opportunities routes read from jac_memory via buildJacProfileContext.
 */
import { pool } from "./db";

async function upsertMemory(userId: number, category: string, key: string, value: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO jac_memory (user_id, category, key, value, source, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, 'system', NOW())
     ON CONFLICT (user_id, category, key) DO UPDATE
       SET value = $4::jsonb, source = 'system', updated_at = NOW()`,
    [userId, category, key, JSON.stringify(value)]
  );
}

/**
 * Sync a user's GUBER data into jac_memory.
 * Safe to call repeatedly — all writes are upserts.
 * Fire-and-forget from callers (don't await unless freshness is critical).
 */
export async function syncJacProfile(userId: number): Promise<void> {
  try {
    const [userRes, earnRes, catRes, lbRes, towRes, trailerRes, mktVehicleRes, walletRes, activeJobsRes] = await Promise.all([
      pool.query(
        `SELECT full_name, zipcode, rating, jobs_completed, id_verified,
                stripe_account_status, skills, capabilities_description,
                vehicle_inspections, property_checks, marketplace_verifications,
                day1_og, trust_score, jobs_accepted, reliability_score
         FROM users WHERE id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN amount ELSE 0 END), 0) AS earn_7d,
           COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN amount ELSE 0 END), 0) AS earn_30d,
           COALESCE(SUM(amount), 0) AS earn_all
         FROM wallet_transactions
         WHERE user_id = $1 AND type = 'earning' AND status IN ('available','completed')`,
        [userId]
      ),
      pool.query(
        `SELECT category, COUNT(*)::int AS cnt
         FROM jobs
         WHERE assigned_helper_id = $1 AND status = 'completed'
           AND completed_at > NOW() - INTERVAL '90 days'
         GROUP BY category ORDER BY cnt DESC LIMIT 3`,
        [userId]
      ),
      // Load board — vehicle / trailer data
      pool.query(
        `SELECT trailer_preference, transport_type, vehicle_type, make, model, year
         FROM load_board_listings WHERE poster_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      // Tow vehicle verifications (certifications)
      pool.query(
        `SELECT vehicle_type, plate_state, verified FROM tow_vehicle_verifications
         WHERE carrier_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      // Trailer verifications (certifications)
      pool.query(
        `SELECT trailer_type, verified FROM trailer_verifications
         WHERE carrier_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      // Marketplace vehicle listings the user has posted
      pool.query(
        `SELECT category, title
         FROM marketplace_items
         WHERE seller_id = $1 AND status != 'sold'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      ),
      // Wallet balance
      pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS balance
         FROM wallet_transactions WHERE user_id = $1 AND status = 'completed'`,
        [userId]
      ),
      // Active jobs count
      pool.query(
        `SELECT
           COUNT(CASE WHEN assigned_helper_id = $1 AND status NOT IN ('completed','cancelled','disputed') THEN 1 END)::int AS worker_active,
           COUNT(CASE WHEN posted_by_id = $1 AND status = 'open' AND assigned_helper_id IS NULL THEN 1 END)::int AS hirer_unfilled
         FROM jobs`,
        [userId]
      ),
    ]);

    if (!userRes.rows.length) return;
    const u = userRes.rows[0];
    const batch: Array<{ category: string; key: string; value: unknown }> = [];

    // ── Profile basics ──────────────────────────────────────────────────────
    if (u.full_name) {
      batch.push({ category: "profile", key: "full_name", value: u.full_name });
      batch.push({ category: "profile", key: "first_name", value: (u.full_name as string).split(" ")[0] });
    }
    if (u.zipcode) batch.push({ category: "profile", key: "home_zip", value: u.zipcode });
    if (u.rating != null) batch.push({ category: "profile", key: "rating", value: parseFloat(u.rating) });
    if (u.jobs_completed != null) batch.push({ category: "profile", key: "jobs_completed", value: parseInt(u.jobs_completed) });
    if (u.trust_score != null) batch.push({ category: "profile", key: "trust_score", value: parseInt(u.trust_score) });
    if (u.reliability_score != null) batch.push({ category: "profile", key: "reliability_score", value: parseFloat(u.reliability_score) });
    batch.push({ category: "profile", key: "id_verified", value: !!u.id_verified });
    batch.push({ category: "profile", key: "stripe_ready", value: u.stripe_account_status === "active" });
    batch.push({ category: "profile", key: "is_og", value: !!u.day1_og });
    if (u.skills) batch.push({ category: "profile", key: "skills", value: u.skills });
    if (u.capabilities_description) batch.push({ category: "profile", key: "capabilities", value: u.capabilities_description });

    // ── Wallet balance ──────────────────────────────────────────────────────
    const walletBalance = Math.round(parseFloat(walletRes.rows[0]?.balance || "0") * 100) / 100;
    batch.push({ category: "profile", key: "wallet_balance", value: walletBalance });

    // ── Active jobs ─────────────────────────────────────────────────────────
    const aj = activeJobsRes.rows[0] ?? {};
    batch.push({ category: "profile", key: "worker_active_jobs", value: parseInt(aj.worker_active) || 0 });
    batch.push({ category: "profile", key: "hirer_unfilled_jobs", value: parseInt(aj.hirer_unfilled) || 0 });

    // ── Top service categories ───────────────────────────────────────────────
    if (catRes.rows.length) {
      batch.push({ category: "work", key: "top_service_categories", value: catRes.rows.map((r: any) => r.category) });
    }

    // ── Earnings ─────────────────────────────────────────────────────────────
    if (earnRes.rows.length) {
      const e = earnRes.rows[0];
      batch.push({ category: "work", key: "earnings_7d", value: Math.round(parseFloat(e.earn_7d) * 100) / 100 });
      batch.push({ category: "work", key: "earnings_30d", value: Math.round(parseFloat(e.earn_30d) * 100) / 100 });
      batch.push({ category: "work", key: "earnings_total", value: Math.round(parseFloat(e.earn_all) * 100) / 100 });
    }

    // ── Vehicle — load board (most specific transport data) ──────────────────
    if (lbRes.rows.length) {
      const lb = lbRes.rows[0];
      if (lb.trailer_preference) batch.push({ category: "vehicle", key: "trailer_type", value: lb.trailer_preference });
      if (lb.transport_type) batch.push({ category: "vehicle", key: "transport_type", value: lb.transport_type });
      if (lb.vehicle_type) batch.push({ category: "vehicle", key: "vehicle_type", value: lb.vehicle_type });
      if (lb.make) batch.push({ category: "vehicle", key: "make", value: lb.make });
      if (lb.model) batch.push({ category: "vehicle", key: "model", value: lb.model });
      if (lb.year) batch.push({ category: "vehicle", key: "year", value: lb.year });
    }

    // ── Vehicle — marketplace profile (fallback if no load board) ───────────
    if (!lbRes.rows.length && mktVehicleRes.rows.length) {
      const mv = mktVehicleRes.rows[0];
      if (mv.vehicle_type) batch.push({ category: "vehicle", key: "vehicle_type", value: mv.vehicle_type });
      if (mv.make) batch.push({ category: "vehicle", key: "make", value: mv.make });
      if (mv.model) batch.push({ category: "vehicle", key: "model", value: mv.model });
      if (mv.year) batch.push({ category: "vehicle", key: "year", value: mv.year });
    }

    // ── Certifications — tow vehicle ─────────────────────────────────────────
    if (towRes.rows.length) {
      const t = towRes.rows[0];
      if (t.vehicle_type) batch.push({ category: "certifications", key: "tow_vehicle_type", value: t.vehicle_type });
      batch.push({ category: "certifications", key: "tow_vehicle_verified", value: !!t.verified });
      if (t.plate_state) batch.push({ category: "certifications", key: "tow_plate_state", value: t.plate_state });
    }

    // ── Certifications — trailer ─────────────────────────────────────────────
    if (trailerRes.rows.length) {
      const tr = trailerRes.rows[0];
      if (tr.trailer_type) batch.push({ category: "certifications", key: "trailer_type_verified", value: tr.trailer_type });
      batch.push({ category: "certifications", key: "trailer_verified", value: !!tr.verified });
    }

    // ── V&I experience from user counters ────────────────────────────────────
    const viTypes: string[] = [];
    if (parseInt(u.vehicle_inspections) > 2) viTypes.push("vehicle inspections");
    if (parseInt(u.property_checks) > 2) viTypes.push("property checks");
    if (parseInt(u.marketplace_verifications) > 2) viTypes.push("marketplace verifications");
    if (viTypes.length) batch.push({ category: "certifications", key: "vi_experience", value: viTypes });

    for (const { category, key, value } of batch) {
      await upsertMemory(userId, category, key, value);
    }
  } catch (err: any) {
    console.error("[jac-profile sync]", err.message);
  }
}

/**
 * Build a compact profile context string for the AI system prompt.
 * Reads the already-synced jac_memory rows — does NOT trigger a sync.
 */
export async function buildJacProfileContext(userId: number): Promise<string> {
  try {
    const r = await pool.query(
      `SELECT category, key, value FROM jac_memory
       WHERE user_id = $1
         AND category IN ('profile','work','vehicle','certifications','preferences','schedule')
       ORDER BY category, key`,
      [userId]
    );
    if (!r.rows.length) return "";

    const lines: string[] = ["DEEP PROFILE:"];
    for (const row of r.rows) {
      const val = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
      lines.push(`• ${row.category}/${row.key}: ${val}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Build a personalised morning briefing string for the user.
 * SERVER-SIDE daily gate: returns null if already shown today (per user, stored in jac_memory).
 */
export async function buildMorningBriefing(userId: number): Promise<{
  text: string;
  chips: Array<{ label: string; message: string }>;
} | null> {
  try {
    // ── Server-side daily gate ──────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
    const gateRes = await pool.query(
      `SELECT value FROM jac_memory WHERE user_id = $1 AND category = 'system' AND key = 'last_briefing_date'`,
      [userId]
    );
    if (gateRes.rows.length) {
      const stored = gateRes.rows[0].value;
      const storedDate = typeof stored === "string" ? stored : JSON.stringify(stored).replace(/"/g, "");
      if (storedDate === today) return null;
    }

    const liveRes = await pool.query(`
        SELECT
          (SELECT full_name FROM users WHERE id = $1) AS full_name,
          (SELECT zipcode FROM users WHERE id = $1) AS zipcode,
          (SELECT COUNT(*)::int FROM jobs WHERE assigned_helper_id = $1 AND status NOT IN ('completed','cancelled','disputed') AND deleted_at IS NULL) AS worker_active,
          (SELECT COUNT(*)::int FROM jobs WHERE posted_by_id = $1 AND status = 'open' AND assigned_helper_id IS NULL AND deleted_at IS NULL) AS hirer_unfilled,
          (SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND read = false) AS unread_notifs,
          (SELECT COUNT(*)::int FROM guber_disputes WHERE (opened_by_user_id = $1 OR against_user_id = $1) AND status NOT IN ('resolved','closed')) AS open_disputes,
          (SELECT COUNT(*)::int FROM marketplace_offers WHERE seller_user_id = $1 AND status = 'pending') AS pending_offers,
          (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions WHERE user_id = $1 AND status = 'completed') AS wallet_balance,
          (SELECT COALESCE(SUM(amount),0) FROM wallet_transactions
           WHERE user_id = $1 AND type = 'earning' AND status IN ('available','completed')
             AND created_at > NOW() - INTERVAL '7 days') AS earn_7d,
          (SELECT COUNT(*)::int FROM guber_disputes WHERE (opened_by_user_id = $1 OR against_user_id = $1) AND status NOT IN ('resolved','closed')) +
          (SELECT COUNT(*)::int FROM marketplace_offers WHERE seller_user_id = $1 AND status = 'pending') +
          (SELECT COUNT(*)::int FROM proof_submissions ps JOIN jobs j ON j.id=ps.job_id WHERE j.posted_by_id=$1 AND ps.verified = false) AS pending_action_count,
          (SELECT COUNT(*)::int FROM jobs
           WHERE status = 'open' AND assigned_helper_id IS NULL AND is_published = TRUE
             AND (is_test_job = FALSE OR is_test_job IS NULL) AND deleted_at IS NULL
             AND zip IS NOT NULL
             AND (SELECT zipcode FROM users WHERE id = $1) IS NOT NULL
             AND LEFT(zip, 3) = LEFT((SELECT zipcode FROM users WHERE id = $1), 3)
          ) AS nearby_jobs
      `, [userId]);

    const live = liveRes.rows[0] ?? {};
    const firstName = ((live.full_name || "").split(" ")[0] || "there");

    const parts: string[] = [];
    const chips: Array<{ label: string; message: string }> = [];

    const earn7d = parseFloat(live.earn_7d) || 0;
    if (earn7d > 0) parts.push(`you earned $${earn7d.toFixed(2)} this week`);

    const walletBalance = parseFloat(live.wallet_balance) || 0;
    if (walletBalance >= 50) {
      parts.push(`$${walletBalance.toFixed(2)} is waiting in your wallet`);
      chips.push({ label: "Cash out now", message: "How do I withdraw my wallet balance?" });
    }

    const workerActive = parseInt(live.worker_active) || 0;
    if (workerActive > 0) {
      parts.push(`${workerActive} active job${workerActive > 1 ? "s" : ""} in progress`);
      chips.push({ label: "View my jobs", message: "Show me my active jobs" });
    }

    const openDisputes = parseInt(live.open_disputes) || 0;
    if (openDisputes > 0) {
      parts.push(`${openDisputes} open dispute${openDisputes > 1 ? "s" : ""} need${openDisputes === 1 ? "s" : ""} attention`);
      chips.push({ label: "View disputes", message: "I have an open dispute" });
    }

    const pendingOffers = parseInt(live.pending_offers) || 0;
    if (pendingOffers > 0) {
      parts.push(`${pendingOffers} offer${pendingOffers > 1 ? "s" : ""} on your listings`);
      chips.push({ label: "Review offers", message: "Show me my marketplace offers" });
    }

    const hirerUnfilled = parseInt(live.hirer_unfilled) || 0;
    if (hirerUnfilled > 0) {
      parts.push(`${hirerUnfilled} job${hirerUnfilled > 1 ? "s" : ""} still looking for a worker`);
      chips.push({ label: "View posted jobs", message: "I need to check my posted jobs" });
    }

    const unread = parseInt(live.unread_notifs) || 0;
    if (unread > 0) {
      parts.push(`${unread} unread notification${unread > 1 ? "s" : ""}`);
    }

    const nearbyJobs = parseInt(live.nearby_jobs) || 0;
    const pendingActionCount = parseInt(live.pending_action_count) || 0;

    if (nearbyJobs > 0) {
      chips.push({ label: `${nearbyJobs} nearby job${nearbyJobs > 1 ? "s" : ""}`, message: "Find work nearby" });
    }

    // ── D.D. goal progress ─────────────────────────────────────────────────
    const goalRes = await pool.query(
      `SELECT id, goal_amount, deadline, earned_so_far FROM jac_dd_goals
       WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (goalRes.rows.length) {
      const g = goalRes.rows[0];
      const remaining = Math.max(0, g.goal_amount - (parseFloat(g.earned_so_far) || 0));
      const pct = Math.min(100, Math.round(((parseFloat(g.earned_so_far) || 0) / g.goal_amount) * 100));
      if (remaining > 0) {
        parts.push(`you're ${pct}% toward your $${g.goal_amount} earning goal`);
        chips.push({ label: "Update my D.D. plan", message: `I need $${remaining.toFixed(2)} more toward my goal` });
      } else {
        parts.push(`you've hit your $${g.goal_amount} earning goal — congrats!`);
        chips.push({ label: "Set a new earning goal", message: "I want to set a new earning goal" });
      }
    }

    if (parts.length === 0) {
      const catMemRes = await pool.query(
        `SELECT value FROM jac_memory WHERE user_id = $1 AND category = 'work' AND key = 'top_service_categories' LIMIT 1`,
        [userId]
      );
      const topCats: string[] = Array.isArray(catMemRes.rows[0]?.value) ? catMemRes.rows[0].value : [];
      const catHint = topCats.length ? ` in ${topCats[0]}` : "";
      if (!chips.some(c => c.message === "Find work nearby")) {
        chips.push({ label: "Find work nearby", message: "Find work nearby" });
      }
      chips.push({ label: "Post a job", message: "I need to hire help" });

      const nearbyHint = nearbyJobs > 0 ? ` There ${nearbyJobs === 1 ? "is" : "are"} ${nearbyJobs} open job${nearbyJobs > 1 ? "s" : ""} near you.` : "";
      await upsertMemory(userId, "system", "last_briefing_date", today);
      return {
        text: `Good morning, ${firstName}! Everything looks good — no urgent items.${nearbyHint} Ready to find work${catHint} or post a new job?`,
        chips,
      };
    }

    chips.push({ label: "Find new work", message: "Find work nearby" });

    const summary = parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];

    const nearbyLine = nearbyJobs > 0 ? ` Also, ${nearbyJobs} job${nearbyJobs > 1 ? "s" : ""} near you ${nearbyJobs === 1 ? "is" : "are"} open.` : "";
    const pendingLine = pendingActionCount > 0 ? ` You have ${pendingActionCount} item${pendingActionCount > 1 ? "s" : ""} needing attention.` : "";

    await upsertMemory(userId, "system", "last_briefing_date", today);
    return {
      text: `Morning, ${firstName}! Quick update — ${summary}.${pendingLine}${nearbyLine} What would you like to tackle first?`,
      chips,
    };
  } catch (err: any) {
    console.error("[jac-briefing]", err.message);
    return null;
  }
}

/**
 * Scan for live opportunities relevant to this user.
 * Returns up to 5 ranked items: pending actions first, then matching jobs and load board.
 */
export interface JacOpportunity {
  type: "job" | "load_board" | "pending_action";
  id?: number;
  title: string;
  subtitle?: string;
  payLabel?: string;
  distanceLabel?: string;
  route: string;
  urgency: "high" | "normal";
  tag?: string;
}

export async function scanOpportunities(userId: number): Promise<JacOpportunity[]> {
  const pending: JacOpportunity[] = [];
  const opportunities: JacOpportunity[] = [];
  try {
    // ── 1. Pending actions (highest priority, shown first) ──────────────────
    const [actionRes, walletRes, onTheWayRes, expiringDocsRes] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM guber_disputes WHERE (opened_by_user_id = $1::int OR against_user_id = $1::int) AND status NOT IN ('resolved','closed')) AS disputes,
          (SELECT COUNT(*)::int FROM marketplace_offers WHERE seller_user_id = $1::int AND status = 'pending') AS mkt_offers,
          (SELECT COUNT(*)::int FROM proof_submissions ps JOIN jobs j ON j.id=ps.job_id WHERE j.posted_by_id=$1::int AND ps.verified = false) AS proofs_pending,
          (SELECT COUNT(*)::int FROM jobs j
           WHERE j.assigned_helper_id = $1::int
             AND j.status IN ('accepted','in_progress','arrived')
             AND j.proof_required = TRUE
             AND j.deleted_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM proof_submissions ps WHERE ps.job_id = j.id AND ps.verified = false
             )
          ) AS unsubmitted_proof
      `, [userId]),
      pool.query(
        `SELECT COALESCE(SUM(amount),0) AS balance FROM wallet_transactions WHERE user_id = $1 AND status = 'completed'`,
        [userId]
      ),
      // on_the_way jobs stuck for > 4 hours
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM jobs
         WHERE assigned_helper_id = $1
           AND status = 'on_the_way'
           AND on_the_way_at IS NOT NULL
           AND on_the_way_at < NOW() - INTERVAL '4 hours'
           AND deleted_at IS NULL`,
        [userId]
      ),
      // Documents (release authorizations) expiring within 30 days for this carrier
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM release_authorizations
         WHERE requested_by = $1
           AND approved_by IS NOT NULL
           AND expires_at IS NOT NULL
           AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '30 days'`,
        [userId]
      ),
    ]);

    const actions = actionRes.rows[0] ?? {};
    const walletBalance = parseFloat(walletRes.rows[0]?.balance || "0");
    const stuckJobs = parseInt(onTheWayRes.rows[0]?.cnt || "0");
    const expiringDocs = parseInt(expiringDocsRes.rows[0]?.cnt || "0");

    if (parseInt(actions.disputes) > 0) {
      pending.push({ type: "pending_action", title: `${actions.disputes} open dispute${actions.disputes > 1 ? "s" : ""}`, subtitle: "Needs your response", route: "/jobs", urgency: "high", tag: "⚠️ Dispute" });
    }
    if (parseInt(actions.mkt_offers) > 0) {
      pending.push({ type: "pending_action", title: `${actions.mkt_offers} marketplace offer${actions.mkt_offers > 1 ? "s" : ""}`, subtitle: "Awaiting your review", route: "/marketplace/my-listings", urgency: "high", tag: "💬 Offer" });
    }
    if (parseInt(actions.proofs_pending) > 0) {
      pending.push({ type: "pending_action", title: `${actions.proofs_pending} proof submission${actions.proofs_pending > 1 ? "s" : ""}`, subtitle: "Worker submitted proof — review now", route: "/jobs", urgency: "high", tag: "📋 Proof" });
    }
    if (parseInt(actions.unsubmitted_proof) > 0) {
      pending.push({ type: "pending_action", title: `${actions.unsubmitted_proof} job${parseInt(actions.unsubmitted_proof) > 1 ? "s" : ""} need${parseInt(actions.unsubmitted_proof) === 1 ? "s" : ""} your proof`, subtitle: "Submit proof to complete and get paid", route: "/jobs", urgency: "high", tag: "📸 Submit Proof" });
    }
    if (stuckJobs > 0) {
      pending.push({ type: "pending_action", title: `${stuckJobs} job${stuckJobs > 1 ? "s" : ""} stuck on the way`, subtitle: "En route for over 4 hours — confirm or contact worker", route: "/jobs", urgency: "high", tag: "🕐 Delayed" });
    }
    if (walletBalance >= 50) {
      pending.push({ type: "pending_action", title: `$${walletBalance.toFixed(2)} available to cash out`, subtitle: "Tap to request a withdrawal", route: "/profile", urgency: "normal", tag: "💰 Wallet" });
    }
    if (expiringDocs > 0) {
      pending.push({ type: "pending_action", title: `${expiringDocs} transport authorization${expiringDocs > 1 ? "s" : ""} expiring soon`, subtitle: "Renewal needed within 30 days", route: "/profile", urgency: "high", tag: "📄 Expiring" });
    }

    // ── 2. Profile data for opportunity matching ────────────────────────────
    const memRes = await pool.query(
      `SELECT key, value FROM jac_memory
       WHERE user_id = $1 AND category IN ('work','profile','vehicle')
         AND key IN ('top_service_categories','home_zip','trailer_type','transport_type','vi_experience','vehicle_type')`,
      [userId]
    );
    const mem: Record<string, any> = {};
    for (const row of memRes.rows) mem[row.key] = row.value;

    const userZip: string | null = mem["home_zip"] || null;
    const topCats: string[] = Array.isArray(mem["top_service_categories"]) ? mem["top_service_categories"] : [];
    const trailerType: string | null = mem["trailer_type"] || null;
    const vehicleType: string | null = mem["vehicle_type"] || null;
    const hasViExp = Array.isArray(mem["vi_experience"]) && mem["vi_experience"].length > 0;

    // Helper: compute distance label based on ZIP proximity
    function distLabel(jobZip: string | null): string | undefined {
      if (!userZip || !jobZip) return undefined;
      if (jobZip === userZip) return "Same zip";
      if (jobZip.length >= 3 && userZip.length >= 3 && jobZip.slice(0, 3) === userZip.slice(0, 3)) return "Nearby";
      return undefined;
    }

    // ── 3. V&I jobs near user ───────────────────────────────────────────────
    if (userZip) {
      const viRes = await pool.query(`
        SELECT id, title, category, budget, zip, urgent_switch
        FROM jobs
        WHERE status = 'open'
          AND assigned_helper_id IS NULL
          AND is_published = TRUE
          AND (is_test_job = FALSE OR is_test_job IS NULL)
          AND deleted_at IS NULL
          AND job_type = 'vi'
          AND (zip = $2 OR LEFT(zip, 3) = LEFT($2, 3))
        ORDER BY urgent_switch DESC, created_at DESC
        LIMIT 2
      `, [userId, userZip]);
      for (const j of viRes.rows) {
        opportunities.push({
          type: "job",
          id: j.id,
          title: j.title,
          subtitle: `V&I · ${j.zip || ""}`,
          payLabel: j.budget ? `$${parseFloat(j.budget).toFixed(0)}` : "Open bid",
          distanceLabel: distLabel(j.zip),
          route: `/jobs/${j.id}`,
          urgency: j.urgent_switch ? "high" : "normal",
          tag: "🔍 V&I",
        });
      }
    }

    // ── 4. Open jobs matching zip (same ZIP or adjacent 3-digit prefix) + categories ──
    const hasZip = !!userZip;
    const hasCats = topCats.length > 0;

    if (hasZip || hasCats) {
      const params: unknown[] = [];
      let zipClause = "";
      let catClause = "";
      if (hasZip) { params.push(userZip); zipClause = `AND (zip = $${params.length} OR LEFT(zip, 3) = LEFT($${params.length}, 3))`; }
      if (hasCats) { params.push(topCats); catClause = `AND category = ANY($${params.length}::text[])`; }
      const jobsRes = await pool.query(`
        SELECT id, title, category, budget, zip, urgent_switch
        FROM jobs
        WHERE status = 'open'
          AND assigned_helper_id IS NULL
          AND is_published = TRUE
          AND (is_test_job = FALSE OR is_test_job IS NULL)
          AND deleted_at IS NULL
          AND (job_type IS NULL OR job_type != 'vi')
          ${zipClause}
          ${catClause}
        ORDER BY urgent_switch DESC, created_at DESC
        LIMIT 3
      `, params);
      for (const j of jobsRes.rows) {
        opportunities.push({
          type: "job",
          id: j.id,
          title: j.title,
          subtitle: j.category + (j.zip ? ` · ${j.zip}` : ""),
          payLabel: j.budget ? `$${parseFloat(j.budget).toFixed(0)}` : "Open bid",
          distanceLabel: distLabel(j.zip),
          route: `/jobs/${j.id}`,
          urgency: j.urgent_switch ? "high" : "normal",
          tag: j.urgent_switch ? "🔥 Urgent" : j.category,
        });
      }
    } else {
      // Fallback: any recent open jobs
      const jobsRes = await pool.query(`
        SELECT id, title, category, budget, zip, urgent_switch
        FROM jobs
        WHERE status = 'open'
          AND assigned_helper_id IS NULL
          AND is_published = TRUE
          AND (is_test_job = FALSE OR is_test_job IS NULL)
          AND deleted_at IS NULL
        ORDER BY urgent_switch DESC, created_at DESC
        LIMIT 3
      `);
      for (const j of jobsRes.rows) {
        opportunities.push({
          type: "job",
          id: j.id,
          title: j.title,
          subtitle: j.category + (j.zip ? ` · ${j.zip}` : ""),
          payLabel: j.budget ? `$${parseFloat(j.budget).toFixed(0)}` : "Open bid",
          distanceLabel: distLabel(j.zip),
          route: `/jobs/${j.id}`,
          urgency: j.urgent_switch ? "high" : "normal",
          tag: j.urgent_switch ? "🔥 Urgent" : j.category,
        });
      }
    }

    // ── 5. Load board listings matching trailer type or vehicle type ────────
    if (trailerType || vehicleType || topCats.some((c: string) => /transport|load|haul|tow/i.test(c))) {
      const lbParams: unknown[] = [];
      let trailerClause = "";
      let vehicleClause = "";
      if (trailerType) { lbParams.push(trailerType); trailerClause = `AND trailer_preference = $${lbParams.length}`; }
      else if (vehicleType) { lbParams.push(vehicleType); vehicleClause = `AND vehicle_type = $${lbParams.length}`; }
      const lbRes = await pool.query(`
        SELECT id, pickup_city, pickup_state, delivery_city, delivery_state, posted_price, transport_type, vehicle_type
        FROM load_board_listings
        WHERE status = 'posted'
          ${trailerClause}
          ${vehicleClause}
        ORDER BY created_at DESC
        LIMIT 2
      `, lbParams);
      for (const lb of lbRes.rows) {
        const from = [lb.pickup_city, lb.pickup_state].filter(Boolean).join(", ");
        const to = [lb.delivery_city, lb.delivery_state].filter(Boolean).join(", ");
        opportunities.push({
          type: "load_board",
          id: lb.id,
          title: `Transport: ${from || "?"} → ${to || "?"}`,
          subtitle: lb.transport_type || "Load Board",
          payLabel: lb.posted_price ? `$${parseFloat(lb.posted_price).toFixed(0)}` : "Open offers",
          route: `/load-board`,
          urgency: "normal",
          tag: "🚛 Load Board",
        });
      }
    }

    // Pending actions first, then opportunities; cap at 5 total
    return [...pending, ...opportunities].slice(0, 5);
  } catch (err: any) {
    console.error("[jac-opportunities]", err.message);
    return [...pending, ...opportunities].slice(0, 5);
  }
}
