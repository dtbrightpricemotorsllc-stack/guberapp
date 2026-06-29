/**
 * JAC Profile Sync — auto-syncs structured GUBER user data into jac_memory.
 * Called fire-and-forget from /api/jac/context so the profile stays fresh.
 * The onboard and opportunities routes read from jac_memory via buildJacProfileContext.
 */
import { pool } from "./db";

/**
 * Upsert a single jac_memory key. Source='system' so it's never shown to the
 * user in the "What JAC remembers" list (only user_said / extracted show there).
 */
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
    const userRes = await pool.query(
      `SELECT full_name, zipcode, rating, jobs_completed, id_verified,
              stripe_account_status, skills, capabilities_description,
              vehicle_inspections, property_checks, marketplace_verifications,
              day1_og, trust_score, jobs_accepted, reliability_score
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!userRes.rows.length) return;
    const u = userRes.rows[0];

    const batch: Array<{ category: string; key: string; value: unknown }> = [];

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

    // Top service categories from job history (last 90 days)
    const catRes = await pool.query(
      `SELECT category, COUNT(*)::int AS cnt
       FROM jobs
       WHERE assigned_helper_id = $1 AND status = 'completed'
         AND completed_at > NOW() - INTERVAL '90 days'
       GROUP BY category ORDER BY cnt DESC LIMIT 3`,
      [userId]
    );
    if (catRes.rows.length) {
      batch.push({ category: "work", key: "top_service_categories", value: catRes.rows.map((r: any) => r.category) });
    }

    // Earnings last 7d and 30d
    const earnRes = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN amount ELSE 0 END), 0) AS earn_7d,
         COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN amount ELSE 0 END), 0) AS earn_30d,
         COALESCE(SUM(amount), 0) AS earn_all
       FROM wallet_transactions
       WHERE user_id = $1 AND type = 'earning' AND status IN ('available','completed')`,
      [userId]
    );
    if (earnRes.rows.length) {
      const e = earnRes.rows[0];
      batch.push({ category: "work", key: "earnings_7d", value: Math.round(parseFloat(e.earn_7d) * 100) / 100 });
      batch.push({ category: "work", key: "earnings_30d", value: Math.round(parseFloat(e.earn_30d) * 100) / 100 });
      batch.push({ category: "work", key: "earnings_total", value: Math.round(parseFloat(e.earn_all) * 100) / 100 });
    }

    // Vehicle / trailer type from most recent load board listing
    const lbRes = await pool.query(
      `SELECT trailer_preference, transport_type, vehicle_type, make, model, year
       FROM load_board_listings WHERE poster_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (lbRes.rows.length) {
      const lb = lbRes.rows[0];
      if (lb.trailer_preference) batch.push({ category: "vehicle", key: "trailer_type", value: lb.trailer_preference });
      if (lb.transport_type) batch.push({ category: "vehicle", key: "transport_type", value: lb.transport_type });
      if (lb.vehicle_type) batch.push({ category: "vehicle", key: "vehicle_type", value: lb.vehicle_type });
      if (lb.make) batch.push({ category: "vehicle", key: "make", value: lb.make });
      if (lb.model) batch.push({ category: "vehicle", key: "model", value: lb.model });
      if (lb.year) batch.push({ category: "vehicle", key: "year", value: lb.year });
    }

    // V&I experience from user counters
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
 * Returns null if nothing noteworthy to report.
 */
export async function buildMorningBriefing(userId: number): Promise<{
  text: string;
  chips: Array<{ label: string; message: string }>;
} | null> {
  try {
    const [profileRes, liveRes] = await Promise.all([
      pool.query(
        `SELECT key, value FROM jac_memory
         WHERE user_id = $1 AND category = 'work' AND key IN ('earnings_7d','earnings_30d','top_service_categories')`,
        [userId]
      ),
      pool.query(`
        SELECT
          (SELECT full_name FROM users WHERE id = $1) AS full_name,
          (SELECT COUNT(*)::int FROM jobs WHERE assigned_helper_id = $1 AND status NOT IN ('completed','cancelled','disputed') AND deleted_at IS NULL) AS worker_active,
          (SELECT COUNT(*)::int FROM jobs WHERE posted_by_id = $1 AND status = 'open' AND assigned_helper_id IS NULL AND deleted_at IS NULL) AS hirer_unfilled,
          (SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND read = false) AS unread_notifs,
          (SELECT COUNT(*)::int FROM guber_disputes WHERE (claimant_id = $1 OR respondent_id = $1) AND status NOT IN ('resolved','closed')) AS open_disputes,
          (SELECT COUNT(*)::int FROM marketplace_offers WHERE seller_user_id = $1 AND status = 'pending') AS pending_offers,
          (SELECT COUNT(*)::int FROM jobs WHERE assigned_helper_id = $1 AND status = 'open' AND zip IS NOT NULL) AS nearby_open
      `, [userId]),
    ]);

    const live = liveRes.rows[0] ?? {};
    const firstName = ((live.full_name || "").split(" ")[0] || "there");
    const memMap: Record<string, any> = {};
    for (const row of profileRes.rows) memMap[row.key] = row.value;

    const parts: string[] = [];
    const chips: Array<{ label: string; message: string }> = [];

    const earn7d = parseFloat(memMap["earnings_7d"]) || 0;
    if (earn7d > 0) parts.push(`You earned $${earn7d.toFixed(2)} this week`);

    const workerActive = parseInt(live.worker_active) || 0;
    if (workerActive > 0) {
      parts.push(`${workerActive} active job${workerActive > 1 ? "s" : ""} in progress`);
      chips.push({ label: "View my jobs", message: "Show me my active jobs" });
    }

    const openDisputes = parseInt(live.open_disputes) || 0;
    if (openDisputes > 0) {
      parts.push(`${openDisputes} open dispute${openDisputes > 1 ? "s" : ""} needing attention`);
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

    // Default morning nudge if nothing urgent
    if (parts.length === 0) {
      const topCats: string[] = Array.isArray(memMap["top_service_categories"]) ? memMap["top_service_categories"] : [];
      const catHint = topCats.length ? ` in ${topCats[0]}` : "";
      chips.push({ label: "Find work nearby", message: "Find work nearby" });
      chips.push({ label: "Post a job", message: "I need to hire help" });
      return {
        text: `Good morning, ${firstName}! Everything's looking good — no urgent items. Ready to find work${catHint} or post a new job?`,
        chips,
      };
    }

    chips.push({ label: "Find new work", message: "Find work nearby" });

    const summary = parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];

    return {
      text: `Morning, ${firstName}! Quick update — ${summary}. What would you like to tackle first?`,
      chips,
    };
  } catch (err: any) {
    console.error("[jac-briefing]", err.message);
    return null;
  }
}

/**
 * Scan for live opportunities relevant to this user.
 */
export interface JacOpportunity {
  type: "job" | "load_board" | "pending_action";
  id?: number;
  title: string;
  subtitle?: string;
  payLabel?: string;
  route: string;
  urgency: "high" | "normal";
  tag?: string;
}

export async function scanOpportunities(userId: number): Promise<JacOpportunity[]> {
  const results: JacOpportunity[] = [];
  try {
    // 1. Pending actions (highest priority)
    const actionRes = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM guber_disputes WHERE (claimant_id = $1 OR respondent_id = $1) AND status NOT IN ('resolved','closed')) AS disputes,
        (SELECT COUNT(*)::int FROM marketplace_offers WHERE seller_user_id = $1 AND status = 'pending') AS mkt_offers,
        (SELECT COUNT(*)::int FROM proof_submissions ps JOIN jobs j ON j.id=ps.job_id WHERE j.posted_by_id=$1 AND ps.status='submitted') AS proofs_pending
    `, [userId]);
    const actions = actionRes.rows[0] ?? {};

    if (parseInt(actions.disputes) > 0) {
      results.push({ type: "pending_action", title: `${actions.disputes} open dispute${actions.disputes > 1 ? "s" : ""}`, subtitle: "Needs your response", route: "/jobs", urgency: "high", tag: "⚠️ Dispute" });
    }
    if (parseInt(actions.mkt_offers) > 0) {
      results.push({ type: "pending_action", title: `${actions.mkt_offers} marketplace offer${actions.mkt_offers > 1 ? "s" : ""}`, subtitle: "Awaiting your review", route: "/marketplace/my-listings", urgency: "high", tag: "💬 Offer" });
    }
    if (parseInt(actions.proofs_pending) > 0) {
      results.push({ type: "pending_action", title: `${actions.proofs_pending} proof submission${actions.proofs_pending > 1 ? "s" : ""}`, subtitle: "Worker submitted proof — review now", route: "/jobs", urgency: "high", tag: "📋 Proof" });
    }

    // 2. User's top service categories + zip from profile memory
    const memRes = await pool.query(
      `SELECT key, value FROM jac_memory
       WHERE user_id = $1 AND category IN ('work','profile','vehicle')
         AND key IN ('top_service_categories','home_zip','trailer_type','transport_type')`,
      [userId]
    );
    const mem: Record<string, any> = {};
    for (const row of memRes.rows) mem[row.key] = row.value;

    const userZip: string | null = mem["home_zip"] || null;
    const topCats: string[] = Array.isArray(mem["top_service_categories"]) ? mem["top_service_categories"] : [];
    const trailerType: string | null = mem["trailer_type"] || null;

    // 3. Open jobs matching user zip + top categories
    if (userZip || topCats.length > 0) {
      const zipFilter = userZip ? `AND zip = '${userZip.replace(/'/g, "''")}'` : "";
      const catFilter = topCats.length
        ? `AND category = ANY(ARRAY[${topCats.map((c: string) => `'${c.replace(/'/g, "''")}'`).join(",")}]::text[])`
        : "";
      const jobsRes = await pool.query(`
        SELECT id, title, category, budget, zip, urgent_switch
        FROM jobs
        WHERE status = 'open'
          AND assigned_helper_id IS NULL
          AND is_published = TRUE
          AND (is_test_job = FALSE OR is_test_job IS NULL)
          AND deleted_at IS NULL
          ${zipFilter}
          ${catFilter}
        ORDER BY urgent_switch DESC, created_at DESC
        LIMIT 4
      `);
      for (const j of jobsRes.rows) {
        results.push({
          type: "job",
          id: j.id,
          title: j.title,
          subtitle: j.category + (j.zip ? ` · ${j.zip}` : ""),
          payLabel: j.budget ? `$${parseFloat(j.budget).toFixed(0)}` : "Open bid",
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
        results.push({
          type: "job",
          id: j.id,
          title: j.title,
          subtitle: j.category + (j.zip ? ` · ${j.zip}` : ""),
          payLabel: j.budget ? `$${parseFloat(j.budget).toFixed(0)}` : "Open bid",
          route: `/jobs/${j.id}`,
          urgency: j.urgent_switch ? "high" : "normal",
          tag: j.urgent_switch ? "🔥 Urgent" : j.category,
        });
      }
    }

    // 4. Load board listings matching trailer type
    if (trailerType || topCats.some((c: string) => c.toLowerCase().includes("transport") || c.toLowerCase().includes("load"))) {
      const trailerFilter = trailerType ? `AND trailer_preference = '${trailerType.replace(/'/g, "''")}'` : "";
      const lbRes = await pool.query(`
        SELECT id, pickup_city, pickup_state, delivery_city, delivery_state, posted_price, transport_type
        FROM load_board_listings
        WHERE status = 'posted'
          ${trailerFilter}
        ORDER BY created_at DESC
        LIMIT 3
      `);
      for (const lb of lbRes.rows) {
        const from = [lb.pickup_city, lb.pickup_state].filter(Boolean).join(", ");
        const to = [lb.delivery_city, lb.delivery_state].filter(Boolean).join(", ");
        results.push({
          type: "load_board",
          id: lb.id,
          title: `Transport: ${from} → ${to}`,
          subtitle: lb.transport_type || "Load Board",
          payLabel: lb.posted_price ? `$${parseFloat(lb.posted_price).toFixed(0)}` : "Open offers",
          route: `/load-board`,
          urgency: "normal",
          tag: "🚛 Load Board",
        });
      }
    }

    return results.slice(0, 8);
  } catch (err: any) {
    console.error("[jac-opportunities]", err.message);
    return results;
  }
}
