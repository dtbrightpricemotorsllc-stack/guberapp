import { randomBytes } from "crypto";
import type { Express, Request, Response } from "express";
import { pool } from "./db";

type Guard = (req: Request, res: Response, next: Function) => unknown;

export type CampaignKind = "consumer" | "business";

const SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;
const ALLOWED_EVENT_TYPES = new Set([
  "scan",
  "jac_opened",
  "intent_captured",
  "auth_started",
  "auth_completed",
  "business_signup_completed",
  "flow_resumed",
  "outcome_completed",
]);

function normalizeKind(value: unknown): CampaignKind {
  return value === "business" ? "business" : "consumer";
}

function normalizeCode(value: unknown): string | null {
  const code = String(value || "").trim().toUpperCase().slice(0, 64);
  return code || null;
}

function safePath(value: unknown, fallback: string): string {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 1000) return fallback;
  return path;
}

function safeText(value: unknown, max = 120): string | null {
  const text = String(value || "").trim().slice(0, max);
  return text || null;
}

function publicSession(row: any) {
  return {
    sessionId: row.session_id,
    kind: row.campaign_kind,
    source: row.source,
    referralCode: row.referral_code,
    invitationCode: row.invitation_code,
    originalIntent: row.original_intent,
    currentIntent: row.current_intent,
    resumePath: row.resume_path,
    context: row.context || {},
    status: row.status,
    expiresAt: row.expires_at,
  };
}

export async function recordCampaignEvent(
  sessionId: string,
  eventType: string,
  eventKey: string,
  payload: Record<string, unknown> = {},
) {
  if (!SESSION_ID_PATTERN.test(sessionId) || !ALLOWED_EVENT_TYPES.has(eventType)) return false;
  const key = safeText(eventKey, 160);
  if (!key) return false;
  const result = await pool.query(
    `INSERT INTO campaign_onboarding_events (session_id, event_key, event_type, payload)
     SELECT $1, $2, $3, $4::jsonb
      WHERE EXISTS (
        SELECT 1 FROM campaign_onboarding_sessions
         WHERE session_id = $1 AND expires_at > NOW()
      )
     ON CONFLICT (session_id, event_key) DO NOTHING`,
    [sessionId, key, eventType, JSON.stringify(payload || {})],
  );
  return (result.rowCount || 0) > 0;
}

export async function claimCampaignSession(
  sessionId: string,
  userId: number,
  options: { businessAccountId?: number | null; eventType?: "auth_completed" | "business_signup_completed" } = {},
) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  const result = await pool.query(
    `UPDATE campaign_onboarding_sessions
        SET user_id = COALESCE(user_id, $2),
            business_account_id = COALESCE(business_account_id, $3),
            status = CASE WHEN status = 'completed' THEN status ELSE 'claimed' END,
            claimed_at = COALESCE(claimed_at, NOW()),
            updated_at = NOW()
      WHERE session_id = $1
        AND expires_at > NOW()
        AND (user_id IS NULL OR user_id = $2)
      RETURNING *`,
    [sessionId, userId, options.businessAccountId || null],
  );
  if (!result.rows[0]) return null;
  await recordCampaignEvent(
    sessionId,
    options.eventType || "auth_completed",
    `${options.eventType || "auth_completed"}:${userId}`,
    { userId, businessAccountId: options.businessAccountId || null },
  );
  return result.rows[0];
}

export async function getCampaignSession(sessionId: string) {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null;
  const result = await pool.query(
    `SELECT * FROM campaign_onboarding_sessions
      WHERE session_id = $1 AND expires_at > NOW()`,
    [sessionId],
  );
  return result.rows[0] || null;
}

export function registerCampaignOnboardingRoutes(
  app: Express,
  guards: { requireAuth: Guard },
) {
  app.post("/api/onboarding/campaign-session", async (req, res) => {
    try {
      const kind = normalizeKind(req.body?.kind);
      const code = normalizeCode(req.body?.code);
      const source = safeText(req.body?.source, 80) || "flyer";
      const initialIntent = safeText(req.body?.intent, 120)
        || (kind === "business" ? "business_onboarding" : "discover_guber");
      const resumePath = safePath(
        req.body?.resumePath,
        kind === "business" ? "/business-signup" : "/dashboard",
      );

      if (kind === "business" && code) {
        const validCode = await pool.query(
          `SELECT 1 FROM business_referral_codes
            WHERE code = $1
              AND active = true
              AND (expires_at IS NULL OR expires_at > NOW())`,
          [code],
        );
        if (!validCode.rows[0]) {
          return res.status(400).json({ message: "Invalid or expired business invitation code" });
        }
      }

      const sessionId = randomBytes(16).toString("hex");
      const context = req.body?.context && typeof req.body.context === "object"
        ? req.body.context
        : {};
      const result = await pool.query(
        `INSERT INTO campaign_onboarding_sessions
          (session_id, campaign_kind, source, referral_code, invitation_code,
           original_intent, current_intent, resume_path, context, guest_session_id,
           expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8::jsonb, $9, NOW() + INTERVAL '7 days')
         RETURNING *`,
        [
          sessionId,
          kind,
          source,
          kind === "consumer" ? code : null,
          kind === "business" ? code : null,
          initialIntent,
          resumePath,
          JSON.stringify(context),
          safeText(req.body?.guestSessionId, 120),
        ],
      );
      await recordCampaignEvent(sessionId, "scan", "scan", { kind, source, codePresent: Boolean(code) });
      res.status(201).json(publicSession(result.rows[0]));
    } catch (error: any) {
      console.error("[campaign-onboarding] create:", error?.message);
      res.status(500).json({ message: "Unable to start flyer session" });
    }
  });

  app.get("/api/onboarding/campaign-session/:sessionId", async (req, res) => {
    try {
      const row = await getCampaignSession(String(req.params.sessionId || ""));
      if (!row) return res.status(404).json({ message: "Campaign session not found or expired" });
      res.json(publicSession(row));
    } catch (error: any) {
      console.error("[campaign-onboarding] read:", error?.message);
      res.status(500).json({ message: "Unable to read flyer session" });
    }
  });

  app.patch("/api/onboarding/campaign-session/:sessionId", async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || "");
      if (!SESSION_ID_PATTERN.test(sessionId)) return res.status(400).json({ message: "Invalid campaign session" });
      const currentIntent = safeText(req.body?.intent, 120);
      const resumePath = req.body?.resumePath == null
        ? null
        : safePath(req.body.resumePath, "/dashboard");
      const context = req.body?.context && typeof req.body.context === "object"
        ? req.body.context
        : {};
      const result = await pool.query(
        `UPDATE campaign_onboarding_sessions
            SET original_intent = COALESCE(original_intent, $2),
                current_intent = COALESCE($2, current_intent),
                resume_path = COALESCE($3, resume_path),
                context = COALESCE(context, '{}'::jsonb) || $4::jsonb,
                guest_session_id = COALESCE($5, guest_session_id),
                updated_at = NOW()
          WHERE session_id = $1 AND expires_at > NOW()
          RETURNING *`,
        [
          sessionId,
          currentIntent,
          resumePath,
          JSON.stringify(context),
          safeText(req.body?.guestSessionId, 120),
        ],
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Campaign session not found or expired" });
      if (currentIntent) {
        await recordCampaignEvent(sessionId, "intent_captured", `intent:${currentIntent}`, {
          intent: currentIntent,
          resumePath,
        });
      }
      res.json(publicSession(result.rows[0]));
    } catch (error: any) {
      console.error("[campaign-onboarding] update:", error?.message);
      res.status(500).json({ message: "Unable to update flyer session" });
    }
  });

  app.post("/api/onboarding/campaign-session/:sessionId/events", async (req, res) => {
    try {
      const eventType = String(req.body?.eventType || "");
      const eventKey = String(req.body?.eventKey || eventType);
      if (!ALLOWED_EVENT_TYPES.has(eventType)) {
        return res.status(400).json({ message: "Invalid campaign event" });
      }
      const inserted = await recordCampaignEvent(
        String(req.params.sessionId || ""),
        eventType,
        eventKey,
        req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {},
      );
      res.json({ recorded: inserted });
    } catch (error: any) {
      console.error("[campaign-onboarding] event:", error?.message);
      res.status(500).json({ message: "Unable to record flyer event" });
    }
  });

  app.post(
    "/api/onboarding/campaign-session/:sessionId/claim",
    guards.requireAuth,
    async (req: Request, res: Response) => {
      try {
        const sessionId = String(req.params.sessionId || "");
        const existing = await getCampaignSession(sessionId);
        const businessAccount = existing?.campaign_kind === "business"
          ? await pool.query(
              `SELECT id FROM business_accounts WHERE owner_user_id = $1 ORDER BY id DESC LIMIT 1`,
              [req.session.userId!],
            )
          : null;
        const row = await claimCampaignSession(
          sessionId,
          req.session.userId!,
          {
            businessAccountId: businessAccount?.rows[0]?.id || null,
            eventType: existing?.campaign_kind === "business" ? "business_signup_completed" : "auth_completed",
          },
        );
        if (!row) return res.status(404).json({ message: "Campaign session not found, expired, or already claimed" });
        res.json(publicSession(row));
      } catch (error: any) {
        console.error("[campaign-onboarding] claim:", error?.message);
        res.status(500).json({ message: "Unable to claim flyer session" });
      }
    },
  );
}