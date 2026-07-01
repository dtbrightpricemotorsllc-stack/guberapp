import type { Express, Request, Response } from "express";
import { pool } from "./db";
import OpenAI from "openai";

// ── helpers ───────────────────────────────────────────────────────────────────

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function getCampaignLabUser(userId: number) {
  const r = await pool.query(
    "SELECT id, role, full_name, email, campaign_lab_role FROM users WHERE id = $1",
    [userId]
  );
  return r.rows[0] || null;
}

function hasLabAccess(user: any) {
  return user && (user.role === "admin" || !!user.campaign_lab_role);
}

function hasLabAdminAccess(user: any) {
  return user && (user.role === "admin" || user.campaign_lab_role === "marketing_manager");
}

function hasReviewAccess(user: any) {
  return user && (user.role === "admin" || user.campaign_lab_role === "marketing_manager" || user.campaign_lab_role === "reviewer");
}

async function requireLabAccess(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
  const user = await getCampaignLabUser(req.session.userId);
  if (!hasLabAccess(user)) return res.status(403).json({ message: "Campaign Lab access required" });
  (req as any).labUser = user;
  next();
}

async function requireLabAdmin(req: Request, res: Response, next: Function) {
  if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
  const user = await getCampaignLabUser(req.session.userId);
  if (!hasLabAdminAccess(user)) return res.status(403).json({ message: "Campaign Lab admin access required" });
  (req as any).labUser = user;
  next();
}

async function getBrandContext(): Promise<string> {
  const r = await pool.query(
    "SELECT title, content FROM campaign_lab_brand_context WHERE is_active = TRUE ORDER BY sort_order ASC"
  );
  if (!r.rows.length) return "";
  const lines = r.rows.map((row: any) => `[${row.title}]\n${row.content}`).join("\n\n");
  return `=== GUBER BRAND CONTEXT ===\nYou are creating content for GUBER. Never explain what GUBER is to the user — use this context directly in your output.\n\n${lines}\n\n=== END BRAND CONTEXT ===\n\n`;
}

async function checkAndDeductBudget(userId: number, campaignId: number | null, costCents: number): Promise<{ ok: boolean; reason?: string }> {
  if (costCents === 0) return { ok: true };

  const month = new Date().toISOString().slice(0, 7);

  // Check kill switch + global budget
  const budgetR = await pool.query("SELECT * FROM campaign_lab_budget_config WHERE id = 1");
  const budget = budgetR.rows[0];
  if (budget?.ai_kill_switch) return { ok: false, reason: "AI generation is currently paused by admin." };

  if (budget) {
    const currentMonth = budget.budget_month_year || "";
    const used = currentMonth === month ? (budget.monthly_spent_cents || 0) : 0;
    if (budget.monthly_budget_cents > 0 && used + costCents > budget.monthly_budget_cents) {
      return { ok: false, reason: "Monthly AI budget has been reached." };
    }
  }

  // Check campaign budget (if set)
  if (campaignId) {
    const campR = await pool.query("SELECT budget_cents, spent_cents FROM campaign_lab_campaigns WHERE id = $1", [campaignId]);
    const camp = campR.rows[0];
    if (camp && camp.budget_cents > 0 && (camp.spent_cents || 0) + costCents > camp.budget_cents) {
      return { ok: false, reason: "This campaign's budget has been reached." };
    }
  }

  // Check creator assignment limit
  if (campaignId) {
    const assignR = await pool.query(
      "SELECT spending_limit_cents, spent_cents FROM campaign_lab_creator_assignments WHERE user_id = $1 AND campaign_id = $2 AND active = TRUE",
      [userId, campaignId]
    );
    const assign = assignR.rows[0];
    if (assign && assign.spending_limit_cents > 0 && (assign.spent_cents || 0) + costCents > assign.spending_limit_cents) {
      return { ok: false, reason: "Your spending limit for this campaign has been reached." };
    }
  }

  return { ok: true };
}

async function recordGenerationCost(userId: number, campaignId: number | null, workItemId: number | null, toolKey: string, costCents: number, status: string, promptUsed: string, outputUrl: string | null, providerJobId: string | null) {
  if (costCents === 0 && status === "success") {
    await pool.query(
      "INSERT INTO campaign_lab_generation_log (user_id, campaign_id, work_item_id, tool_key, cost_cents, status, prompt_used, output_url, provider_job_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [userId, campaignId, workItemId, toolKey, costCents, status, promptUsed, outputUrl, providerJobId]
    );
    return;
  }

  const month = new Date().toISOString().slice(0, 7);

  await pool.query(
    "INSERT INTO campaign_lab_generation_log (user_id, campaign_id, work_item_id, tool_key, cost_cents, status, prompt_used, output_url, provider_job_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [userId, campaignId, workItemId, toolKey, costCents, status, promptUsed, outputUrl, providerJobId]
  );

  if (status === "success" && costCents > 0) {
    // Update global monthly spend
    await pool.query(
      `UPDATE campaign_lab_budget_config SET
         monthly_spent_cents = CASE WHEN budget_month_year = $1 THEN monthly_spent_cents + $2 ELSE $2 END,
         budget_month_year = $1,
         updated_at = NOW()
       WHERE id = 1`,
      [month, costCents]
    );
    // Update campaign spend
    if (campaignId) {
      await pool.query("UPDATE campaign_lab_campaigns SET spent_cents = spent_cents + $1, updated_at = NOW() WHERE id = $2", [costCents, campaignId]);
      // Update creator assignment spend
      await pool.query(
        "UPDATE campaign_lab_creator_assignments SET spent_cents = spent_cents + $1 WHERE user_id = $2 AND campaign_id = $3 AND active = TRUE",
        [costCents, userId, campaignId]
      );
    }
  }
}

// ── lazy seed (non-blocking, runs after server fully starts) ─────────────────

async function seedCampaignLabData() {
  try {
    await pool.query(`
      INSERT INTO campaign_lab_tool_costs (tool_key, display_name, cost_cents, description)
      VALUES
        ('ai_script','AI Script',1,'Generate a campaign script using GPT-4o'),
        ('ai_caption','AI Caption',1,'Generate social media captions'),
        ('ai_hashtags','AI Hashtags',0,'Generate hashtag sets'),
        ('ai_headline','AI Headline',1,'Generate ad headlines'),
        ('ai_hook','AI Hook',1,'Generate video hooks'),
        ('ai_storyboard','AI Storyboard',2,'Generate storyboard text outline'),
        ('image_generation','Image Generation',4,'Generate a still image (Flux)'),
        ('voiceover','Voiceover',8,'Generate voiceover audio (OpenAI TTS)'),
        ('short_video','Short Video (5s)',35,'Generate 5-second video (Wan Motion)'),
        ('long_video','Long Video (10s)',60,'Generate 10-second video (Wan Motion)'),
        ('music','Background Music',5,'Generate background music (MiniMax)')
      ON CONFLICT (tool_key) DO NOTHING;
    `);

    const ctxCount = await pool.query("SELECT COUNT(*) FROM campaign_lab_brand_context");
    if (parseInt(ctxCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO campaign_lab_brand_context (category, title, content, sort_order) VALUES
          ('identity','Brand Name & Slogan','GUBER — Global Unlimited Business & Employment Resources. Slogan: "Create Value In Yourself." U.S.-only local platform.',1),
          ('identity','What GUBER Does','GUBER connects workers with hirers for real local jobs. Workers earn by completing gigs; hirers post jobs and hire ID-verified workers. Features: Job Board, Verify & Inspect, Load Board, Marketplace, Cash Drops, GUBER Studio, and more.',2),
          ('tone','Brand Voice & Tone','Confident, direct, community-focused. Empowering for workers, efficient for hirers. Never corporate or cold. Think "trusted neighbor who gets things done." Avoid jargon. Short sentences. Action-oriented.',3),
          ('tone','Target Audience','Primary: working-class Americans aged 18–45 who want to earn extra income or get tasks done locally. Secondary: small business owners, property managers, truck drivers, tradespeople.',4),
          ('mascots','Honey Badger Mascot','The GUBER Honey Badger represents grit, fearlessness, and hustle. He embodies "Create Value In Yourself." Use him in content celebrating workers, hustle culture, and getting things done.',5),
          ('features','Core Features','Job Board (post/apply), Verify & Inspect (photo/video proof jobs), Load Board (trucking/freight), Marketplace (buy/sell locally), Cash Drops (earn cash prizes), GUBER Studio (AI content creation), Day-1 OG (founding member program).',6),
          ('features','Day-1 OG Program','Day-1 OG members are GUBER''s founding community. One-time $1.99 purchase. Benefits: exclusive badge, +20 Studio credits/month, early feature access, OG-only rewards. Positioned as a historic opportunity.',7),
          ('strategy','Marketing Goals','Grow the worker base in U.S. cities. Drive job postings. Increase Day-1 OG conversions. Build brand recognition as "the local work app." Content should inspire hustle, showcase real success stories.',8),
          ('hashtags','Approved Hashtags','#GUBER #CreateValueInYourself #GUBERWork #LocalJobs #HustleWithGUBER #GUBERHustle #FindWorkNearby #HireLocal #GUBERApp #WorkWithGUBER #DayOneOG #GUBERCreator',9),
          ('ctas','Approved Calls-to-Action','Download GUBER free · Find work near you today · Post your first job free · Become a Day-1 OG · Join the hustle · Earn on your terms · Create value in yourself · Start earning today',10),
          ('guidelines','What NOT to Do','Do not mention competitors. Do not make income guarantees. Do not use copyrighted music without approval. Always include the GUBER logo in final content. Never misrepresent features.',11),
          ('colors','Brand Colors','Primary Green: #22C55E. Background Dark: #0a0a0a. Text White: #ffffff. Accent Gold: #F5A623. Use green as the dominant action color. Dark backgrounds preferred.',12);
      `);
    }

    const campCount = await pool.query("SELECT COUNT(*) FROM campaign_lab_campaigns");
    if (parseInt(campCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO campaign_lab_campaigns (title, description, goal, audience, approved_messaging, required_cta, hashtags, status) VALUES
          ('Find Work','Promote the job-finding experience for workers','Drive worker signups and first job applications','Job seekers aged 18–45 in U.S. cities','GUBER connects you with real paying jobs in your area. Sign up free and start earning today.','Find work near you today','["#GUBER","#FindWorkNearby","#GUBERWork","#LocalJobs"]','active'),
          ('Hire Help','Promote job posting for hirers','Drive job postings from individuals and small businesses','Homeowners, small business owners, property managers','Post a job on GUBER and hire a verified local worker today. It''s free to post.','Post your first job free','["#GUBER","#HireLocal","#GUBERApp"]','active'),
          ('Day-1 OG','Promote the Day-1 OG founding member program','Drive Day-1 OG conversions before the price changes','Early adopters and loyal GUBER users','For just $1.99, become a GUBER Day-1 OG and lock in founding member status forever. This offer will not last.','Become a Day-1 OG','["#DayOneOG","#GUBER","#CreateValueInYourself"]','active'),
          ('Cash Drops','Promote Cash Drop earning opportunities','Drive Cash Drop participation and new user acquisition','Workers and hustle-oriented users','GUBER Cash Drops put real money in your pocket for completing local tasks. New drops added regularly.','Claim your Cash Drop','["#GUBER","#CashDrops","#HustleWithGUBER"]','active'),
          ('JAC AI Assistant','Promote the JAC AI assistant feature','Drive JAC engagement and feature awareness','All GUBER users','Meet JAC — your personal AI assistant inside GUBER. He knows the app, your history, and how to help you earn more.','Meet JAC in the app','["#GUBER","#JAC","#AIAssistant"]','active'),
          ('GUBER Studio','Promote Studio AI tools to users','Drive Studio credit purchases and feature adoption','Creative users, content creators, small businesses','Create pro-quality videos, images, and music in minutes with GUBER Studio. No editing skills needed.','Try GUBER Studio free','["#GUBERStudio","#GUBER","#AIContent"]','active'),
          ('Tutorials & How-To','Educational content for new users','Reduce churn and increase feature adoption among new signups','New GUBER users (first 30 days)','New to GUBER? Here''s everything you need to know to start earning (or hiring) today.','Watch the tutorial','["#GUBER","#HowTo","#GetStarted"]','active');
      `);
    }

    console.log("[campaign-lab] Seeds applied.");
  } catch (err: any) {
    console.error("[campaign-lab] Seed error (non-fatal):", err.message);
  }
}

// ── route registration ────────────────────────────────────────────────────────

export function setupCampaignLabRoutes(app: Express) {
  // Seed data lazily after server boot (non-blocking)
  setImmediate(() => seedCampaignLabData().catch(() => {}));

  // ── Access check ─────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/access", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ hasAccess: false });
    const user = await getCampaignLabUser(req.session.userId);
    if (!hasLabAccess(user)) return res.json({ hasAccess: false });
    res.json({
      hasAccess: true,
      role: user.role === "admin" ? "admin" : user.campaign_lab_role,
      canReview: hasReviewAccess(user),
      canAdmin: hasLabAdminAccess(user),
      isAdmin: user.role === "admin",
    });
  });

  // ── Brand Context ─────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/brand-context", requireLabAccess, async (req, res) => {
    const r = await pool.query("SELECT * FROM campaign_lab_brand_context ORDER BY sort_order ASC, id ASC");
    res.json(r.rows);
  });

  app.post("/api/campaign-lab/brand-context", requireLabAdmin, async (req, res) => {
    const { category, title, content, sortOrder = 0 } = req.body;
    if (!category || !title || !content) return res.status(400).json({ message: "category, title, content required" });
    const r = await pool.query(
      "INSERT INTO campaign_lab_brand_context (category, title, content, sort_order) VALUES ($1,$2,$3,$4) RETURNING *",
      [category, title, content, sortOrder]
    );
    res.json(r.rows[0]);
  });

  app.patch("/api/campaign-lab/brand-context/:id", requireLabAdmin, async (req, res) => {
    const { category, title, content, isActive, sortOrder } = req.body;
    const r = await pool.query(
      `UPDATE campaign_lab_brand_context SET
         category = COALESCE($1, category),
         title = COALESCE($2, title),
         content = COALESCE($3, content),
         is_active = COALESCE($4, is_active),
         sort_order = COALESCE($5, sort_order),
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [category, title, content, isActive, sortOrder, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  });

  app.delete("/api/campaign-lab/brand-context/:id", requireLabAdmin, async (req, res) => {
    await pool.query("DELETE FROM campaign_lab_brand_context WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  });

  // ── Asset Library ─────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/assets", requireLabAccess, async (req, res) => {
    const { category, fileType } = req.query;
    let q = "SELECT * FROM campaign_lab_assets WHERE is_approved = TRUE";
    const params: any[] = [];
    if (category) { params.push(category); q += ` AND category = $${params.length}`; }
    if (fileType) { params.push(fileType); q += ` AND file_type = $${params.length}`; }
    q += " ORDER BY created_at DESC";
    const r = await pool.query(q, params);
    res.json(r.rows);
  });

  app.post("/api/campaign-lab/assets", requireLabAdmin, async (req, res) => {
    const { category, name, description, url, cloudinaryPublicId, fileType, mimeType, tags = [] } = req.body;
    if (!category || !name || !url || !fileType) return res.status(400).json({ message: "category, name, url, fileType required" });
    const r = await pool.query(
      "INSERT INTO campaign_lab_assets (category, name, description, url, cloudinary_public_id, file_type, mime_type, tags, uploaded_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
      [category, name, description || null, url, cloudinaryPublicId || null, fileType, mimeType || null, JSON.stringify(tags), req.session!.userId]
    );
    res.json(r.rows[0]);
  });

  app.delete("/api/campaign-lab/assets/:id", requireLabAdmin, async (req, res) => {
    await pool.query("DELETE FROM campaign_lab_assets WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  });

  // ── Campaigns ─────────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/campaigns", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const isAdminOrMM = hasLabAdminAccess(user);

    if (isAdminOrMM) {
      const r = await pool.query("SELECT * FROM campaign_lab_campaigns ORDER BY created_at DESC");
      return res.json(r.rows);
    }

    // Creators only see assigned campaigns
    const r = await pool.query(
      `SELECT c.* FROM campaign_lab_campaigns c
       INNER JOIN campaign_lab_creator_assignments a ON a.campaign_id = c.id
       WHERE a.user_id = $1 AND a.active = TRUE
       ORDER BY c.created_at DESC`,
      [user.id]
    );
    res.json(r.rows);
  });

  app.get("/api/campaign-lab/campaigns/:id", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const campaignId = parseInt(req.params.id);

    const r = await pool.query("SELECT * FROM campaign_lab_campaigns WHERE id = $1", [campaignId]);
    if (!r.rows.length) return res.status(404).json({ message: "Campaign not found" });
    const campaign = r.rows[0];

    // Check creator has access
    if (!hasLabAdminAccess(user) && !hasReviewAccess(user)) {
      const assignR = await pool.query(
        "SELECT id FROM campaign_lab_creator_assignments WHERE user_id = $1 AND campaign_id = $2 AND active = TRUE",
        [user.id, campaignId]
      );
      if (!assignR.rows.length) return res.status(403).json({ message: "Not assigned to this campaign" });
    }

    // Get assignments with user info
    const assignmentsR = await pool.query(
      `SELECT a.*, u.full_name, u.email, u.profile_photo FROM campaign_lab_creator_assignments a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.campaign_id = $1`,
      [campaignId]
    );

    // Get work items
    const workItemsQuery = hasLabAdminAccess(user) || hasReviewAccess(user)
      ? `SELECT w.*, u.full_name as creator_name FROM campaign_lab_work_items w LEFT JOIN users u ON u.id = w.user_id WHERE w.campaign_id = $1 ORDER BY w.created_at DESC`
      : `SELECT w.*, u.full_name as creator_name FROM campaign_lab_work_items w LEFT JOIN users u ON u.id = w.user_id WHERE w.campaign_id = $1 AND w.user_id = $2 ORDER BY w.created_at DESC`;
    const workItemsR = hasLabAdminAccess(user) || hasReviewAccess(user)
      ? await pool.query(workItemsQuery, [campaignId])
      : await pool.query(workItemsQuery, [campaignId, user.id]);

    res.json({ campaign, assignments: assignmentsR.rows, workItems: workItemsR.rows });
  });

  app.post("/api/campaign-lab/campaigns", requireLabAdmin, async (req, res) => {
    const { title, description, goal, audience, approvedMessaging, requiredCta, hashtags, budgetCents, status, dueDate, coverImageUrl } = req.body;
    if (!title) return res.status(400).json({ message: "title required" });
    const r = await pool.query(
      `INSERT INTO campaign_lab_campaigns (title, description, goal, audience, approved_messaging, required_cta, hashtags, budget_cents, status, due_date, cover_image_url, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [title, description || null, goal || null, audience || null, approvedMessaging || null, requiredCta || null,
       JSON.stringify(hashtags || []), budgetCents || 0, status || "draft", dueDate || null, coverImageUrl || null, req.session!.userId]
    );
    res.json(r.rows[0]);
  });

  app.patch("/api/campaign-lab/campaigns/:id", requireLabAdmin, async (req, res) => {
    const { title, description, goal, audience, approvedMessaging, requiredCta, hashtags, budgetCents, status, dueDate, coverImageUrl } = req.body;
    const r = await pool.query(
      `UPDATE campaign_lab_campaigns SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         goal = COALESCE($3, goal),
         audience = COALESCE($4, audience),
         approved_messaging = COALESCE($5, approved_messaging),
         required_cta = COALESCE($6, required_cta),
         hashtags = COALESCE($7, hashtags),
         budget_cents = COALESCE($8, budget_cents),
         status = COALESCE($9, status),
         due_date = COALESCE($10, due_date),
         cover_image_url = COALESCE($11, cover_image_url),
         updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [title, description, goal, audience, approvedMessaging, requiredCta,
       hashtags ? JSON.stringify(hashtags) : null, budgetCents, status, dueDate, coverImageUrl, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  });

  // ── Creator Assignments ───────────────────────────────────────────────────
  app.get("/api/campaign-lab/assignments/:campaignId", requireLabAdmin, async (req, res) => {
    const r = await pool.query(
      `SELECT a.*, u.full_name, u.email, u.profile_photo, u.campaign_lab_role
       FROM campaign_lab_creator_assignments a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.campaign_id = $1 ORDER BY a.assigned_at DESC`,
      [req.params.campaignId]
    );
    res.json(r.rows);
  });

  app.post("/api/campaign-lab/assignments", requireLabAdmin, async (req, res) => {
    const { userId, campaignId, spendingLimitCents = 2500 } = req.body;
    if (!userId || !campaignId) return res.status(400).json({ message: "userId, campaignId required" });
    const r = await pool.query(
      `INSERT INTO campaign_lab_creator_assignments (user_id, campaign_id, spending_limit_cents, assigned_by_user_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, campaign_id) DO UPDATE SET active = TRUE, spending_limit_cents = $3, assigned_by_user_id = $4
       RETURNING *`,
      [userId, campaignId, spendingLimitCents, req.session!.userId]
    );
    res.json(r.rows[0]);
  });

  app.patch("/api/campaign-lab/assignments/:id", requireLabAdmin, async (req, res) => {
    const { spendingLimitCents, active } = req.body;
    const r = await pool.query(
      `UPDATE campaign_lab_creator_assignments SET
         spending_limit_cents = COALESCE($1, spending_limit_cents),
         active = COALESCE($2, active)
       WHERE id = $3 RETURNING *`,
      [spendingLimitCents, active, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  });

  // ── Work Items ────────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/work-items", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const { campaignId } = req.query;
    const isAdminOrReviewer = hasReviewAccess(user);

    let q = `SELECT w.*, u.full_name as creator_name, u.profile_photo as creator_photo
             FROM campaign_lab_work_items w
             LEFT JOIN users u ON u.id = w.user_id
             WHERE 1=1`;
    const params: any[] = [];

    if (campaignId) { params.push(campaignId); q += ` AND w.campaign_id = $${params.length}`; }
    if (!isAdminOrReviewer) { params.push(user.id); q += ` AND w.user_id = $${params.length}`; }

    q += " ORDER BY w.created_at DESC";
    const r = await pool.query(q, params);
    res.json(r.rows);
  });

  app.post("/api/campaign-lab/work-items", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const { campaignId, title, type, content, notes, parentWorkItemId } = req.body;
    if (!campaignId || !title || !type) return res.status(400).json({ message: "campaignId, title, type required" });

    // Verify campaign access
    if (!hasLabAdminAccess(user)) {
      const assignR = await pool.query(
        "SELECT id FROM campaign_lab_creator_assignments WHERE user_id = $1 AND campaign_id = $2 AND active = TRUE",
        [user.id, campaignId]
      );
      if (!assignR.rows.length) return res.status(403).json({ message: "Not assigned to this campaign" });
    }

    // Approval gate: media types require a preceding approved text item
    if (["storyboard", "image", "video"].includes(type)) {
      const parentId = parentWorkItemId;
      if (parentId) {
        const parentR = await pool.query("SELECT status, type FROM campaign_lab_work_items WHERE id = $1", [parentId]);
        const parent = parentR.rows[0];
        if (!parent || parent.status !== "approved") {
          return res.status(400).json({ message: `A ${type} requires an approved ${type === "video" ? "storyboard" : "script"} as its parent.` });
        }
      }
    }

    const r = await pool.query(
      `INSERT INTO campaign_lab_work_items (user_id, campaign_id, title, type, content, notes, parent_work_item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [user.id, campaignId, title, type, content || null, notes || null, parentWorkItemId || null]
    );
    res.json(r.rows[0]);
  });

  app.patch("/api/campaign-lab/work-items/:id", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const { title, content, notes, assetUrl, cloudinaryPublicId, aiPromptUsed } = req.body;

    // Ensure only owner or admin can edit
    const existing = await pool.query("SELECT * FROM campaign_lab_work_items WHERE id = $1", [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ message: "Not found" });
    if (!hasLabAdminAccess(user) && existing.rows[0].user_id !== user.id) return res.status(403).json({ message: "Forbidden" });

    const r = await pool.query(
      `UPDATE campaign_lab_work_items SET
         title = COALESCE($1, title),
         content = COALESCE($2, content),
         notes = COALESCE($3, notes),
         asset_url = COALESCE($4, asset_url),
         cloudinary_public_id = COALESCE($5, cloudinary_public_id),
         ai_prompt_used = COALESCE($6, ai_prompt_used),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, content, notes, assetUrl, cloudinaryPublicId, aiPromptUsed, req.params.id]
    );
    res.json(r.rows[0]);
  });

  app.post("/api/campaign-lab/work-items/:id/submit", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const existing = await pool.query("SELECT * FROM campaign_lab_work_items WHERE id = $1", [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ message: "Not found" });
    if (existing.rows[0].user_id !== user.id && !hasLabAdminAccess(user)) return res.status(403).json({ message: "Forbidden" });

    const r = await pool.query(
      "UPDATE campaign_lab_work_items SET status = 'submitted', updated_at = NOW() WHERE id = $1 AND status IN ('draft','needs_revision') RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ message: "Item must be in draft or needs_revision status" });
    res.json(r.rows[0]);
  });

  app.post("/api/campaign-lab/work-items/:id/approve", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await getCampaignLabUser(req.session.userId);
    if (!hasReviewAccess(user)) return res.status(403).json({ message: "Review access required" });

    const r = await pool.query(
      `UPDATE campaign_lab_work_items SET
         status = 'approved', reviewed_by_user_id = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [user.id, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  });

  app.post("/api/campaign-lab/work-items/:id/reject", async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await getCampaignLabUser(req.session.userId);
    if (!hasReviewAccess(user)) return res.status(403).json({ message: "Review access required" });

    const { feedback, needsRevision = true } = req.body;
    const newStatus = needsRevision ? "needs_revision" : "rejected";

    const r = await pool.query(
      `UPDATE campaign_lab_work_items SET
         status = $1, reviewer_feedback = $2, reviewed_by_user_id = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [newStatus, feedback || null, user.id, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  });

  // ── AI Generation ─────────────────────────────────────────────────────────
  app.post("/api/campaign-lab/generate", requireLabAccess, async (req, res) => {
    const user = (req as any).labUser;
    const { toolKey, campaignId, workItemId, prompt, options = {} } = req.body;
    if (!toolKey || !prompt) return res.status(400).json({ message: "toolKey, prompt required" });

    // Get tool cost
    const toolR = await pool.query("SELECT * FROM campaign_lab_tool_costs WHERE tool_key = $1 AND active = TRUE", [toolKey]);
    if (!toolR.rows.length) return res.status(400).json({ message: "Unknown or inactive tool" });
    const tool = toolR.rows[0];
    const costCents = tool.cost_cents;

    // Budget check
    const budgetCheck = await checkAndDeductBudget(user.id, campaignId || null, costCents);
    if (!budgetCheck.ok) return res.status(402).json({ message: budgetCheck.reason });

    // Get brand context
    const brandCtx = await getBrandContext();
    const fullPrompt = `${brandCtx}${prompt}`;

    let result: { content?: string; url?: string; providerJobId?: string } = {};
    let genStatus = "success";

    try {
      // Text generation tools (OpenAI)
      if (["ai_script", "ai_caption", "ai_hashtags", "ai_headline", "ai_hook", "ai_storyboard"].includes(toolKey)) {
        const openai = getOpenAI();
        const systemPrompt = toolKey === "ai_script"
          ? "You are GUBER's expert marketing copywriter. Write a compelling, on-brand script for the GUBER app."
          : toolKey === "ai_storyboard"
          ? "You are GUBER's creative director. Write a detailed visual storyboard outline with scene-by-scene descriptions."
          : toolKey === "ai_hashtags"
          ? "You are GUBER's social media manager. Generate a set of relevant, branded hashtags."
          : "You are GUBER's marketing expert. Generate high-converting marketing copy.";

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: fullPrompt },
          ],
          max_tokens: 1500,
        });
        result.content = completion.choices[0]?.message?.content || "";

      } else if (toolKey === "voiceover") {
        // Voiceover via OpenAI TTS
        const openai = getOpenAI();
        const voice = options.voice || "alloy";
        const ttsResponse = await openai.audio.speech.create({
          model: "tts-1",
          voice,
          input: prompt.slice(0, 4096),
        });
        const buffer = Buffer.from(await ttsResponse.arrayBuffer());
        const b64 = buffer.toString("base64");
        result.content = `data:audio/mpeg;base64,${b64}`;

      } else if (toolKey === "image_generation") {
        // Image via Fal.ai Flux
        const { fal } = await import("@fal-ai/client");
        fal.config({ credentials: process.env.FAL_KEY || "" });
        const falResult = await (fal.subscribe as any)("fal-ai/flux/schnell", {
          input: { prompt: fullPrompt, image_size: "landscape_16_9", num_images: 1, num_inference_steps: 4 },
        });
        const imageUrl = falResult?.data?.images?.[0]?.url;
        if (!imageUrl) throw new Error("No image returned from Fal");
        result.url = imageUrl;
        result.providerJobId = falResult?.requestId;

      } else if (toolKey === "short_video") {
        const { fal } = await import("@fal-ai/client");
        fal.config({ credentials: process.env.FAL_KEY || "" });
        const falResult = await (fal.subscribe as any)("fal-ai/wan/v2.1/t2v/turbo", {
          input: { prompt: fullPrompt, duration: "5", resolution: "480p" },
          logs: false,
        });
        result.url = falResult?.data?.video?.url;
        result.providerJobId = falResult?.requestId;

      } else if (toolKey === "long_video") {
        const { fal } = await import("@fal-ai/client");
        fal.config({ credentials: process.env.FAL_KEY || "" });
        const falResult = await (fal.subscribe as any)("fal-ai/wan/v2.1/t2v/turbo", {
          input: { prompt: fullPrompt, duration: "10", resolution: "720p" },
          logs: false,
        });
        result.url = falResult?.data?.video?.url;
        result.providerJobId = falResult?.requestId;

      } else if (toolKey === "music") {
        const { fal } = await import("@fal-ai/client");
        fal.config({ credentials: process.env.FAL_KEY || "" });
        const falResult = await (fal.subscribe as any)("fal-ai/minimax/music-01", {
          input: { prompt: fullPrompt },
          logs: false,
        });
        result.url = falResult?.data?.audio?.url;
        result.providerJobId = falResult?.requestId;
      } else {
        return res.status(400).json({ message: "Unsupported tool" });
      }

    } catch (err: any) {
      genStatus = "failed";
      await recordGenerationCost(user.id, campaignId || null, workItemId || null, toolKey, 0, "failed", prompt, null, null);
      return res.status(500).json({ message: "AI generation failed. No cost was charged.", error: err.message });
    }

    // Record cost and deduct
    await recordGenerationCost(user.id, campaignId || null, workItemId || null, toolKey, costCents, genStatus, prompt, result.url || null, result.providerJobId || null);

    res.json({ ok: true, content: result.content, url: result.url, toolKey, costCents });
  });

  // ── Budget ────────────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/budget", requireLabAdmin, async (req, res) => {
    const configR = await pool.query("SELECT * FROM campaign_lab_budget_config WHERE id = 1");
    const config = configR.rows[0] || {};

    const month = new Date().toISOString().slice(0, 7);
    const isCurrentMonth = config.budget_month_year === month;

    const creatorStats = await pool.query(
      `SELECT
         u.id, u.full_name, u.email, u.profile_photo,
         u.campaign_lab_role,
         COALESCE(SUM(g.cost_cents), 0)::int AS total_spent_cents,
         COUNT(CASE WHEN g.status = 'success' THEN 1 END)::int AS total_generations,
         COUNT(DISTINCT g.campaign_id)::int AS campaigns_active
       FROM users u
       LEFT JOIN campaign_lab_generation_log g ON g.user_id = u.id
       WHERE u.campaign_lab_role IS NOT NULL OR u.role = 'admin'
       GROUP BY u.id ORDER BY total_spent_cents DESC`
    );

    const campaignStats = await pool.query(
      `SELECT c.id, c.title, c.budget_cents, c.spent_cents, c.status,
         COUNT(DISTINCT a.user_id)::int AS creator_count,
         COUNT(w.id)::int AS work_item_count,
         COUNT(CASE WHEN w.status = 'approved' THEN 1 END)::int AS approved_count
       FROM campaign_lab_campaigns c
       LEFT JOIN campaign_lab_creator_assignments a ON a.campaign_id = c.id AND a.active = TRUE
       LEFT JOIN campaign_lab_work_items w ON w.campaign_id = c.id
       GROUP BY c.id ORDER BY c.created_at DESC`
    );

    const toolStats = await pool.query(
      `SELECT tool_key, COUNT(*)::int AS uses, COALESCE(SUM(cost_cents), 0)::int AS total_cents
       FROM campaign_lab_generation_log
       WHERE status = 'success'
       GROUP BY tool_key ORDER BY total_cents DESC`
    );

    res.json({
      config: {
        ...config,
        monthlySpentCents: isCurrentMonth ? config.monthly_spent_cents : 0,
        budgetMonthYear: month,
      },
      creators: creatorStats.rows,
      campaigns: campaignStats.rows,
      toolStats: toolStats.rows,
    });
  });

  app.patch("/api/campaign-lab/budget", requireLabAdmin, async (req, res) => {
    const { monthlyBudgetCents } = req.body;
    const r = await pool.query(
      "UPDATE campaign_lab_budget_config SET monthly_budget_cents = $1, updated_at = NOW(), updated_by_user_id = $2 WHERE id = 1 RETURNING *",
      [monthlyBudgetCents, req.session!.userId]
    );
    res.json(r.rows[0]);
  });

  app.post("/api/campaign-lab/budget/kill-switch", requireLabAdmin, async (req, res) => {
    const { active } = req.body;
    const r = await pool.query(
      "UPDATE campaign_lab_budget_config SET ai_kill_switch = $1, updated_at = NOW(), updated_by_user_id = $2 WHERE id = 1 RETURNING ai_kill_switch",
      [!!active, req.session!.userId]
    );
    res.json({ aiKillSwitch: r.rows[0]?.ai_kill_switch });
  });

  // ── Creator Management ────────────────────────────────────────────────────
  app.get("/api/campaign-lab/creators", requireLabAdmin, async (req, res) => {
    const r = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.profile_photo, u.campaign_lab_role,
         COUNT(DISTINCT a.campaign_id)::int AS campaigns_assigned,
         COALESCE(SUM(a.spent_cents), 0)::int AS total_spent_cents,
         COUNT(DISTINCT w.id)::int AS work_items_created,
         COUNT(CASE WHEN w.status = 'approved' THEN 1 END)::int AS work_items_approved
       FROM users u
       LEFT JOIN campaign_lab_creator_assignments a ON a.user_id = u.id AND a.active = TRUE
       LEFT JOIN campaign_lab_work_items w ON w.user_id = u.id
       WHERE u.campaign_lab_role IS NOT NULL
       GROUP BY u.id ORDER BY u.full_name ASC`
    );
    res.json(r.rows);
  });

  // Search users to grant access
  app.get("/api/campaign-lab/users/search", requireLabAdmin, async (req, res) => {
    const { q } = req.query;
    if (!q || String(q).length < 2) return res.json([]);
    const r = await pool.query(
      `SELECT id, full_name, email, profile_photo, campaign_lab_role FROM users
       WHERE (full_name ILIKE $1 OR email ILIKE $1) AND role != 'admin'
       LIMIT 20`,
      [`%${q}%`]
    );
    res.json(r.rows);
  });

  app.post("/api/campaign-lab/creators", requireLabAdmin, async (req, res) => {
    const { userId, campaignLabRole } = req.body;
    if (!userId || !campaignLabRole) return res.status(400).json({ message: "userId, campaignLabRole required" });
    if (!["creator", "reviewer", "marketing_manager"].includes(campaignLabRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    await pool.query("UPDATE users SET campaign_lab_role = $1 WHERE id = $2", [campaignLabRole, userId]);
    const r = await pool.query("SELECT id, full_name, email, campaign_lab_role FROM users WHERE id = $1", [userId]);
    res.json(r.rows[0]);
  });

  app.patch("/api/campaign-lab/creators/:userId", requireLabAdmin, async (req, res) => {
    const { campaignLabRole } = req.body;
    if (campaignLabRole && !["creator", "reviewer", "marketing_manager"].includes(campaignLabRole)) {
      return res.status(400).json({ message: "Invalid role" });
    }
    await pool.query("UPDATE users SET campaign_lab_role = $1 WHERE id = $2", [campaignLabRole || null, req.params.userId]);
    res.json({ ok: true });
  });

  app.delete("/api/campaign-lab/creators/:userId", requireLabAdmin, async (req, res) => {
    await pool.query("UPDATE users SET campaign_lab_role = NULL WHERE id = $1", [req.params.userId]);
    await pool.query("UPDATE campaign_lab_creator_assignments SET active = FALSE WHERE user_id = $1", [req.params.userId]);
    res.json({ ok: true });
  });

  // ── Tool Costs ────────────────────────────────────────────────────────────
  app.get("/api/campaign-lab/tool-costs", requireLabAccess, async (req, res) => {
    const r = await pool.query("SELECT * FROM campaign_lab_tool_costs ORDER BY id ASC");
    res.json(r.rows);
  });

  app.patch("/api/campaign-lab/tool-costs/:id", requireLabAdmin, async (req, res) => {
    const { costCents, active } = req.body;
    const r = await pool.query(
      "UPDATE campaign_lab_tool_costs SET cost_cents = COALESCE($1, cost_cents), active = COALESCE($2, active), updated_at = NOW() WHERE id = $3 RETURNING *",
      [costCents, active, req.params.id]
    );
    res.json(r.rows[0]);
  });
}
