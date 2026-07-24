import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import crypto from "crypto";

interface StudioAuth {
  studioId: string;
  email: string;
  role: string;
  fullName?: string;
}

function requireStudio(req: Request, res: Response, next: NextFunction) {
  const studioId = req.params.studioId;
  const auth = (req.session as any).studioAuth as StudioAuth | undefined;
  if (!auth || auth.studioId !== studioId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "This studio is private. Please sign in with an authorized account.",
    });
  }
  (req as any).studioAuth = auth;
  next();
}

async function checkGuberAdmin(req: Request, res: Response): Promise<boolean> {
  const session = req.session as any;
  if (!session?.userId) { res.status(401).json({ error: "unauthorized" }); return false; }
  try {
    const r = await pool.query(`SELECT role FROM users WHERE id = $1`, [session.userId]);
    if (r.rows[0]?.role !== "admin") { res.status(403).json({ error: "forbidden" }); return false; }
    return true;
  } catch { res.status(500).json({ error: "server error" }); return false; }
}

async function auditLog(
  studioId: string,
  userEmail: string | null,
  action: string,
  details: Record<string, any>,
  ip: string,
) {
  try {
    await pool.query(
      `INSERT INTO studio_audit_log (studio_id, user_email, action, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [studioId, userEmail, action, JSON.stringify(details), ip],
    );
  } catch { /* non-fatal */ }
}

function getIp(req: Request): string {
  return ((req.headers["x-forwarded-for"] as string) || "").split(",")[0].trim() ||
    req.socket.remoteAddress || "unknown";
}

// Simple in-memory OTP rate limiter: max 3 requests per 10 min per ip+email+studio
const otpRateMap = new Map<string, { count: number; reset: number }>();

export function setupBusinessStudioRoutes(app: Express) {

  // ── Public: studio branding config ─────────────────────────────────────────
  app.get("/api/bs/:studioId/config", async (req, res) => {
    const { studioId } = req.params;
    try {
      const r = await pool.query(
        `SELECT studio_id, name, tagline, logo_url, primary_color, accent_color, welcome_message
         FROM business_studios WHERE studio_id = $1 AND is_active = true`,
        [studioId],
      );
      if (!r.rows[0]) return res.status(404).json({ error: "studio not found" });
      return res.json(r.rows[0]);
    } catch (err: any) {
      console.error("[bs/config]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Auth: check session ─────────────────────────────────────────────────────
  app.get("/api/bs/:studioId/auth/session", (req, res) => {
    const { studioId } = req.params;
    const auth = (req.session as any).studioAuth as StudioAuth | undefined;
    if (!auth || auth.studioId !== studioId) {
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, email: auth.email, role: auth.role, fullName: auth.fullName });
  });

  // ── Auth: request OTP code ──────────────────────────────────────────────────
  app.post("/api/bs/:studioId/auth/request-code", async (req, res) => {
    const { studioId } = req.params;
    const { email } = req.body;
    const ip = getIp(req);

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email required" });
    }
    const normalizedEmail = email.trim().toLowerCase();

    // Rate limit
    const rlKey = `${ip}:${normalizedEmail}:${studioId}`;
    const now = Date.now();
    const rl = otpRateMap.get(rlKey);
    if (rl && now < rl.reset && rl.count >= 3) {
      return res.status(429).json({ error: "too_many_requests", message: "Too many requests. Please wait before trying again." });
    }
    if (rl && now < rl.reset) { rl.count++; }
    else { otpRateMap.set(rlKey, { count: 1, reset: now + 10 * 60 * 1000 }); }

    try {
      // Check studio exists and is active
      const studioRes = await pool.query(
        `SELECT name FROM business_studios WHERE studio_id = $1 AND is_active = true`,
        [studioId],
      );
      if (!studioRes.rows[0]) return res.status(404).json({ error: "studio not found" });

      // Check if email is approved (don't reveal if not)
      const approvedRes = await pool.query(
        `SELECT role FROM studio_approved_emails WHERE studio_id = $1 AND email = $2 AND is_active = true`,
        [studioId, normalizedEmail],
      );

      if (approvedRes.rows[0]) {
        const code = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        // Invalidate old codes
        await pool.query(
          `UPDATE studio_otp_codes SET used = true WHERE studio_id = $1 AND email = $2 AND used = false`,
          [studioId, normalizedEmail],
        );

        // Store new code
        await pool.query(
          `INSERT INTO studio_otp_codes (studio_id, email, code, expires_at) VALUES ($1, $2, $3, $4)`,
          [studioId, normalizedEmail, code, expiresAt],
        );

        // Send via Resend
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
          const studioName = studioRes.rows[0].name;
          await resend.emails.send({
            from: `${studioName} Content Studio <noreply@${fromDomain}>`,
            to: normalizedEmail,
            subject: `Your ${studioName} Studio access code — ${code}`,
            html: `
              <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; padding: 40px 24px; background: #0f172a; color: #f1f5f9; border-radius: 12px;">
                <div style="margin-bottom: 32px;">
                  <h1 style="font-size: 22px; color: #c9a84c; margin: 0 0 4px 0;">${studioName}</h1>
                  <p style="color: #64748b; margin: 0; font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Content Studio · Powered by GUBER Global</p>
                </div>
                <p style="font-size: 15px; margin-bottom: 24px; color: #cbd5e1;">Your one-time access code:</p>
                <div style="background: #1e293b; border: 1px solid #c9a84c33; border-radius: 10px; padding: 28px; text-align: center; margin-bottom: 28px;">
                  <span style="font-size: 44px; font-weight: 700; letter-spacing: 14px; color: #c9a84c; font-family: monospace;">${code}</span>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.6;">This code expires in <strong style="color: #94a3b8;">15 minutes</strong> and can only be used once. Do not share this code with anyone.</p>
                <p style="color: #475569; font-size: 11px; margin-top: 28px; border-top: 1px solid #1e293b; padding-top: 20px;">If you did not request this code, you can safely ignore this message. The code will expire automatically.</p>
              </div>
            `,
          });
        } catch (emailErr: any) {
          // Email failed — log code for dev debugging
          console.error("[bs/otp] email error:", emailErr.message);
          console.log(`[bs/otp-dev] ${studioId} / ${normalizedEmail}: ${code}`);
        }
      } else {
        // Consistent timing to prevent email enumeration
        await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
      }

      // Always return success — never reveal if email is approved
      return res.json({ ok: true, message: "If this email is approved for this studio, a code has been sent." });
    } catch (err: any) {
      console.error("[bs/auth/request-code]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Auth: verify OTP code ───────────────────────────────────────────────────
  app.post("/api/bs/:studioId/auth/verify-code", async (req, res) => {
    const { studioId } = req.params;
    const { email, code } = req.body;
    const ip = getIp(req);

    if (!email || !code) return res.status(400).json({ error: "email and code required" });
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = String(code).trim();

    try {
      const codeRes = await pool.query(
        `SELECT id FROM studio_otp_codes
         WHERE studio_id = $1 AND email = $2 AND code = $3 AND used = false AND expires_at > NOW()`,
        [studioId, normalizedEmail, normalizedCode],
      );

      if (!codeRes.rows[0]) {
        await auditLog(studioId, normalizedEmail, "failed_login", { reason: "invalid_code", ip }, ip);
        return res.status(401).json({ error: "invalid_code", message: "Invalid or expired code. Please request a new one." });
      }

      // Mark code as used
      await pool.query(`UPDATE studio_otp_codes SET used = true WHERE id = $1`, [codeRes.rows[0].id]);

      // Get role and name
      const approvedRes = await pool.query(
        `SELECT role, full_name FROM studio_approved_emails WHERE studio_id = $1 AND email = $2 AND is_active = true`,
        [studioId, normalizedEmail],
      );
      if (!approvedRes.rows[0]) {
        return res.status(401).json({ error: "unauthorized", message: "This studio is private. Please sign in with an authorized account." });
      }

      // Create studio session
      (req.session as any).studioAuth = {
        studioId,
        email: normalizedEmail,
        role: approvedRes.rows[0].role,
        fullName: approvedRes.rows[0].full_name,
      };

      await auditLog(studioId, normalizedEmail, "login", { ip }, ip);
      return res.json({ ok: true, role: approvedRes.rows[0].role, fullName: approvedRes.rows[0].full_name });
    } catch (err: any) {
      console.error("[bs/auth/verify-code]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Auth: logout ────────────────────────────────────────────────────────────
  app.post("/api/bs/:studioId/auth/logout", (req, res) => {
    const auth = (req.session as any).studioAuth as StudioAuth | undefined;
    if (auth) {
      const studioId = req.params.studioId;
      auditLog(studioId, auth.email, "logout", {}, getIp(req));
    }
    (req.session as any).studioAuth = undefined;
    return res.json({ ok: true });
  });

  // ── Content: list ───────────────────────────────────────────────────────────
  app.get("/api/bs/:studioId/content", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const { type, approvalStatus } = req.query;

    try {
      let query = `SELECT id, content_type, status, approval_status, title, caption,
                          thumbnail_url, prompt, platform_format, created_at, updated_at,
                          owner_email, created_by, approved_by, approved_at, notes
                   FROM studio_content
                   WHERE studio_id = $1 AND status != 'archived'`;
      const params: any[] = [studioId];

      if (type) { params.push(type); query += ` AND content_type = $${params.length}`; }
      if (approvalStatus) { params.push(approvalStatus); query += ` AND approval_status = $${params.length}`; }

      query += ` ORDER BY created_at DESC LIMIT 200`;

      const result = await pool.query(query, params);
      return res.json(result.rows);
    } catch (err: any) {
      console.error("[bs/content]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Content: upload photo ───────────────────────────────────────────────────
  app.post("/api/bs/:studioId/upload", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);
    const { imageData, title, caption, platformFormat } = req.body;

    if (!imageData) return res.status(400).json({ error: "imageData required" });
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({ error: "storage not configured" });
    }

    // Law firm safeguard — warn against confidential material
    try {
      const cloudinary = (await import("./cloudinary.js")).default;
      const uploadResult = await cloudinary.uploader.upload(imageData, {
        folder: `business-studios/${studioId}`,
        type: "private",
        resource_type: "image",
        tags: [`studio:${studioId}`, "type:upload"],
      });

      const thumbnailUrl = cloudinary.url(uploadResult.public_id, {
        sign_url: true,
        type: "private",
        width: 600,
        crop: "limit",
        quality: "auto",
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
      });

      const result = await pool.query(
        `INSERT INTO studio_content
           (studio_id, owner_email, created_by, content_type, status, approval_status,
            source_file, thumbnail_url, title, caption, platform_format)
         VALUES ($1,$2,$3,'photo_upload','draft','pending',$4,$5,$6,$7,$8)
         RETURNING id`,
        [studioId, auth.email, auth.email, uploadResult.public_id, thumbnailUrl,
         title || null, caption || null, platformFormat || null],
      );

      await auditLog(studioId, auth.email, "upload", { contentId: result.rows[0].id, format: platformFormat }, ip);
      return res.json({ ok: true, id: result.rows[0].id, thumbnailUrl });
    } catch (err: any) {
      console.error("[bs/upload]", err.message);
      return res.status(500).json({ error: "upload failed", message: err.message });
    }
  });

  // ── Content: generate AI image ──────────────────────────────────────────────
  app.post("/api/bs/:studioId/generate", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);
    const { prompt, title, platformFormat } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return res.status(400).json({ error: "prompt too short" });
    }

    // AI content safeguards for law firm
    const BLOCKED = [
      /\bfake (case|testimonial|client|settlement|verdict|outcome)\b/i,
      /\bguaranteed? (result|outcome|win|settlement|verdict)\b/i,
      /we (won|recovered|secured|achieved) \$[\d,]+/i,
      /\$[\d,]+ (settlement|verdict|award)/i,
      /confidential (client|case|evidence|material)/i,
    ];
    if (BLOCKED.some(p => p.test(prompt))) {
      return res.status(400).json({
        error: "content_policy",
        message:
          "This prompt may violate legal marketing ethics. Do not generate fake case results, fake testimonials, guaranteed outcomes, or content referencing confidential client information.",
      });
    }

    try {
      // Monthly limit check
      const usageRes = await pool.query(
        `SELECT COUNT(*) AS count FROM studio_content
         WHERE studio_id = $1 AND content_type = 'ai_image'
           AND created_at > date_trunc('month', NOW())`,
        [studioId],
      );
      const limitRes = await pool.query(
        `SELECT monthly_image_limit FROM business_studios WHERE studio_id = $1`,
        [studioId],
      );
      const monthlyLimit = limitRes.rows[0]?.monthly_image_limit ?? 100;
      if (parseInt(usageRes.rows[0]?.count ?? "0") >= monthlyLimit) {
        return res.status(429).json({ error: "monthly_limit", message: "Monthly AI image limit reached. Contact your GUBER admin to increase it." });
      }

      const { submitToFal } = await import("./fal.js");

      const enhancedPrompt = `Professional legal marketing image for a law firm. ${prompt.trim()}. Clean, professional, high quality, suitable for legal industry marketing. No text overlays in the image.`;

      // Map platform format to fal image size
      const sizeMap: Record<string, string> = {
        "Instagram (1:1)": "square_hd",
        "Instagram Story (9:16)": "portrait_16_9",
        "Facebook Cover (16:9)": "landscape_16_9",
        "LinkedIn (1.91:1)": "landscape_4_3",
        "Twitter/X (16:9)": "landscape_16_9",
        "YouTube Thumbnail (16:9)": "landscape_16_9",
      };
      const imageSize = sizeMap[platformFormat ?? ""] ?? "square_hd";

      const falResult = await submitToFal<{ images: { url: string }[] }>(
        "fal-ai/flux/schnell",
        { prompt: enhancedPrompt, image_size: imageSize, num_images: 1, num_inference_steps: 4 },
      );

      const imageUrl = falResult.output?.images?.[0]?.url;
      if (!imageUrl) throw new Error("No image URL returned");

      // Archive to Cloudinary private storage
      const cloudinary = (await import("./cloudinary.js")).default;
      const uploadResult = await cloudinary.uploader.upload(imageUrl, {
        folder: `business-studios/${studioId}`,
        type: "private",
        resource_type: "image",
        tags: [`studio:${studioId}`, "type:ai_generated"],
      });

      const thumbnailUrl = cloudinary.url(uploadResult.public_id, {
        sign_url: true,
        type: "private",
        width: 600,
        crop: "limit",
        quality: "auto",
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
      });

      const result = await pool.query(
        `INSERT INTO studio_content
           (studio_id, owner_email, created_by, content_type, status, approval_status,
            generated_file, thumbnail_url, prompt, title, platform_format)
         VALUES ($1,$2,$3,'ai_image','draft','approved',$4,$5,$6,$7,$8)
         RETURNING id`,
        [studioId, auth.email, auth.email, uploadResult.public_id, thumbnailUrl,
         prompt.trim(), title || null, platformFormat || null],
      );

      await auditLog(studioId, auth.email, "generation_request", { contentId: result.rows[0].id, prompt: prompt.trim() }, ip);
      return res.json({ ok: true, id: result.rows[0].id, thumbnailUrl, previewUrl: imageUrl });
    } catch (err: any) {
      console.error("[bs/generate]", err.message);
      return res.status(500).json({ error: "generation_failed", message: "Image generation failed. Please try again." });
    }
  });

  // ── AI Video Generation ────────────────────────────────────────────────────
  app.post("/api/bs/:studioId/generate-video", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const { prompt, title, aspectRatio = "16:9" } = req.body;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);

    if (!prompt?.trim()) return res.status(400).json({ error: "prompt required" });

    const BLOCKED = [/fake.*case/i, /guaranteed.*outcome/i, /fake.*testimonial/i, /we won.*case/i, /confidential/i];
    if (BLOCKED.some(r => r.test(prompt))) {
      return res.status(400).json({ error: "content_policy", message: "Prompt violates legal marketing ethics guidelines." });
    }

    try {
      const { submitToFal } = await import("./fal.js");
      const enhancedPrompt = `Professional law firm marketing video. ${prompt.trim()}. Cinematic, polished, premium production quality. Suitable for legal industry marketing.`;

      const falResult = await submitToFal<{ video: { url: string } }>(
        "fal-ai/kling-video/v1.6/standard/text-to-video",
        { prompt: enhancedPrompt, duration: "5", aspect_ratio: aspectRatio },
      );

      const videoUrl = falResult.output?.video?.url;
      if (!videoUrl) throw new Error("No video URL returned");

      const cloudinary = (await import("./cloudinary.js")).default;
      const uploadResult = await cloudinary.uploader.upload(videoUrl, {
        folder: `business-studios/${studioId}`,
        type: "private",
        resource_type: "video",
        tags: [`studio:${studioId}`, "type:ai_video"],
      });

      const thumbnailUrl = cloudinary.url(uploadResult.public_id, {
        sign_url: true, type: "private", width: 600, crop: "limit", secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
        resource_type: "video", format: "jpg", start_offset: "0",
      });

      const result = await pool.query(
        `INSERT INTO studio_content
           (studio_id, owner_email, created_by, content_type, status, approval_status,
            generated_file, thumbnail_url, prompt, title, platform_format)
         VALUES ($1,$2,$3,'ai_video','draft','approved',$4,$5,$6,$7,$8) RETURNING id`,
        [studioId, auth.email, auth.email, uploadResult.public_id, thumbnailUrl,
         prompt.trim(), title || null, aspectRatio],
      );

      await auditLog(studioId, auth.email, "video_generation", { contentId: result.rows[0].id, prompt: prompt.trim() }, ip);
      return res.json({ ok: true, id: result.rows[0].id, thumbnailUrl, previewUrl: videoUrl });
    } catch (err: any) {
      console.error("[bs/generate-video]", err.message);
      return res.status(500).json({ error: "generation_failed", message: "Video generation failed. Please try again." });
    }
  });

  // In-memory job store for async video generation (avoids proxy timeout on long jobs)
  const videoJobStore = new Map<string, {
    statusUrl: string; responseUrl: string; contentType: string;
    studioId: string; prompt: string; createdAt: number;
  }>();

  // ── Unified Create (generate without auto-saving) ──────────────────────────
  app.post("/api/bs/:studioId/create", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const { mode, imageData, prompt, title, aspectRatio = "16:9" } = req.body;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);

    if (!prompt?.trim()) return res.status(400).json({ error: "prompt required" });
    if (!["image", "video"].includes(mode)) return res.status(400).json({ error: "invalid mode" });

    const BLOCKED = [/fake.*case/i, /guaranteed.*outcome/i, /fake.*testimonial/i, /confidential.*client/i];
    if (BLOCKED.some(r => r.test(prompt))) {
      return res.status(400).json({ error: "content_policy", message: "Prompt violates content guidelines." });
    }

    try {
      const { submitToFal, submitFalJob } = await import("./fal.js");

      // Upload source image to Cloudinary to get a public-accessible signed URL for fal.ai
      let sourceImageUrl: string | undefined;
      if (imageData) {
        const cloudinary = (await import("./cloudinary.js")).default;
        const up = await cloudinary.uploader.upload(imageData, {
          folder: `business-studios/${studioId}/sources`,
          type: "upload",   // public upload so fal.ai can fetch it
          resource_type: "image",
          tags: [`studio:${studioId}`, "type:source"],
        });
        sourceImageUrl = up.secure_url;  // plain CDN URL, no signature needed for fal.ai
      }

      // Prompt strategy:
      //   • Photo mode: use the user's prompt exactly — they describe the transformation they want.
      //   • Text mode: append a quality cue so the model understands the desired output style.
      const rawPrompt = prompt.trim();
      const textPrompt = `${rawPrompt}. Cinematic lighting, high detail, sharp focus, premium quality.`;

      if (mode === "image") {
        const contentType = "ai_image";
        let imageUrl: string | undefined;

        if (sourceImageUrl) {
          // Image-to-image: high strength so the model actually executes the transformation
          const r = await submitToFal<{ images?: Array<{ url: string }> }>(
            "fal-ai/flux/dev/image-to-image",
            {
              image_url: sourceImageUrl,
              prompt: rawPrompt,             // user's words verbatim
              num_inference_steps: 35,
              strength: 0.97,                // near-full transformation
              guidance_scale: 3.5,           // FLUX-appropriate guidance
              num_images: 1,
              enable_safety_checker: true,
            },
          );
          imageUrl = r.output?.images?.[0]?.url;
        } else {
          // Text-to-image
          const r = await submitToFal<{ images?: Array<{ url: string }> }>(
            "fal-ai/flux/schnell",
            { prompt: textPrompt, image_size: "square_hd", num_inference_steps: 4, num_images: 1, enable_safety_checker: true },
          );
          imageUrl = r.output?.images?.[0]?.url;
        }
        if (!imageUrl) throw new Error("No image URL returned from fal.ai");

        await auditLog(studioId, auth.email, "create_preview", { mode, hasPhoto: !!sourceImageUrl, prompt: rawPrompt }, ip);
        return res.json({ ok: true, previewUrl: imageUrl, contentType });

      } else {
        // Video — submit to fal.ai queue and return the jobId immediately so the
        // client can poll. This avoids HTTP proxy timeouts (kling takes 2–4 min).
        const contentType = "ai_video";
        const videoPrompt = sourceImageUrl ? rawPrompt : textPrompt;
        const endpoint = sourceImageUrl
          ? "fal-ai/kling-video/v1.6/standard/image-to-video"
          : "fal-ai/kling-video/v1.6/standard/text-to-video";
        const payload: Record<string, any> = { prompt: videoPrompt, duration: "5", aspect_ratio: aspectRatio };
        if (sourceImageUrl) payload.image_url = sourceImageUrl;

        const job = await submitFalJob(endpoint, payload);
        const jobId = `${studioId}-${job.requestId}`;
        videoJobStore.set(jobId, {
          statusUrl: job.statusUrl, responseUrl: job.responseUrl,
          contentType, studioId, prompt: rawPrompt, createdAt: Date.now(),
        });
        // Clean up old entries (> 30 min)
        for (const [k, v] of videoJobStore.entries()) {
          if (Date.now() - v.createdAt > 30 * 60 * 1000) videoJobStore.delete(k);
        }

        await auditLog(studioId, auth.email, "create_video_start", { jobId, hasPhoto: !!sourceImageUrl, prompt: rawPrompt }, ip);
        return res.json({ ok: true, jobId, contentType, polling: true });
      }
    } catch (err: any) {
      console.error("[bs/create]", err.message);
      return res.status(500).json({ error: "generation_failed", message: err.message || "Generation failed. Please try again." });
    }
  });

  // ── Video job polling endpoint ──────────────────────────────────────────────
  app.get("/api/bs/:studioId/job/:jobId", requireStudio, async (req, res) => {
    const { studioId, jobId } = req.params;
    const entry = videoJobStore.get(jobId);
    if (!entry || entry.studioId !== studioId) {
      return res.status(404).json({ error: "job not found" });
    }
    try {
      const { checkFalJob } = await import("./fal.js");
      const result = await checkFalJob<{ video?: { url: string } }>(entry.statusUrl, entry.responseUrl);
      if (result.status === "failed") {
        videoJobStore.delete(jobId);
        return res.json({ status: "failed", error: "Video generation failed. Please try again." });
      }
      if (result.status === "pending") {
        return res.json({ status: "pending" });
      }
      // Completed
      const videoUrl = result.output?.video?.url;
      if (!videoUrl) {
        videoJobStore.delete(jobId);
        return res.json({ status: "failed", error: "No video URL in response." });
      }
      videoJobStore.delete(jobId);
      return res.json({ status: "completed", previewUrl: videoUrl, contentType: entry.contentType });
    } catch (err: any) {
      console.error("[bs/job-poll]", err.message);
      return res.json({ status: "pending" }); // treat transient errors as still pending
    }
  });

  // ── Save to Library (explicit user action after preview) ────────────────────
  app.post("/api/bs/:studioId/save-to-library", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const { previewUrl, contentType, title, prompt } = req.body;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);

    if (!previewUrl || !contentType) return res.status(400).json({ error: "previewUrl and contentType required" });

    try {
      const cloudinary = (await import("./cloudinary.js")).default;
      const isVideo = contentType === "ai_video";

      const uploadResult = await cloudinary.uploader.upload(previewUrl, {
        folder: `business-studios/${studioId}`,
        type: "private",
        resource_type: isVideo ? "video" : "image",
        tags: [`studio:${studioId}`, `type:${contentType}`],
      });

      const thumbOpts: any = {
        sign_url: true, type: "private", width: 600, crop: "limit",
        quality: "auto", secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
      };
      if (isVideo) { thumbOpts.resource_type = "video"; thumbOpts.format = "jpg"; thumbOpts.start_offset = "0"; }

      const thumbnailUrl = cloudinary.url(uploadResult.public_id, thumbOpts);

      const result = await pool.query(
        `INSERT INTO studio_content
           (studio_id, owner_email, created_by, content_type, status, approval_status,
            generated_file, thumbnail_url, prompt, title)
         VALUES ($1,$2,$3,$4,'draft','approved',$5,$6,$7,$8)
         RETURNING id`,
        [studioId, auth.email, auth.email, contentType, uploadResult.public_id,
         thumbnailUrl, prompt || null, title || null],
      );

      await auditLog(studioId, auth.email, "save_to_library", { contentId: result.rows[0].id, contentType }, ip);
      return res.json({ ok: true, id: result.rows[0].id, thumbnailUrl });
    } catch (err: any) {
      console.error("[bs/save-to-library]", err.message);
      return res.status(500).json({ error: "save_failed", message: "Failed to save to library." });
    }
  });

  // ── Studio Team Management (studio admin only) ──────────────────────────────
  app.get("/api/bs/:studioId/team", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    if (auth.role !== "admin") return res.status(403).json({ error: "admin_only" });
    try {
      const r = await pool.query(
        `SELECT email, role, full_name, is_active, created_at FROM studio_approved_emails WHERE studio_id = $1 ORDER BY created_at DESC`,
        [studioId],
      );
      return res.json(r.rows);
    } catch { return res.status(500).json({ error: "server error" }); }
  });

  app.post("/api/bs/:studioId/team", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    if (auth.role !== "admin") return res.status(403).json({ error: "admin_only" });
    const { email, role = "client", fullName } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    try {
      await pool.query(
        `INSERT INTO studio_approved_emails (studio_id, email, role, full_name, added_by)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (studio_id, email) DO UPDATE SET role=$3, full_name=$4, is_active=true, added_by=$5`,
        [studioId, email.trim().toLowerCase(), role, fullName || null, auth.email],
      );
      await auditLog(studioId, auth.email, "team_add", { email, role }, getIp(req));
      return res.json({ ok: true });
    } catch { return res.status(500).json({ error: "server error" }); }
  });

  app.delete("/api/bs/:studioId/team/:memberEmail", requireStudio, async (req, res) => {
    const { studioId, memberEmail } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    if (auth.role !== "admin") return res.status(403).json({ error: "admin_only" });
    try {
      await pool.query(
        `UPDATE studio_approved_emails SET is_active = false WHERE studio_id = $1 AND email = $2`,
        [studioId, memberEmail],
      );
      await auditLog(studioId, auth.email, "team_remove", { email: memberEmail }, getIp(req));
      return res.json({ ok: true });
    } catch { return res.status(500).json({ error: "server error" }); }
  });

  // ── Content: get signed download URL ───────────────────────────────────────
  app.get("/api/bs/:studioId/content/:id/url", requireStudio, async (req, res) => {
    const { studioId, id } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);

    try {
      const result = await pool.query(
        `SELECT source_file, generated_file, content_type FROM studio_content WHERE id = $1 AND studio_id = $2`,
        [id, studioId],
      );
      if (!result.rows[0]) return res.status(404).json({ error: "not found" });

      const row = result.rows[0];
      const publicId = row.generated_file || row.source_file;
      if (!publicId) return res.status(404).json({ error: "no file attached" });

      const cloudinary = (await import("./cloudinary.js")).default;
      const signedUrl = cloudinary.url(publicId, {
        sign_url: true,
        type: "private",
        secure: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      await auditLog(studioId, auth.email, "download", { contentId: id }, ip);
      return res.json({ url: signedUrl });
    } catch (err: any) {
      console.error("[bs/content/url]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Content: refresh thumbnail URLs (re-sign) ───────────────────────────────
  app.post("/api/bs/:studioId/content/refresh-urls", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) return res.json({ urls: {} });

    try {
      const result = await pool.query(
        `SELECT id, source_file, generated_file FROM studio_content WHERE id = ANY($1) AND studio_id = $2`,
        [ids, studioId],
      );
      const cloudinary = (await import("./cloudinary.js")).default;
      const urls: Record<number, string> = {};
      for (const row of result.rows) {
        const publicId = row.generated_file || row.source_file;
        if (!publicId) continue;
        urls[row.id] = cloudinary.url(publicId, {
          sign_url: true,
          type: "private",
          width: 600,
          crop: "limit",
          quality: "auto",
          secure: true,
          expires_at: Math.floor(Date.now() / 1000) + 86400 * 7,
        });
      }
      return res.json({ urls });
    } catch (err: any) {
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Content: update metadata ────────────────────────────────────────────────
  app.patch("/api/bs/:studioId/content/:id", requireStudio, async (req, res) => {
    const { studioId, id } = req.params;
    const { caption, notes, title, platformFormat } = req.body;

    try {
      await pool.query(
        `UPDATE studio_content
         SET caption = COALESCE($1, caption),
             notes = COALESCE($2, notes),
             title = COALESCE($3, title),
             platform_format = COALESCE($4, platform_format),
             updated_at = NOW()
         WHERE id = $5 AND studio_id = $6`,
        [caption ?? null, notes ?? null, title ?? null, platformFormat ?? null, id, studioId],
      );
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[bs/content/patch]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Content: approve ────────────────────────────────────────────────────────
  app.post("/api/bs/:studioId/content/:id/approve", requireStudio, async (req, res) => {
    const { studioId, id } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);

    if (auth.role !== "staff" && auth.role !== "admin") {
      return res.status(403).json({ error: "forbidden", message: "Only studio staff or admin may approve content." });
    }

    try {
      await pool.query(
        `UPDATE studio_content
         SET approval_status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND studio_id = $3`,
        [auth.email, id, studioId],
      );
      await auditLog(studioId, auth.email, "content_approval", { contentId: id }, ip);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[bs/content/approve]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Content: archive / delete ───────────────────────────────────────────────
  app.delete("/api/bs/:studioId/content/:id", requireStudio, async (req, res) => {
    const { studioId, id } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;
    const ip = getIp(req);

    try {
      const result = await pool.query(
        `SELECT source_file, generated_file FROM studio_content WHERE id = $1 AND studio_id = $2`,
        [id, studioId],
      );
      if (!result.rows[0]) return res.status(404).json({ error: "not found" });

      // Soft-archive in DB (retain records)
      await pool.query(
        `UPDATE studio_content SET status = 'archived', archived_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND studio_id = $2`,
        [id, studioId],
      );

      await auditLog(studioId, auth.email, "archive", { contentId: id }, ip);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[bs/content/delete]", err.message);
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── Studio audit log (staff/admin) ─────────────────────────────────────────
  app.get("/api/bs/:studioId/audit", requireStudio, async (req, res) => {
    const { studioId } = req.params;
    const auth = (req as any).studioAuth as StudioAuth;

    if (auth.role !== "staff" && auth.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }

    try {
      const result = await pool.query(
        `SELECT user_email, action, details, ip_address, created_at
         FROM studio_audit_log WHERE studio_id = $1
         ORDER BY created_at DESC LIMIT 200`,
        [studioId],
      );
      return res.json(result.rows);
    } catch (err: any) {
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── GUBER Admin: list studios ───────────────────────────────────────────────
  app.get("/api/admin/bs/studios", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    try {
      const r = await pool.query(
        `SELECT bs.*,
                (SELECT COUNT(*) FROM studio_approved_emails sae WHERE sae.studio_id = bs.studio_id AND sae.is_active = true) AS user_count,
                (SELECT COUNT(*) FROM studio_content sc WHERE sc.studio_id = bs.studio_id) AS content_count
         FROM business_studios bs ORDER BY bs.created_at DESC`,
      );
      return res.json(r.rows);
    } catch (err: any) { return res.status(500).json({ error: "server error" }); }
  });

  // ── GUBER Admin: create studio ─────────────────────────────────────────────
  app.post("/api/admin/bs/studios", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId, name, tagline, primaryColor, accentColor, welcomeMessage, contactEmail, monthlyImageLimit } = req.body;
    if (!studioId || !name) return res.status(400).json({ error: "studioId and name required" });
    try {
      await pool.query(
        `INSERT INTO business_studios
           (studio_id, name, tagline, primary_color, accent_color, welcome_message, contact_email, monthly_image_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [studioId.toLowerCase().replace(/[^a-z0-9-]/g, ""), name, tagline || null,
         primaryColor || "#0f172a", accentColor || "#c9a84c",
         welcomeMessage || null, contactEmail || null, monthlyImageLimit || 100],
      );
      return res.json({ ok: true });
    } catch (err: any) {
      if (err.code === "23505") return res.status(409).json({ error: "studio_id already exists" });
      return res.status(500).json({ error: "server error" });
    }
  });

  // ── GUBER Admin: update studio ─────────────────────────────────────────────
  app.patch("/api/admin/bs/studios/:studioId", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId } = req.params;
    const { name, tagline, logoUrl, primaryColor, accentColor, welcomeMessage, contactEmail, monthlyImageLimit, isActive } = req.body;
    try {
      await pool.query(
        `UPDATE business_studios
         SET name = COALESCE($1,name), tagline = COALESCE($2,tagline), logo_url = COALESCE($3,logo_url),
             primary_color = COALESCE($4,primary_color), accent_color = COALESCE($5,accent_color),
             welcome_message = COALESCE($6,welcome_message), contact_email = COALESCE($7,contact_email),
             monthly_image_limit = COALESCE($8,monthly_image_limit),
             is_active = COALESCE($9,is_active), updated_at = NOW()
         WHERE studio_id = $10`,
        [name||null, tagline||null, logoUrl||null, primaryColor||null, accentColor||null,
         welcomeMessage||null, contactEmail||null, monthlyImageLimit||null, isActive??null, studioId],
      );
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: "server error" }); }
  });

  // ── GUBER Admin: list studio users ─────────────────────────────────────────
  app.get("/api/admin/bs/studios/:studioId/users", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId } = req.params;
    try {
      const r = await pool.query(
        `SELECT id, email, role, full_name, is_active, added_by, created_at
         FROM studio_approved_emails WHERE studio_id = $1 ORDER BY created_at DESC`,
        [studioId],
      );
      return res.json(r.rows);
    } catch { return res.status(500).json({ error: "server error" }); }
  });

  // ── GUBER Admin: add studio user ───────────────────────────────────────────
  app.post("/api/admin/bs/studios/:studioId/users", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId } = req.params;
    const { email, role, fullName } = req.body;
    if (!email) return res.status(400).json({ error: "email required" });
    const session = req.session as any;
    try {
      await pool.query(
        `INSERT INTO studio_approved_emails (studio_id, email, role, full_name, added_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (studio_id, email) DO UPDATE SET role=$3, full_name=$4, is_active=true, added_by=$5`,
        [studioId, email.trim().toLowerCase(), role || "client", fullName || null, `admin:${session.userId}`],
      );
      await auditLog(studioId, null, "user_added", { email, role, addedByAdmin: session.userId }, "admin");
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: "server error" }); }
  });

  // ── GUBER Admin: remove studio user ────────────────────────────────────────
  app.delete("/api/admin/bs/studios/:studioId/users/:email", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId, email } = req.params;
    const session = req.session as any;
    try {
      await pool.query(
        `UPDATE studio_approved_emails SET is_active = false WHERE studio_id = $1 AND email = $2`,
        [studioId, decodeURIComponent(email)],
      );
      await auditLog(studioId, null, "user_removed", { email, removedByAdmin: session.userId }, "admin");
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ error: "server error" }); }
  });

  // ── GUBER Admin: studio usage stats ────────────────────────────────────────
  app.get("/api/admin/bs/studios/:studioId/usage", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId } = req.params;
    try {
      const r = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE content_type = 'photo_upload') AS photo_uploads,
           COUNT(*) FILTER (WHERE content_type = 'ai_image') AS ai_images,
           COUNT(*) FILTER (WHERE content_type = 'ai_image' AND created_at > date_trunc('month', NOW())) AS ai_images_this_month,
           COUNT(*) FILTER (WHERE approval_status = 'approved') AS approved,
           COUNT(*) FILTER (WHERE status = 'archived') AS archived,
           COUNT(*) AS total
         FROM studio_content WHERE studio_id = $1`,
        [studioId],
      );
      return res.json(r.rows[0]);
    } catch { return res.status(500).json({ error: "server error" }); }
  });

  // ── GUBER Admin: studio audit log ──────────────────────────────────────────
  app.get("/api/admin/bs/studios/:studioId/audit", async (req, res) => {
    if (!await checkGuberAdmin(req, res)) return;
    const { studioId } = req.params;
    try {
      const r = await pool.query(
        `SELECT * FROM studio_audit_log WHERE studio_id = $1 ORDER BY created_at DESC LIMIT 500`,
        [studioId],
      );
      return res.json(r.rows);
    } catch { return res.status(500).json({ error: "server error" }); }
  });

  console.log("[business-studio] routes registered");
}

// ── One-time studio seed (call from index.ts startup) ──────────────────────
export async function seedNxtgenStudio() {
  try {
    // Create studio record
    await pool.query(
      `INSERT INTO business_studios (studio_id, name, tagline, logo_url, primary_color, accent_color, welcome_message, contact_email, monthly_image_limit)
       VALUES ('nxtgenlawgroup', 'NXTGEN Law Group', 'Content Studio · Powered by GUBER Global',
               '/nxtgen-law-logo.png', '#0f172a', '#c9a84c',
               'Welcome to your private content studio. What are we creating today?',
               'studio@nxtgenlawgroup.com', 200)
       ON CONFLICT (studio_id) DO UPDATE SET logo_url = '/nxtgen-law-logo.png'`,
    );
    // Seed default admin email
    await pool.query(
      `INSERT INTO studio_approved_emails (studio_id, email, role, full_name, added_by)
       VALUES ('nxtgenlawgroup', 'guberapp.global@gmail.com', 'admin', 'GUBER Admin', 'system')
       ON CONFLICT (studio_id, email) DO NOTHING`,
    );
    console.log("[business-studio] NXTGEN Law Group studio ready");
  } catch (err: any) {
    console.error("[business-studio] seed error:", err.message);
  }
}
