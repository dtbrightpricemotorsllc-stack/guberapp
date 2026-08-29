import type { Express, Request, Response } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import {
  BUSINESS_CAPABILITIES,
  DEFAULT_BUSINESS_CAPABILITIES,
  PROFESSIONAL_INDUSTRY_ALIASES,
  PROFESSIONAL_SERVICE_CATEGORIES,
  type BusinessCapability,
  type ProfessionalServiceCategory,
} from "@shared/business-capabilities";

export const BUSINESS_PLAN_CATALOG = [
  {
    planType: "business",
    label: "Business",
    monthlyPriceCents: 0,
    entitlements: ["official_profile", "services", "local_discovery", "explore"],
    platformFeeRate: 0.2,
  },
  {
    planType: "business_plus",
    label: "Business+",
    monthlyPriceCents: 1999,
    entitlements: ["official_profile", "services", "local_discovery", "explore", "enhanced_storefront", "priority_promotion", "booking_appointments"],
    platformFeeRate: 0.2,
  },
  {
    planType: "business_pro",
    label: "Business Pro",
    monthlyPriceCents: 4999,
    entitlements: ["official_profile", "services", "local_discovery", "explore", "enhanced_storefront", "priority_promotion", "lower_platform_fee", "booking_appointments"],
    platformFeeRate: 0.15,
  },
] as const;

const PROFESSIONAL_CATEGORY_KEYS = new Set(PROFESSIONAL_SERVICE_CATEGORIES.map((category) => category.key));

export const PROFESSIONAL_REQUEST_WARNING =
  "For privacy, do not include medical, legal, financial, insurance, account, or other sensitive case details. Use this form only for general scheduling and routing.";

export function normalizeBusinessCapabilities(value: unknown): BusinessCapability[] {
  const values = Array.isArray(value) ? value : [];
  const known = new Set(BUSINESS_CAPABILITIES.map((capability) => capability.key));
  const normalized = values.filter((item): item is BusinessCapability =>
    typeof item === "string" && known.has(item as BusinessCapability),
  );
  const selected = normalized.length ? normalized : DEFAULT_BUSINESS_CAPABILITIES;
  return Array.from(new Set(["public_profile", ...selected])) as BusinessCapability[];
}

export function isProfessionalServiceCategory(category: unknown, industry?: unknown) {
  if (typeof category === "string" && PROFESSIONAL_CATEGORY_KEYS.has(category as ProfessionalServiceCategory)) return true;
  const normalized = String(industry || "").toLowerCase();
  return PROFESSIONAL_INDUSTRY_ALIASES.some((alias) => normalized.includes(alias));
}

export function normalizeProfessionalServiceCategory(value: unknown): ProfessionalServiceCategory | null {
  return typeof value === "string" && PROFESSIONAL_CATEGORY_KEYS.has(value as ProfessionalServiceCategory)
    ? value as ProfessionalServiceCategory
    : null;
}

export function safeProfessionalRequestMessage(value: unknown) {
  const message = typeof value === "string" ? value.trim().slice(0, 500) : "";
  if (!message) return "";
  if (/\b(ssn|social security|medical record|diagnos|symptom|prescription|medication|patient history|insurance claim|policy number|case number|docket|legal matter|bank account|account number|tax return|routing number|credit card)\b/i.test(message)) {
    throw new Error(PROFESSIONAL_REQUEST_WARNING);
  }
  return message;
}

export function getCustomerBusinessRequestNextAction(source: "request" | "booking", status: string) {
  if (status === "reschedule_proposed") return "Review the proposed new time";
  if (status === "requested") return "Waiting for the business to respond";
  if (status === "quoted") return "Review the business response";
  if (status === "contacted") return "Review the business response";
  if (status === "scheduled" || status === "confirmed") return "Your appointment is confirmed";
  if (status === "declined" || status === "cancelled" || status === "closed" || status === "completed") {
    return "No action needed";
  }
  return source === "booking" ? "Check this booking for updates" : "Check this request for updates";
}

export type BusinessPlanType = typeof BUSINESS_PLAN_CATALOG[number]["planType"];
export const FOUNDING_LOCAL_OFFER = {
  offerKey: "founding_local_business",
  label: "Founding Local Business Offer",
  monthlyPriceCents: 999,
  eligibleUntil: "2026-09-30T23:59:59.999Z",
  duration: "Monthly while eligible; renews monthly until cancelled.",
  eligibility: "Eligible early local businesses that complete the GUBER business onboarding and verification process while the offer is available.",
  terms: "Availability and terms may change. This offer is separate from Founder, Day-1 OG, and Studio products.",
} as const;

export function getBusinessPlanFromCatalog(planType: string | null | undefined) {
  return BUSINESS_PLAN_CATALOG.find((plan) => plan.planType === planType);
}
export function businessPlatformFeeRate(planType: string | null | undefined) {
  return planType === "business_pro" ? 0.15 : 0.2;
}

export function calculateBusinessPlatformFee(amount: number, planType: string | null | undefined) {
  const rate = businessPlatformFeeRate(planType);
  return {
    grossAmount: Math.round(amount * 100) / 100,
    feeRate: rate,
    platformFee: Math.round(amount * rate * 100) / 100,
    netAmount: Math.round((amount - amount * rate) * 100) / 100,
  };
}

type Guard = (req: Request, res: Response, next: Function) => unknown;

export const BUSINESS_REQUIREMENTS = [
  {
    key: "registration_ein",
    label: "Business registration or EIN",
    description: "Confirm the legal business identity with a federal EIN or state registration.",
    sourceUrl: "https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers",
    industries: ["*"],
  },
  {
    key: "license",
    label: "Industry or state license",
    description: "Provide the license required by your state or the regulator for this business type.",
    sourceUrl: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits",
    industries: ["Insurance", "Healthcare", "Construction", "Contractor", "Barber", "Salon", "Real Estate"],
  },
  {
    key: "insurance",
    label: "Commercial insurance",
    description: "Provide current general liability or professional insurance when the work exposes customers or property to risk.",
    sourceUrl: "https://www.sba.gov/business-guide/launch-your-business/get-business-insurance",
    industries: ["Insurance", "Healthcare", "Construction", "Contractor", "Logistics & Delivery", "Field Services"],
  },
  {
    key: "bonding",
    label: "Bonding",
    description: "Provide a current surety or performance bond when required by your contracts or jurisdiction.",
    sourceUrl: "https://www.sba.gov/business-guide/manage-your-business/prepare-your-business-contracting",
    industries: ["Construction", "Contractor", "Property Management", "Real Estate"],
  },
  {
    key: "credentials",
    label: "Professional credentials",
    description: "Provide the credential or certification required for the services you offer.",
    sourceUrl: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits",
    industries: ["Healthcare", "Barber", "Salon", "Insurance", "Real Estate"],
  },
] as const;

const INDUSTRY_ALIASES: Record<string, string> = {
  "Auto / Dealer / Auction": "Dealership",
  Automotive: "Dealership",
  "Field Services": "Contractor",
  Construction: "Contractor",
  "Property / Real Estate": "Real Estate",
  "Property Management": "Property Management",
  "Retail / Mystery Shopping": "Retail",
  Retail: "Retail",
  "Logistics / Delivery / Coverage": "Logistics & Delivery",
  "Insurance / Claims": "Insurance",
  "Insurance": "Insurance",
  "Staffing / Recruiting": "Staffing",
};

const MODULES: Record<string, Array<{ key: string; label: string; description: string; href: string }>> = {
  Dealership: [
    { key: "inventory", label: "Vehicle Inventory", description: "Manage your dealership inventory in a business-scoped Marketplace view.", href: "/marketplace?business=mine&category=Vehicles" },
    { key: "marketplace", label: "Marketplace Tools", description: "Publish listings, answer requests, and manage buyer conversations.", href: "/marketplace?business=mine" },
    { key: "verification", label: "Verify Before You Fund", description: "Request field verification for vehicles and equipment.", href: "/biz/verify-inspect" },
  ],
  Barber: [
    { key: "services", label: "Services", description: "Present services and pricing so customers know what to request.", href: "/biz/account" },
    { key: "availability", label: "Availability", description: "Keep hours and service area current for local discovery.", href: "/business-onboarding" },
    { key: "requests", label: "Customer Requests", description: "Review incoming service and quote requests.", href: "/biz/post-job" },
  ],
  Salon: [
    { key: "services", label: "Services", description: "Present services and pricing so customers know what to request.", href: "/biz/account" },
    { key: "availability", label: "Availability", description: "Keep hours and service area current for local discovery.", href: "/business-onboarding" },
    { key: "requests", label: "Customer Requests", description: "Review incoming service and quote requests.", href: "/biz/post-job" },
  ],
  Contractor: [
    { key: "service_area", label: "Service Area", description: "Show where your team works and when you are available.", href: "/business-onboarding" },
    { key: "jobs", label: "Jobs & Assignments", description: "Post, track, and complete field assignments.", href: "/biz/post-job" },
    { key: "quotes", label: "Quotes & Requests", description: "Turn customer requests into scoped work.", href: "/biz/offers" },
  ],
  Retail: [
    { key: "storefront", label: "Storefront", description: "Publish products and keep listings scoped to your business.", href: "/marketplace?business=mine" },
    { key: "requests", label: "Product Requests", description: "Respond to buyers and manage offers.", href: "/marketplace?business=mine" },
    { key: "orders", label: "Orders", description: "Keep supported Marketplace buyer actions in one place.", href: "/marketplace?business=mine" },
  ],
  "Property Management": [
    { key: "properties", label: "Properties", description: "Publish and manage property-related listings.", href: "/marketplace?business=mine&category=Property" },
    { key: "requests", label: "Requests", description: "Review inspection and service requests.", href: "/biz/post-job" },
    { key: "service_area", label: "Service Area", description: "Keep the locations you cover visible to local customers.", href: "/business-onboarding" },
  ],
  default: [
    { key: "profile", label: "Public Profile", description: "Complete the information customers need to find and trust you.", href: "/business-onboarding" },
    { key: "jobs", label: "Jobs & Assignments", description: "Post and track work through the existing GUBER job tools.", href: "/biz/post-job" },
    { key: "discovery", label: "Local Discovery", description: "Review how your business appears to local customers.", href: "/businesses" },
  ],
};

function normalizedIndustry(industry: string | null | undefined) {
  return INDUSTRY_ALIASES[industry || ""] || industry || "default";
}

function requirementsFor(industry: string | null | undefined) {
  const normalized = normalizedIndustry(industry);
  return BUSINESS_REQUIREMENTS.filter((requirement) =>
    (requirement.industries as readonly string[]).includes("*") || (requirement.industries as readonly string[]).includes(normalized),
  );
}

export function resolveBusinessReferralPayoutOwner(
  attribution: { distributor_user_id?: number | null; distributor_label?: string | null },
  codeOwner: { owner_user_id?: number | null; owner_label?: string | null },
) {
  const snapshottedOwnerId = attribution.distributor_user_id == null
    ? null
    : Number(attribution.distributor_user_id);
  if (snapshottedOwnerId != null) {
    return {
      ownerUserId: snapshottedOwnerId,
      ownerLabel: attribution.distributor_label || null,
      source: "attribution" as const,
    };
  }
  const currentOwnerId = codeOwner.owner_user_id == null ? null : Number(codeOwner.owner_user_id);
  if (currentOwnerId == null) return null;
  return {
    ownerUserId: currentOwnerId,
    ownerLabel: codeOwner.owner_label || null,
    source: "code" as const,
  };
}

export function getBusinessReferralCashoutBlock(user: {
  idVerified?: boolean | null;
  stripeAccountId?: string | null;
  stripeAccountStatus?: string | null;
} | null | undefined) {
  if (!user?.idVerified) return "ID verification is required before cashing out referral earnings";
  if (!user.stripeAccountId || user.stripeAccountStatus !== "active") {
    return "An active Stripe Connect payout account is required before cashing out referral earnings";
  }
  return null;
}

export function getBusinessRequirementsForIndustry(industry: string | null | undefined) {
  return requirementsFor(industry);
}

export async function submitBusinessRegistrationEvidence(
  businessAccountId: number,
  ein: string,
  businessAddress: string,
) {
  const result = await pool.query(
    `INSERT INTO business_verification_evidence
      (business_account_id, requirement_key, status, evidence_url, note, submitted_at, updated_at)
     VALUES ($1, 'registration_ein', 'submitted', NULL, $2, NOW(), NOW())
     ON CONFLICT (business_account_id, requirement_key)
     DO UPDATE SET status = 'submitted', note = EXCLUDED.note, is_admin_override = false,
                   reviewed_by = NULL, reviewed_at = NULL, override_reason = NULL, updated_at = NOW()
     RETURNING *`,
    [businessAccountId, `EIN ending ${ein.slice(-4)} submitted for ${businessAddress}`],
  );
  return result.rows[0];
}

function isOpenNow(hours: any) {
  if (!hours || typeof hours !== "object") return null;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = hours[dayNames[new Date().getDay()]];
  if (!today || today.closed || !today.open || !today.close) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = String(today.open).split(":").map(Number);
  const [ch, cm] = String(today.close).split(":").map(Number);
  return current >= oh * 60 + om && current <= ch * 60 + cm;
}

async function accountFor(req: Request) {
  if (!req.session.userId) return null;
  return storage.getBusinessAccount(req.session.userId);
}

async function lockBusinessReferralCode(client: { query: (sql: string, params?: unknown[]) => Promise<any> }, code: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [code]);
}

async function maybeQualifyReferral(businessAccountId: number, adminId?: number) {
  const client = await pool.connect();
  let attribution: any;
  let qualified = false;
  try {
    await client.query("BEGIN");
    // Serialize qualification by business account. The unique attribution and
    // conditional reward update then make retries harmless.
    await client.query("SELECT pg_advisory_xact_lock($1)", [businessAccountId]);
    const codeResult = await client.query(
      `SELECT invitation_code
         FROM business_referral_attributions
        WHERE business_account_id = $1`,
      [businessAccountId],
    );
    if (!codeResult.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    await lockBusinessReferralCode(client, codeResult.rows[0].invitation_code);
    const result = await client.query(
      `SELECT a.*, c.owner_user_id, c.owner_label, b.owner_user_id AS business_owner_id
         FROM business_referral_attributions a
         LEFT JOIN business_referral_codes c ON c.code = a.invitation_code
         JOIN business_accounts b ON b.id = a.business_account_id
        WHERE a.business_account_id = $1
        FOR UPDATE OF a`,
      [businessAccountId],
    );
    attribution = result.rows[0];
    if (!attribution || attribution.reward_status !== "pending") {
      await client.query("COMMIT");
      return attribution || null;
    }
    if (attribution.status === "rejected") {
      await client.query("COMMIT");
      return attribution;
    }
    const payoutOwner = resolveBusinessReferralPayoutOwner(attribution, attribution);
    if (!payoutOwner) {
      await client.query("COMMIT");
      return attribution;
    }
    if (payoutOwner.ownerUserId === Number(attribution.business_owner_id)) {
      await client.query(
        `UPDATE business_referral_attributions SET status = 'rejected', reward_status = 'reversed' WHERE id = $1`,
        [attribution.id],
      );
      await client.query("COMMIT");
      return { ...attribution, status: "rejected", reward_status: "reversed" };
    }
    const updated = await client.query(
      `UPDATE business_referral_attributions
          SET status = 'qualified', reward_status = 'approved', qualified_at = NOW(),
              distributor_user_id = $2, distributor_label = $3
        WHERE id = $1 AND reward_status = 'pending'
        RETURNING *`,
      [attribution.id, payoutOwner.ownerUserId, payoutOwner.ownerLabel],
    );
    qualified = updated.rowCount === 1;
    if (updated.rows[0]) attribution = { ...attribution, ...updated.rows[0] };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (!qualified) return attribution;
  await storage.createAuditLog({
    userId: adminId ?? null,
    action: "business_referral_cash_reward_qualified",
    details: `$5 cash reward approved for distributor ${attribution.distributor_user_id} from business account ${businessAccountId}.`,
  });
  await storage.createNotification({
    userId: attribution.distributor_user_id,
    title: "$5 business referral reward approved",
    body: "A business you referred completed official verification. Your $5 cash reward is ready for cash-out review.",
    type: "business_referral_reward",
  }).catch(() => {});
  return { ...attribution, status: "qualified", reward_status: "approved" };
}

export async function registerBusinessExperienceRoutes(
  app: Express,
  guards: { requireAuth: Guard; requireAdmin: Guard },
) {
  const { requireAuth, requireAdmin } = guards;

  app.get("/api/business/dashboard-config", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const type = normalizedIndustry(account.industry);
    res.json({
      businessType: type,
      modules: MODULES[type] || MODULES.default,
      explore: { label: "Explore GUBER", href: "/dashboard", description: "Access the complete GUBER ecosystem without changing your business context." },
      onboarding: {
        profileHref: "/business-onboarding",
        verificationHref: "/biz/verification",
        profileComplete: Boolean((await storage.getBusinessProfile(account.ownerUserId))?.companyName),
        verificationComplete: account.status === "verified_business",
      },
    });
  });

  app.get("/api/business/plans", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const current = await storage.getBusinessPlan(account.id);
    const currentHasAccess = Boolean(current && ["active", "trialing", "past_due"].includes(current.status));
    const effectiveCurrent = currentHasAccess ? current : null;
    res.json({
      current: effectiveCurrent ? {
        planType: effectiveCurrent.planType,
        status: effectiveCurrent.status,
        renewsAt: effectiveCurrent.renewsAt,
        cancelAtPeriodEnd: Boolean(effectiveCurrent.cancelAtPeriodEnd),
        offerKey: effectiveCurrent.offerKey,
        entitlements: getBusinessPlanFromCatalog(effectiveCurrent.planType)?.entitlements || BUSINESS_PLAN_CATALOG[0].entitlements,
      } : { planType: "business", status: "active", renewsAt: null, cancelAtPeriodEnd: false, offerKey: null, entitlements: BUSINESS_PLAN_CATALOG[0].entitlements },
      catalog: BUSINESS_PLAN_CATALOG,
      foundingOffer: { ...FOUNDING_LOCAL_OFFER, eligible: isFoundingLocalOfferEligible(account) },
      canPurchase: account.status !== "pending_business",
    });
  });

  app.get("/api/business/verification-requirements", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const requirements = requirementsFor(account.industry);
    const evidence = await pool.query(
      `SELECT * FROM business_verification_evidence WHERE business_account_id = $1`,
      [account.id],
    );
    const byKey = new Map(evidence.rows.map((row) => [row.requirement_key, row]));
    res.json({
      businessType: normalizedIndustry(account.industry),
      officialGuidance: "D.D. can explain each missing requirement. Use the official source link on each item; GUBER does not replace a regulator.",
      requirements: requirements.map((requirement) => ({
        ...requirement,
        status: byKey.get(requirement.key)?.status || "missing",
        evidence: byKey.get(requirement.key)?.evidence_url || null,
        note: byKey.get(requirement.key)?.note || null,
        isAdminOverride: Boolean(byKey.get(requirement.key)?.is_admin_override),
      })),
    });
  });

  app.post("/api/business/verification-evidence", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const key = String(req.body.requirementKey || "");
    const requirement = requirementsFor(account.industry).find((item) => item.key === key);
    if (!requirement) return res.status(400).json({ message: "That requirement does not apply to this business type" });
    const evidenceUrl = req.body.evidenceUrl ? String(req.body.evidenceUrl).trim().slice(0, 1000) : null;
    const note = req.body.note ? String(req.body.note).trim().slice(0, 2000) : null;
    if (!evidenceUrl && !note) return res.status(400).json({ message: "Add an official document link or a note for review" });
    const result = await pool.query(
      `INSERT INTO business_verification_evidence
        (business_account_id, requirement_key, status, evidence_url, note, is_admin_override, submitted_at, updated_at)
       VALUES ($1, $2, 'submitted', $3, $4, false, NOW(), NOW())
       ON CONFLICT (business_account_id, requirement_key)
       DO UPDATE SET status = 'submitted', evidence_url = EXCLUDED.evidence_url, note = EXCLUDED.note,
                     is_admin_override = false, reviewed_by = NULL, reviewed_at = NULL,
                     override_reason = NULL, updated_at = NOW()
       RETURNING *`,
      [account.id, key, evidenceUrl, note],
    );
    await storage.createAuditLog({
      userId: req.session.userId!,
      action: "business_verification_evidence_submitted",
      details: `Submitted ${key} evidence for business account ${account.id}.`,
    });
    res.status(201).json(result.rows[0]);
  });

  app.get("/api/business/referral", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const result = await pool.query(
      `SELECT a.invitation_code, a.status, a.reward_status, a.reward_amount_cents,
              a.qualified_at, a.distributor_label AS owner_label
         FROM business_referral_attributions a
         LEFT JOIN business_referral_codes c ON c.code = a.invitation_code
        WHERE a.business_account_id = $1`,
      [account.id],
    );
    res.json(result.rows[0] || null);
  });

  app.post("/api/business/referral/cashout", requireAuth, async (req, res) => {
    const payoutUser = await storage.getUser(req.session.userId!);
    const cashoutBlock = getBusinessReferralCashoutBlock(payoutUser ? {
      idVerified: payoutUser.idVerified,
      stripeAccountId: payoutUser.stripeAccountId,
      stripeAccountStatus: payoutUser.stripeAccountStatus,
    } : null);
    if (cashoutBlock) return res.status(409).json({ message: cashoutBlock });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [Number(req.session.userId)]);
      const reward = await client.query(
        `SELECT * FROM business_referral_attributions
          WHERE distributor_user_id = $1 AND status = 'qualified'
            AND reward_status = 'approved' AND cashout_request_id IS NULL
          ORDER BY qualified_at ASC LIMIT 1 FOR UPDATE`,
        [req.session.userId],
      );
      if (!reward.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "No approved business referral reward is ready for cash-out" });
      }
      const inserted = await client.query(
        `INSERT INTO cashout_requests
          (user_id, credits_requested, dollar_amount, status, payout_method, payout_details,
           payout_destination_account_id, source_type, business_referral_id)
         VALUES ($1, 0, $2, 'pending', 'stripe_connect', NULL, $3, 'business_referral', $4)
         RETURNING *`,
        [
          req.session.userId,
          Number(reward.rows[0].reward_amount_cents) / 100,
          payoutUser!.stripeAccountId,
          reward.rows[0].id,
        ],
      );
      await client.query(
        `UPDATE business_referral_attributions SET cashout_request_id = $1 WHERE id = $2`,
        [inserted.rows[0].id, reward.rows[0].id],
      );
      await client.query("COMMIT");
      res.status(201).json({ ...inserted.rows[0], rewardAmountCents: reward.rows[0].reward_amount_cents });
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: error.message || "Unable to create cash-out request" });
    } finally {
      client.release();
    }
  });

  app.get("/api/jac/business-route", async (req, res) => {
    const query = String(req.query.q || "").trim();
    const officialPattern = /\b(business|company|dealer|dealership|store|salon|barber|shop|retailer|contractor|agency|office)\b/i;
    const official = officialPattern.test(query);
    const result = await pool.query(
      `SELECT ba.id AS business_account_id, bp.company_name, bp.industry
         FROM business_accounts ba
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE ba.status = 'verified_business'
          AND ($1 = '' OR bp.company_name ILIKE $2 OR bp.industry ILIKE $2)
        ORDER BY bp.company_name ASC LIMIT 10`,
      [query, `%${query}%`],
    );
    res.json({
      entityType: official ? "official_business" : "individual_provider",
      route: official ? "/businesses" : "/services",
      explanation: official
        ? "This sounds like a request for an official business or storefront. Showing verified businesses first."
        : "This sounds like a request for an individual provider. Showing Services first.",
      businesses: result.rows,
    });
  });

  app.get("/api/public/businesses", async (req, res) => {
    const search = String(req.query.search || "").trim();
    const params: any[] = [];
    const where = ["ba.status = 'verified_business'"];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(bp.company_name ILIKE $${params.length} OR bp.industry ILIKE $${params.length} OR bp.city ILIKE $${params.length} OR bp.service_area ILIKE $${params.length})`);
    }
    const result = await pool.query(
      `SELECT ba.id AS business_account_id, bp.id, bp.company_name, bp.company_logo, bp.industry,
              bp.description, bp.address, bp.zip_code, bp.service_area, bp.website, bp.business_hours,
              bp.preferred_contact_method, bp.capabilities, bp.professional_category,
              bp.specialties, bp.availability_note
         FROM business_accounts ba
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE ${where.join(" AND ")}
        ORDER BY bp.company_name ASC LIMIT 100`,
      params,
    );
     res.json(result.rows.map((row) => ({
       ...row,
       capabilities: normalizeBusinessCapabilities(row.capabilities),
       specialties: Array.isArray(row.specialties) ? row.specialties : [],
       isOpen: isOpenNow(row.business_hours),
       kind: "official_business",
     })));
  });

  app.get("/api/public/businesses/:id", async (req, res) => {
    const result = await pool.query(
      `SELECT ba.id AS business_account_id,
              bp.company_name AS "companyName", bp.company_logo AS "companyLogo",
              bp.industry, bp.description, bp.business_description AS "businessDescription",
              bp.address, bp.zip_code AS "zipCode", bp.service_area AS "serviceArea",
               bp.business_hours AS "businessHours", bp.website,
               bp.capabilities, bp.professional_category AS "professionalCategory",
               bp.specialties, bp.availability_note AS "availabilityNote",
               ba.status AS "accountStatus"
         FROM business_accounts ba
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE ba.id = $1 AND ba.status = 'verified_business'`,
      [Number(req.params.id)],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Business not found" });
    const business = result.rows[0];
    const inventory = await pool.query(
      `SELECT * FROM marketplace_items WHERE business_account_id = $1 AND status IN ('available', 'active') ORDER BY created_at DESC`,
      [business.business_account_id],
    );
     res.json({
       ...business,
       capabilities: normalizeBusinessCapabilities(business.capabilities),
       specialties: Array.isArray(business.specialties) ? business.specialties : [],
       publicActions: normalizeBusinessCapabilities(business.capabilities),
       isOpen: isOpenNow(business.businessHours),
       kind: "official_business",
       inventory: inventory.rows,
     });
  });

  app.get("/api/business/requests", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const result = await pool.query(
      `SELECT r.id, r.request_type, r.topic, r.message, r.requested_start_at,
              r.customer_timezone, r.customer_location, r.status, r.business_note,
              r.created_at, r.updated_at, u.guber_id AS customer_guber_id
         FROM business_contact_requests r
         JOIN users u ON u.id = r.requester_user_id
        WHERE r.business_account_id = $1
        ORDER BY r.created_at DESC`,
      [account.id],
    );
    res.json(result.rows);
  });

  app.get("/api/business/requests/mine", requireAuth, async (req, res) => {
    const [contactRequests, bookings] = await Promise.all([
      pool.query(
      `SELECT 'request' AS source, r.id, r.request_type AS "requestType",
              r.topic AS "serviceName", r.requested_start_at AS "requestedStartAt",
              NULL::timestamp AS "proposedStartAt", r.status,
              r.business_note AS "businessNote", r.created_at AS "createdAt",
              r.updated_at AS "updatedAt", bp.company_name AS "businessName",
              COALESCE(bp.company_logo, ba.company_logo) AS "businessLogo"
         FROM business_contact_requests r
         JOIN business_accounts ba ON ba.id = r.business_account_id
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE r.requester_user_id = $1
        ORDER BY r.updated_at DESC`,
        [req.session.userId],
      ),
      pool.query(
      `SELECT 'booking' AS source, b.id,
              CASE WHEN s.confirmation_mode = 'quote' THEN 'quote' ELSE 'appointment' END AS "requestType",
              s.name AS "serviceName", b.requested_start_at AS "requestedStartAt",
              b.proposed_start_at AS "proposedStartAt", b.status,
              b.business_note AS "businessNote", b.created_at AS "createdAt",
              b.updated_at AS "updatedAt", bp.company_name AS "businessName",
              COALESCE(bp.company_logo, ba.company_logo) AS "businessLogo"
         FROM business_bookings b
         JOIN business_booking_services s ON s.id = b.service_id
         JOIN business_accounts ba ON ba.id = b.business_account_id
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE b.customer_user_id = $1
        ORDER BY b.updated_at DESC`,
        [req.session.userId],
      ),
    ]);
    const history = [...contactRequests.rows, ...bookings.rows]
      .map((item) => ({
        ...item,
        nextAction: getCustomerBusinessRequestNextAction(item.source, item.status),
      }))
      .sort((left, right) =>
        new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime(),
      );
    res.json(history);
  });

  app.patch("/api/business/requests/:id/status", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const status = String(req.body.status || "").trim();
    if (!["contacted", "scheduled", "quoted", "closed", "declined"].includes(status)) {
      return res.status(400).json({ message: "Choose a valid request status" });
    }
    const result = await pool.query(
      `UPDATE business_contact_requests
          SET status = $1, business_note = $2, updated_at = NOW()
        WHERE id = $3 AND business_account_id = $4
        RETURNING id, status`,
      [status, typeof req.body.note === "string" ? req.body.note.trim().slice(0, 1000) || null : null, Number(req.params.id), account.id],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Request not found" });
    res.json(result.rows[0]);
  });

  app.post("/api/public/businesses/:id/request", requireAuth, async (req, res) => {
    const businessId = Number(req.params.id);
    const requesterId = req.session.userId!;
    const requestType = String(req.body.requestType || "").trim();
    const allowedTypes = ["inquiry", "quote", "consultation", "appointment"];
    if (!allowedTypes.includes(requestType)) return res.status(400).json({ message: "Choose a valid request type" });

    const businessResult = await pool.query(
      `SELECT ba.id, ba.owner_user_id, ba.status, bp.industry, bp.capabilities,
              bp.professional_category
         FROM business_accounts ba
         JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
        WHERE ba.id = $1 AND ba.status = 'verified_business'`,
      [businessId],
    );
    const business = businessResult.rows[0];
    if (!business) return res.status(404).json({ message: "Business not found" });
    if (Number(business.owner_user_id) === requesterId) return res.status(400).json({ message: "A business cannot request from itself" });

    const capabilities = normalizeBusinessCapabilities(business.capabilities);
    const capabilityForRequest: Record<string, BusinessCapability> = {
      inquiry: "customer_inquiries",
      quote: "quote_requests",
      consultation: "consultation_requests",
      appointment: "appointments",
    };
    if (!capabilities.includes(capabilityForRequest[requestType])) {
      return res.status(404).json({ message: "This business has not enabled that customer request" });
    }

    const topic = typeof req.body.topic === "string" ? req.body.topic.trim().slice(0, 160) : "";
    if (!topic) return res.status(400).json({ message: "A short topic is required" });
    const professional = isProfessionalServiceCategory(business.professional_category, business.industry);
    let message = typeof req.body.message === "string" ? req.body.message.trim().slice(0, professional ? 500 : 2000) : "";
    if (professional) {
      try {
        message = safeProfessionalRequestMessage(message);
      } catch (error: any) {
        return res.status(400).json({ message: error.message });
      }
    }
    const requestedStartAt = req.body.requestedStartAt ? new Date(String(req.body.requestedStartAt)) : null;
    if (requestedStartAt && Number.isNaN(requestedStartAt.getTime())) {
      return res.status(400).json({ message: "Choose a valid requested date and time" });
    }
    if (requestType === "appointment" && !requestedStartAt) {
      return res.status(400).json({ message: "Appointment requests need a requested date and time" });
    }

    const result = await pool.query(
      `INSERT INTO business_contact_requests
        (business_account_id, requester_user_id, request_type, topic, message,
         requested_start_at, customer_timezone, customer_location)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, request_type, topic, status, created_at`,
      [
        businessId,
        requesterId,
        requestType,
        topic,
        message || null,
        requestedStartAt,
        typeof req.body.customerTimezone === "string" ? req.body.customerTimezone.trim().slice(0, 80) || null : null,
        typeof req.body.customerLocation === "string" ? req.body.customerLocation.trim().slice(0, 240) || null : null,
      ],
    );
    await storage.createNotification({
      userId: Number(business.owner_user_id),
      title: `New ${requestType} request`,
      body: `${topic} was sent from your verified GUBER business profile.`,
      type: "business_request",
    }).catch(() => {});
    res.status(201).json(result.rows[0]);
  });

  app.get("/api/business/storefront", requireAuth, async (req, res) => {
    const account = await accountFor(req);
    if (!account) return res.status(404).json({ message: "No business account found" });
    const result = await pool.query(
      `SELECT * FROM marketplace_items WHERE business_account_id = $1 ORDER BY created_at DESC`,
      [account.id],
    );
    res.json(result.rows);
  });

  app.get("/api/admin/business-verification", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT ba.id, ba.business_name, ba.industry, ba.status, bp.company_name,
              COALESCE(json_agg(e ORDER BY e.updated_at DESC) FILTER (WHERE e.id IS NOT NULL), '[]') AS evidence
         FROM business_accounts ba
         LEFT JOIN business_profiles bp ON bp.user_id = ba.owner_user_id
         LEFT JOIN business_verification_evidence e ON e.business_account_id = ba.id
        GROUP BY ba.id, bp.company_name ORDER BY ba.created_at DESC`,
    );
    res.json(result.rows);
  });

  app.post("/api/admin/business-verification/:accountId/review", requireAdmin, async (req, res) => {
    const accountId = Number(req.params.accountId);
    const requirementKey = String(req.body.requirementKey || "");
    const decision = String(req.body.decision || "");
    const reason = String(req.body.reason || "").trim().slice(0, 2000);
    if (!["approved", "rejected"].includes(decision) || !reason) {
      return res.status(400).json({ message: "Decision and an audit reason are required" });
    }
    const result = await pool.query(
      `INSERT INTO business_verification_evidence
        (business_account_id, requirement_key, status, is_admin_override, reviewed_by, reviewed_at, override_reason, updated_at)
       VALUES ($1, $2, $3, true, $4, NOW(), $5, NOW())
       ON CONFLICT (business_account_id, requirement_key)
       DO UPDATE SET status = EXCLUDED.status, is_admin_override = true, reviewed_by = EXCLUDED.reviewed_by,
                     reviewed_at = NOW(), override_reason = EXCLUDED.override_reason, updated_at = NOW()
       RETURNING *`,
      [accountId, requirementKey, decision, req.session.userId, reason],
    );
    const account = await storage.getBusinessAccountById(accountId);
    if (account) {
      const requirements = requirementsFor(account.industry);
      const statuses = await pool.query(`SELECT requirement_key, status FROM business_verification_evidence WHERE business_account_id = $1`, [accountId]);
      const statusMap = new Map(statuses.rows.map((row) => [row.requirement_key, row.status]));
      const complete = requirements.every((requirement) => statusMap.get(requirement.key) === "approved");
      await storage.updateBusinessAccount(accountId, {
        status: complete ? "verified_business" : "approved_limited",
        verifiedAt: complete ? new Date() : null,
      });
      if (complete) await maybeQualifyReferral(accountId, req.session.userId);
    }
    await storage.createAuditLog({
      userId: req.session.userId!,
      action: "business_verification_admin_review",
      details: `Business account ${accountId}, requirement ${requirementKey}: ${decision}. Reason: ${reason}`,
    });
    res.json(result.rows[0]);
  });

  app.get("/api/admin/business-referrals", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT a.*, c.owner_label, u.username AS distributor_username, b.business_name
         FROM business_referral_attributions a
         LEFT JOIN business_referral_codes c ON c.code = a.invitation_code
         LEFT JOIN users u ON u.id = a.distributor_user_id
         JOIN business_accounts b ON b.id = a.business_account_id
        ORDER BY a.created_at DESC`,
    );
    res.json(result.rows);
  });

  app.get("/api/admin/business-referral-codes", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT c.code, c.label, c.owner_user_id, c.owner_label, c.active, c.expires_at,
              u.username AS owner_username, u.full_name AS owner_full_name,
              u.email AS owner_email, u.stripe_account_status, u.id_verified,
              COUNT(a.id)::int AS signup_count,
              COUNT(a.id) FILTER (WHERE a.status = 'qualified')::int AS verified_signups,
              COUNT(a.id) FILTER (
                WHERE a.status = 'qualified' AND a.distributor_user_id = c.owner_user_id
              )::int AS current_owner_verified_signups,
              COALESCE(SUM(a.reward_amount_cents) FILTER (
                WHERE a.reward_status = 'approved' AND a.cashout_request_id IS NULL
                  AND a.distributor_user_id = c.owner_user_id
              ), 0)::int AS cash_balance_cents,
              COALESCE(SUM(a.reward_amount_cents) FILTER (
                WHERE a.reward_status = 'approved' AND a.cashout_request_id IS NOT NULL
                  AND a.distributor_user_id = c.owner_user_id
              ), 0)::int AS pending_cashout_cents,
              COALESCE(SUM(a.reward_amount_cents) FILTER (
                WHERE a.reward_status = 'paid' AND a.distributor_user_id = c.owner_user_id
              ), 0)::int AS paid_cash_cents
         FROM business_referral_codes c
         LEFT JOIN users u ON u.id = c.owner_user_id
         LEFT JOIN business_referral_attributions a ON a.invitation_code = c.code
        GROUP BY c.code, c.label, c.owner_user_id, c.owner_label, c.active, c.expires_at,
                 u.username, u.full_name, u.email, u.stripe_account_status, u.id_verified
        ORDER BY c.created_at ASC, c.code ASC`,
    );
    res.json(result.rows);
  });

  app.get("/api/admin/business-referral-owners", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT id, username, full_name, email, stripe_account_status, id_verified
         FROM users
        WHERE deleted_at IS NULL
        ORDER BY LOWER(full_name) ASC, id ASC`,
    );
    res.json(result.rows);
  });

  app.patch("/api/admin/business-referral-codes/:code", requireAdmin, async (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    const ownerUserId = req.body.ownerUserId == null || req.body.ownerUserId === "" ? null : Number(req.body.ownerUserId);
    if (ownerUserId != null && !Number.isInteger(ownerUserId)) {
      return res.status(400).json({ message: "Distributor user was not found" });
    }
    const owner = ownerUserId == null ? null : await storage.getUser(ownerUserId);
    if (ownerUserId != null && !owner) {
      return res.status(400).json({ message: "Distributor user was not found" });
    }
    const ownerLabel = owner ? String(owner.fullName || owner.username).trim().slice(0, 200) : null;
    const client = await pool.connect();
    let updated: any;
    let previous: any;
    try {
      await client.query("BEGIN");
      await lockBusinessReferralCode(client, code);
      const current = await client.query(
        `SELECT code, label, owner_user_id, owner_label
           FROM business_referral_codes
          WHERE code = $1
          FOR UPDATE`,
        [code],
      );
      previous = current.rows[0];
      if (!previous) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Invitation code not found" });
      }
      const result = await client.query(
        `UPDATE business_referral_codes
            SET owner_user_id = $1, owner_label = $2
          WHERE code = $3
          RETURNING *`,
        [ownerUserId, ownerLabel, code],
      );
      updated = result.rows[0];
      if (Number(previous.owner_user_id || 0) !== Number(ownerUserId || 0) ||
          String(previous.owner_label || "") !== String(ownerLabel || "")) {
        await client.query(
          `INSERT INTO business_referral_code_owner_history
            (invitation_code, previous_owner_user_id, previous_owner_label,
             new_owner_user_id, new_owner_label, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            code,
            previous.owner_user_id,
            previous.owner_label,
            ownerUserId,
            ownerLabel,
            req.session.userId,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    await storage.createAuditLog({
      userId: req.session.userId!,
      action: "business_referral_code_owner_changed",
      details: `Invitation code ${code} changed from ${previous.owner_label || "unassigned"}${previous.owner_user_id ? ` (user ${previous.owner_user_id})` : ""} to ${ownerLabel || "unassigned"}${ownerUserId ? ` (user ${ownerUserId})` : ""}.`,
    });
    if (ownerUserId != null) {
      const eligiblePending = await pool.query(
        `SELECT a.business_account_id
           FROM business_referral_attributions a
           JOIN business_accounts b ON b.id = a.business_account_id
          WHERE a.invitation_code = $1
            AND a.distributor_user_id IS NULL
            AND a.reward_status = 'pending'
            AND b.status = 'verified_business'
          ORDER BY a.created_at ASC`,
        [code],
      );
      for (const row of eligiblePending.rows) {
        await maybeQualifyReferral(Number(row.business_account_id), req.session.userId);
      }
    }
    res.json(updated);
  });

  app.patch("/api/admin/business-referrals/:id", requireAdmin, async (req, res) => {
    const status = String(req.body.rewardStatus || "");
    if (!["approved", "paid", "reversed", "failed"].includes(status)) {
      return res.status(400).json({ message: "Invalid reward status" });
    }
    const result = await pool.query(
      `UPDATE business_referral_attributions SET reward_status = $1 WHERE id = $2 RETURNING *`,
      [status, Number(req.params.id)],
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Referral reward not found" });
    await storage.createAuditLog({
      userId: req.session.userId!,
      action: "business_referral_reward_status_changed",
      details: `Business referral reward ${req.params.id} changed to ${status}.`,
    });
    res.json(result.rows[0]);
  });
}

export async function recordBusinessReferral(
  businessAccountId: number,
  invitationCode: string | undefined,
  ownerUserIdForSelfCheck: number,
) {
  const code = String(invitationCode || "").trim().toUpperCase();
  if (!code) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockBusinessReferralCode(client, code);
    const result = await client.query(
      `SELECT code, owner_user_id, owner_label, active, expires_at
         FROM business_referral_codes
        WHERE code = $1`,
      [code],
    );
    const row = result.rows[0];
    if (!row || !row.active || (row.expires_at && new Date(row.expires_at) <= new Date())) {
      throw new Error("Invalid or expired invitation code");
    }
    if (row.owner_user_id && Number(row.owner_user_id) === ownerUserIdForSelfCheck) {
      throw new Error("You cannot use your own distributor code");
    }
    const inserted = await client.query(
      `INSERT INTO business_referral_attributions
        (business_account_id, invitation_code, distributor_user_id, distributor_label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (business_account_id) DO NOTHING
       RETURNING *`,
      [businessAccountId, code, row.owner_user_id || null, row.owner_user_id ? row.owner_label : null],
    );
    if (!inserted.rows[0]) throw new Error("This business already has referral attribution");
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function qualifyBusinessReferral(businessAccountId: number, adminId?: number) {
  return maybeQualifyReferral(businessAccountId, adminId);
}

export function businessPlanHasAccess(status: string | null | undefined) {
  return ["active", "trialing", "past_due"].includes(status || "");
}

export function isFoundingLocalOfferEligible(
  account: { status?: string | null; createdAt?: Date | string | null } | null | undefined,
  now = new Date(),
) {
  if (!account || account.status !== "verified_business") return false;
  if (now > new Date(FOUNDING_LOCAL_OFFER.eligibleUntil)) return false;
  return !account.createdAt || new Date(account.createdAt) <= new Date(FOUNDING_LOCAL_OFFER.eligibleUntil);
}
