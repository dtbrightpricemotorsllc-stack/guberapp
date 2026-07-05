import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  real,
  serial,
  json,
  jsonb,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  username: text("username").notNull().unique(),
  fullName: text("full_name").notNull(),
  profilePhoto: text("profile_photo"),
  rating: real("rating").default(0),
  reviewCount: integer("review_count").default(0),
  userBio: text("user_bio"),
  zipcode: text("zipcode"),
  role: text("role").notNull().default("buyer"),
  tier: text("tier").notNull().default("community"),
  trustScore: integer("trust_score").default(50),
  jobsCompleted: integer("jobs_completed").default(0),
  jobsDisputed: integer("jobs_disputed").default(0),
  day1OG: boolean("day1_og").default(false),
  isAvailable: boolean("is_available").default(false),
  skills: text("skills"),
  strikes: integer("strikes").default(0),
  suspended: boolean("suspended").default(false),
  banned: boolean("banned").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeAccountId: text("stripe_account_id"),
  stripeAccountStatus: text("stripe_account_status").default("none"),
  emailVerified: boolean("email_verified").default(false),
  profileComplete: boolean("profile_complete").default(false),
  idVerified: boolean("id_verified").default(false),
  selfieVerified: boolean("selfie_verified").default(false),
  credentialVerified: boolean("credential_verified").default(false),
  credentialUploadPending: boolean("credential_upload_pending").default(false),
  authProvider: text("auth_provider").default("email"),
  googleSub: text("google_sub"),
  appleSub: text("apple_sub"),
  cancellationRate: real("cancellation_rate").default(0),
  canceledCount: integer("canceled_count").default(0),
  onTimePct: real("on_time_pct").default(100),
  consecutiveOnTime: integer("consecutive_on_time").default(0),
  badgeTier: text("badge_tier").default("standard"),
  badgeActive: boolean("badge_active").default(true),
  posterCancelCount: integer("poster_cancel_count").default(0),
  underReview: boolean("under_review").default(false),
  strikes30d: integer("strikes_30d").default(0),
  proofQualityScore: integer("proof_quality_score").default(0),
  backgroundCheckStatus: text("background_check_status").default("none"),
  backgroundCheckRestrictions: json("background_check_restrictions").$type<string[]>(),
  aiOrNotCredits: integer("ai_or_not_credits").default(0),
  aiOrNotUnlimitedText: boolean("ai_or_not_unlimited_text").default(false),
  // ── AI Video Studio (repriced task-519, Kling-mirrored economy) ──
  // studioCredits: balance of generations. Per-tool cost lives in the
  // studio_model_pricing table — currently kling_motion_control 80,
  // wan_motion_5s 30, wan_motion_10s 60, minimax_music 5. Granted via Stripe
  // credit packs (Spark→Whale, 330–16000 cr), 2 free trial credits at signup,
  // and +20 cr/month for Day-1 OG members. Credits roll over (no expiry).
  // studioTier: which Studio experience the user has access to. "free" is the
  // default (no subscription). "standard" / "business" / "enterprise" are the
  // paid monthly subscription tiers (660 / 3000 / 8000 monthly credits).
  // studioCreditsLastDripAt: tracks last OG monthly drip so cron doesn't double-grant.
  studioCredits: integer("studio_credits").default(0),
  studioTier: text("studio_tier").default("free"),
  studioCreditsLastDripAt: timestamp("studio_credits_last_drip_at"),
  // Stripe subscription that backs the current Creator/Business tier (null on
  // standard). studioSubscriptionStatus mirrors Stripe's status string
  // (active | trialing | past_due | canceled | unpaid | incomplete | null).
  studioSubscriptionId: text("studio_subscription_id"),
  studioSubscriptionStatus: text("studio_subscription_status"),
  // Mirrors Stripe's `cancel_at_period_end`. While true, the user keeps
  // tier access through the paid period; the actual downgrade happens
  // when Stripe fires customer.subscription.deleted (which also clears
  // studioSubscriptionId).
  studioSubscriptionCancelAtPeriodEnd: boolean("studio_subscription_cancel_at_period_end").default(false),
  trustBoxPurchased: boolean("trust_box_purchased").default(false),
  trustBoxSubscriptionId: text("trust_box_subscription_id"),
  isTestUser: boolean("is_test_user").default(false),
  // task-479: rolling count of hard-blocked hands-free upload attempts
  // (clips rejected by the server preflight as obviously fraudulent —
  // wrong place, wrong time, or too short). Surfaced to hirers on the
  // job detail proof card and to admins on the user profile so support
  // can spot repeat offenders. Never decremented client-side; admin
  // tooling can reset it if needed.
  handsfreeBlockedAttempts: integer("handsfree_blocked_attempts").default(0),
  // task-482: timestamp of the most recent hard-blocked hands-free upload.
  // Used by the decay sweep in server/cron.ts — if a worker has gone 60 days
  // without another block, the counter is reset to 0 so a single old mistake
  // doesn't permanently haunt them. Also used to short-circuit re-flagging
  // a worker who's already been auto-flagged once for review.
  handsfreeBlockedLastAt: timestamp("handsfree_blocked_last_at"),
  monthlyImageUploads: integer("monthly_image_uploads").default(0),
  monthlyVideoUploads: integer("monthly_video_uploads").default(0),
  uploadMonthYear: text("upload_month_year"),
  lat: real("lat"),
  lng: real("lng"),
  idDocumentType: text("id_document_type"),
  guberId: text("guber_id").unique(),
  publicUsername: text("public_username").unique(),
  referralCode: text("referral_code").unique(),
  // ── Performance Shares (replaces old "fee discount per 10 referrals" model) ──
  // referredBy = userId of the referrer (immutable once set).
  // referredAt = signup date used to compute the 30-day window.
  // performanceShareWindowEndsAt = referredAt + 30 days (cached for fast checks).
  // performanceShareEligible = admin kill-switch (default true).
  // referralCount / referralFeePct / referralDiscountExpiresAt are LEGACY columns
  // retained only for backwards compatibility with old data; the new system does
  // not read or update them. Reward = % of GUBER's platform fee on the referred
  // user's completed-paid jobs (10% Day-1 OG referrer, 5% standard) for 30 days.
  referredBy: integer("referred_by"),
  referredAt: timestamp("referred_at"),
  performanceShareEligible: boolean("performance_share_eligible").default(true),
  performanceShareWindowEndsAt: timestamp("performance_share_window_ends_at"),
  referralCount: integer("referral_count").default(0),
  referralFeePct: real("referral_fee_pct").default(0),
  referralDiscountExpiresAt: timestamp("referral_discount_expires_at"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  accountType: text("account_type").default("personal"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  onboardingType: text("onboarding_type"),
  businessAddress: text("business_address"),
  businessWebsite: text("business_website"),
  businessEin: text("business_ein"),
  stripeProfileType: text("stripe_profile_type"),
  createdAt: timestamp("created_at").defaultNow(),
  notifNearbyJobs: boolean("notif_nearby_jobs").default(true),
  serviceRadius: integer("service_radius").default(25),
  alertCategories: text("alert_categories").array(),
  notifMessages: boolean("notif_messages").default(true),
  notifJobUpdates: boolean("notif_job_updates").default(true),
  notifCashDrops: boolean("notif_cash_drops").default(true),
  notifReminderPreArrival: boolean("notif_reminder_pre_arrival").default(true),
  notifReminderOnTheWay: boolean("notif_reminder_on_the_way").default(true),
  notifReminderPayoutRelease: boolean("notif_reminder_payout_release").default(true),
  notifReminderAtRisk: boolean("notif_reminder_at_risk").default(true),
  notifReminderDropExpiring: boolean("notif_reminder_drop_expiring").default(true),
  capabilitiesDescription: text("capabilities_description"),
  jobsAccepted: integer("jobs_accepted").default(0),
  jobsConfirmed: integer("jobs_confirmed").default(0),
  vehicleInspections: integer("vehicle_inspections").default(0),
  propertyChecks: integer("property_checks").default(0),
  marketplaceVerifications: integer("marketplace_verifications").default(0),
  salvageChecks: integer("salvage_checks").default(0),
  photosSubmitted: integer("photos_submitted").default(0),
  gpsVerifiedJobs: integer("gps_verified_jobs").default(0),
  proofReportsSubmitted: integer("proof_reports_submitted").default(0),
  proofConfidenceScore: real("proof_confidence_score").default(0),
  proofConfidenceLevel: text("proof_confidence_level").default("BASIC"),
  reliabilityScore: real("reliability_score").default(100),
  resumeVisibleToCompanies: boolean("resume_visible_to_companies").default(true),
  companyVerified: boolean("company_verified").default(false),
  companyLegalName: text("company_legal_name"),
  companyEntityType: text("company_entity_type"),
  companyVerificationStatus: text("company_verification_status").default("none"),
  companyDocumentsSubmitted: boolean("company_documents_submitted").default(false),
  clockedInAt: timestamp("clocked_in_at"),
  clockedOutAt: timestamp("clocked_out_at"),
  reputationFlags: integer("reputation_flags").default(0),
  cashDropHostEnabled: boolean("cash_drop_host_enabled").default(false),
  cashDropHostStatus: text("cash_drop_host_status").default("inactive"),
  cashDropApprovalRequired: boolean("cash_drop_approval_required").default(true),
  cashDropBrandName: text("cash_drop_brand_name"),
  cashDropBrandLogo: text("cash_drop_brand_logo"),
  cashDropLogo2: text("cash_drop_logo_2"),
  cashDropActiveLogo: integer("cash_drop_active_logo").default(1),
  cashDropLogo1AdminUploaded: boolean("cash_drop_logo1_admin_uploaded").default(false),
  cashDropLogo2AdminUploaded: boolean("cash_drop_logo2_admin_uploaded").default(false),
  milestoneBadges: text("milestone_badges").array(),
  // ── Coordination preferences ──────────────────────────────────────────
  // Worker's chosen navigation provider for the new GUBER Route screen.
  // null = ask each time (Phase 1 of the coordination overhaul).
  preferredMapApp: text("preferred_map_app"),
  // ── Dispute & Payout Protection — user risk signals (Task #317) ─────
  // normal | watch | restricted | suspended (default normal)
  riskLevel: text("risk_level").default("normal"),
  noShowCount: integer("no_show_count").default(0),
  missingProofCount: integer("missing_proof_count").default(0),
  bypassAttemptCount: integer("bypass_attempt_count").default(0),
  falseClaimFlagCount: integer("false_claim_flag_count").default(0),
  // Task #494 — V&I retake reliability signals.
  excessiveRetakeCount: integer("excessive_retake_count").default(0),
  poorProofCount: integer("poor_proof_count").default(0),
  // ── Liability protection (Task #318) ──
  // Set the first time the user accepts the global GUBER liability
  // disclaimer (one-time, app-wide). Existing per-job and per-category
  // waivers are recorded on `assignments` instead.
  liabilityDisclaimerAcceptedAt: timestamp("liability_disclaimer_accepted_at"),

  // ── GUBER Verified Release System — Founders Club ──
  // Permanent flag granted to the first 500 members who buy in at the $99
  // founder price. Once true it never reverts (lifetime membership).
  foundingAssetProtectionMember: boolean("founding_asset_protection_member").default(false),

  // ── Soft-delete / data-retention fields ────────────────────────────────────
  deletedAt: timestamp("deleted_at"),
  deletionScheduledPurgeAt: timestamp("deletion_scheduled_purge_at"),
  deletionReason: text("deletion_reason"),
  // ── Marketplace reputation stats ─────────────────────────────────────────
  mktCompletedSales: integer("mkt_completed_sales").default(0),
  mktCompletedPurchases: integer("mkt_completed_purchases").default(0),
  mktSellerBackouts: integer("mkt_seller_backouts").default(0),
  mktBuyerBackouts: integer("mkt_buyer_backouts").default(0),
  mktSellerNoShows: integer("mkt_seller_no_shows").default(0),
  mktBuyerNoShows: integer("mkt_buyer_no_shows").default(0),
  mktDealsAsSellerTotal: integer("mkt_deals_as_seller_total").default(0),
  mktDealsAsBuyerTotal: integer("mkt_deals_as_buyer_total").default(0),
  mktListingsCreated: integer("mkt_listings_created").default(0),
  mktAcceptedOffers: integer("mkt_accepted_offers").default(0),
  mktCounterOffers: integer("mkt_counter_offers").default(0),
  mktExpiredOffers: integer("mkt_expired_offers").default(0),
  mktCanceledDeals: integer("mkt_canceled_deals").default(0),
  mktVerifiedSales: integer("mkt_verified_sales").default(0),
  mktSellerRatingSum: integer("mkt_seller_rating_sum").default(0),
  mktSellerRatingCount: integer("mkt_seller_rating_count").default(0),
  mktBuyerRatingSum: integer("mkt_buyer_rating_sum").default(0),
  mktBuyerRatingCount: integer("mkt_buyer_rating_count").default(0),
  // ── GUBER Growth Engine ──────────────────────────────────────────────────
  // Separate from studioCredits/aiOrNotCredits. 1000 growthCredits = $1.
  // Min cashout 25,000 credits ($25). Earned via map missions + referral milestones.
  growthCredits: integer("growth_credits").default(0),
  pendingCredits: integer("pending_credits").default(0),
  lifetimeCreditsEarned: integer("lifetime_credits_earned").default(0),
  lifetimeCreditsRedeemed: integer("lifetime_credits_redeemed").default(0),
  // guberScore: engagement/reputation metric separate from trustScore.
  guberScore: integer("guber_score").default(0),
  // campaignLabRole: null = no access (hidden from all non-admin users).
  // "creator" = create content on assigned campaigns only.
  // "reviewer" = approve/reject submitted work items.
  // "marketing_manager" = full Campaign Lab access minus admin controls.
  // Admin (role="admin") always has full access regardless of this column.
  campaignLabRole: text("campaign_lab_role"),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  icon: text("icon"),
  color: text("color"),
});

export const serviceTypes = pgTable("service_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categoryId: integer("category_id"),
  category: text("category"),
  requiresCredential: boolean("requires_credential").default(false),
  minTier: text("min_tier").default("community"),
});

export const viCategories = pgTable("vi_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").default(0),
});

export const useCases = pgTable("use_cases", {
  id: serial("id").primaryKey(),
  viCategoryId: integer("vi_category_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  minTier: text("min_tier").default("community"),
  sortOrder: integer("sort_order").default(0),
});

export const catalogServiceTypes = pgTable("catalog_service_types", {
  id: serial("id").primaryKey(),
  useCaseId: integer("use_case_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  proofTemplateId: integer("proof_template_id"),
  minTier: text("min_tier").default("community"),
  credentialRequired: boolean("credential_required").default(false),
  titleTemplate: text("title_template"),
  descriptionTemplate: text("description_template"),
  sortOrder: integer("sort_order").default(0),
});

export const detailOptionSets = pgTable("detail_option_sets", {
  id: serial("id").primaryKey(),
  useCaseId: integer("use_case_id"),
  viCategoryId: integer("vi_category_id"),
  category: text("category"),
  serviceTypeName: text("service_type_name"),
  name: text("name").notNull(),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull().default("dropdown"),
  options: json("options").$type<string[]>(),
  required: boolean("required").default(true),
  sortOrder: integer("sort_order").default(0),
});

export const proofTemplates = pgTable("proof_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  requiredPhotoCount: integer("required_photo_count").default(1),
  requiredVideo: boolean("required_video").default(false),
  videoDuration: text("video_duration"),
  geoRequired: boolean("geo_required").default(false),
  minDistanceRadius: integer("min_distance_radius"),
  allowGalleryUpload: boolean("allow_gallery_upload").default(false),
  notEncounteredReasons: json("not_encountered_reasons").$type<string[]>(),
});

export const proofChecklistItems = pgTable("proof_checklist_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull(),
  label: text("label").notNull(),
  instruction: text("instruction"),
  mediaType: text("media_type").notNull().default("photo"),
  quantityRequired: integer("quantity_required").default(1),
  geoRequired: boolean("geo_required").default(false),
  sortOrder: integer("sort_order").default(0),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  budget: real("budget"),
  location: text("location"),
  locationApprox: text("location_approx"),
  isTestJob: boolean("is_test_job").default(false),
  visibility: text("visibility").notNull().default("public"),
  zip: text("zip"),
  lat: real("lat"),
  lng: real("lng"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  status: text("status").notNull().default("draft"),
  postedById: integer("posted_by_id").notNull(),
  assignedHelperId: integer("assigned_helper_id"),
  urgentSwitch: boolean("urgent_switch").default(false),
  urgentFee: real("urgent_fee").default(0),
  jobImage: text("job_image"),
  payType: text("pay_type"),
  serviceType: text("service_type"),
  verifyInspectCategory: text("verify_inspect_category"),
  useCaseName: text("use_case_name"),
  catalogServiceTypeName: text("catalog_service_type_name"),
  jobDetails: json("job_details").$type<Record<string, string>>(),
  finalPrice: real("final_price"),
  isPaid: boolean("is_paid").default(false),
  jobType: text("job_type"),
  isPublished: boolean("is_published").default(false),
  buyerConfirmed: boolean("buyer_confirmed").default(false),
  helperConfirmed: boolean("helper_confirmed").default(false),
  platformFee: real("platform_fee"),
  helperPayout: real("helper_payout"),
  posterFeePct: real("poster_fee_pct"),
  workerFeePct: real("worker_fee_pct"),
  posterFee: real("poster_fee"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeSessionId: text("stripe_session_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripeTransferId: text("stripe_transfer_id"),
  chargedAt: timestamp("charged_at"),
  lockedAt: timestamp("locked_at"),
  completedAt: timestamp("completed_at"),
  confirmedAt: timestamp("confirmed_at"),
  paidOutAt: timestamp("paid_out_at"),
  payoutStatus: text("payout_status").default("none"),
  payoutMode: text("payout_mode"),
  // Anti-fraud: timestamp the worker's GPS first verified proximity to the job
  // geofence. Used to *verify and log* arrival — never to auto-release payout.
  geofenceVerifiedAt: timestamp("geofence_verified_at"),
  autoConfirmAt: timestamp("auto_confirm_at"),
  reviewTimerStartedAt: timestamp("review_timer_started_at"),
  disputeReason: text("dispute_reason"),
  disputeNotes: text("dispute_notes"),
  disputeResolvedAt: timestamp("dispute_resolved_at"),
  disputeResolvedBy: integer("dispute_resolved_by"),
  platformFeeRate: real("platform_fee_rate"),
  workerGrossShare: real("worker_gross_share"),
  posterProcessingFee: real("poster_processing_fee"),
  posterServiceFee: real("poster_service_fee"),
  pricingMode: text("pricing_mode"),
  feeProfile: text("fee_profile"),
  refundedAt: timestamp("refunded_at"),
  refundAmount: real("refund_amount"),
  // ── Performance Shares per-job reward snapshot (set at capture time) ────
  // referralRewardUserId = the referrer who earned this reward (NULL if no
  // active referral applied to this job). referralRewardStatus:
  //   pending — reserved for future async accounting
  //   earned  — calculated and credited to the referrer's wallet
  //   paid    — paid out (future use; today wallet == paid)
  //   voided  — refund/dispute reversed the original payment
  referralRewardUserId: integer("referral_reward_user_id"),
  referralRewardAmount: real("referral_reward_amount"),
  referralRewardStatus: text("referral_reward_status"),
  referralRewardType: text("referral_reward_type"),
  proofRequired: boolean("proof_required").default(false),
  proofTemplateId: integer("proof_template_id"),
  proofStatus: text("proof_status"),
  // Task #494 — V&I retake state at the JOB level so the limit is enforced
  // across resubmits (each new proof_submissions row has its own per-row
  // retake_count, but the job-level counter is the source of truth for the
  // VI_RETAKE_LIMIT cap).
  viRetakeCount: integer("vi_retake_count").default(0),
  viRetakeReasons: text("vi_retake_reasons").array(),
  helperStage: text("helper_stage"),
  onTheWayAt: timestamp("on_the_way_at"),
  arrivedAt: timestamp("arrived_at"),
  cancelReason: text("cancel_reason"),
  cancelStage: text("cancel_stage"),
  cancelNotes: text("cancel_notes"),
  graceEndsAt: timestamp("grace_ends_at"),
  expiresAt: timestamp("expires_at"),
  scheduledAt: timestamp("scheduled_at"),
  isBounty: boolean("is_bounty").default(false),
  partConditionTag: text("part_condition_tag"),
  helperObservationNotes: text("helper_observation_notes"),
  removedByAdmin: boolean("removed_by_admin").default(false),
  removedByAdminReason: text("removed_by_admin_reason"),
  boostSuggested: boolean("boost_suggested").default(false),
  suggestedBudget: real("suggested_budget"),
  isBoosted: boolean("is_boosted").default(false),
  boostedAt: timestamp("boosted_at"),
  estimatedMinutes: integer("estimated_minutes"),
  barterNeed: text("barter_need"),
  barterOffering: text("barter_offering"),
  barterEstimatedValue: text("barter_estimated_value"),
  autoIncreaseEnabled: boolean("auto_increase_enabled").default(false),
  autoIncreaseAmount: real("auto_increase_amount"),
  autoIncreaseMax: real("auto_increase_max"),
  autoIncreaseIntervalMins: integer("auto_increase_interval_mins"),
  nextIncreaseAt: timestamp("next_increase_at"),
  taskTier: text("task_tier"),
  estimatedDurationHours: real("estimated_duration_hours"),
  stuckAcknowledgedAt: timestamp("stuck_acknowledged_at"),
  stuckAcknowledgedBy: integer("stuck_acknowledged_by"),
  // ── Structured scheduling (no chat) ─────────────────────────────────
  // Poster supplies one or more {date, startTime, endTime} windows when posting.
  // Worker picks a slot inside one of these; poster confirms/rejects/suggests new.
  // See server/coordination.ts for the full flow.
  availabilityWindows: json("availability_windows").$type<Array<{ date: string; startTime: string; endTime: string }>>(),
  selectedWorkerTime: timestamp("selected_worker_time"),
  selectedArrivalWindowStart: timestamp("selected_arrival_window_start"),
  selectedArrivalWindowEnd: timestamp("selected_arrival_window_end"),
  // pending_worker_time | pending_poster_confirmation | scheduled |
  // poster_suggested_window | reschedule_requested | null (legacy/unused)
  scheduleStatus: text("schedule_status"),
  posterConfirmedTime: timestamp("poster_confirmed_time"),
  // When the worker last submitted a time selection (drives 30-min poster timeout).
  lastTimeSelectionAt: timestamp("last_time_selection_at"),
  // When the worker accepted but hasn't picked a slot yet (drives 15-min worker timeout).
  workerAcceptedAt: timestamp("worker_accepted_at"),
  // Poster's structured counter-suggestion when they reject the worker's pick.
  rescheduleSuggestedWindow: json("reschedule_suggested_window").$type<{ date: string; startTime: string; endTime: string } | null>(),
  // Tracks who initiated the most recent reschedule (poster | worker | null).
  rescheduleRequestedBy: text("reschedule_requested_by"),
  rescheduleCountPoster: integer("reschedule_count_poster").default(0),
  rescheduleCountWorker: integer("reschedule_count_worker").default(0),
  // ── Arrival GPS proof ──
  workerOnMyWayAt: timestamp("worker_on_my_way_at"),
  workerArrivedAt: timestamp("worker_arrived_at"),
  arrivalGpsLat: real("arrival_gps_lat"),
  arrivalGpsLng: real("arrival_gps_lng"),
  arrivalVerified: boolean("arrival_verified").default(false),
  // ── Address / navigation gating ──
  // Computed/cached: only true when payment authorized + worker accepted + time confirmed.
  paymentAuthorized: boolean("payment_authorized").default(false),
  addressUnlocked: boolean("address_unlocked").default(false),
  navigationUnlocked: boolean("navigation_unlocked").default(false),
  // ── Proof Engine timing ──
  // Computed at confirm time: scheduled - 15 min ... scheduled + 30 min.
  proofWindowStart: timestamp("proof_window_start"),
  proofWindowEnd: timestamp("proof_window_end"),
  // ── Urgent jobs ──
  // urgentSwitch already exists. Add the explicit deadline (now + 30/60/90 min).
  urgentArrivalDeadline: timestamp("urgent_arrival_deadline"),
  // ── Risk / dispute ──
  jobAtRisk: boolean("job_at_risk").default(false),
  // open | dispute_locked | resolved | null
  disputeStatus: text("dispute_status"),
  // ── Dispute & Payout Protection (Task #317) ─────────────────────────
  // Structured 8-value enum from shared/dispute.ts (DISPUTE_ISSUE_TYPES).
  disputeIssueType: text("dispute_issue_type"),
  disputeEvidenceUrls: text("dispute_evidence_urls").array(),
  disputeOpenedAt: timestamp("dispute_opened_at"),
  // Snapshot of `status` at the moment a dispute was opened so admin
  // close_no_action can deterministically restore the original lifecycle.
  preDisputeStatus: text("pre_dispute_status"),
  helperResponse: text("helper_response"),
  helperResponseEvidenceUrls: text("helper_response_evidence_urls").array(),
  helperResponseAt: timestamp("helper_response_at"),
  helperResponseDeadline: timestamp("helper_response_deadline"),
  // Admin decision audit trail.
  adminDecision: text("admin_decision"),
  adminDecisionNotes: text("admin_decision_notes"),
  adminReviewedAt: timestamp("admin_reviewed_at"),
  adminReviewedBy: integer("admin_reviewed_by"),
  // Money outcomes (alongside existing refundAmount).
  payoutAmount: real("payout_amount"),
  partialRefundAmount: real("partial_refund_amount"),
  // Safety attestations from each side.
  safetyConfirmedByPoster: boolean("safety_confirmed_by_poster").default(false),
  safetyConfirmedByHelper: boolean("safety_confirmed_by_helper").default(false),
  // Internal mirror of payout lifecycle — does NOT drive Stripe.
  // pending_confirmation | approved | on_hold | released | refunded | partial_release | null
  internalPayoutStatus: text("internal_payout_status"),
  // Surfaced to admin: simple counter signal of contact-bypass attempts on this job.
  contactBypassFlagged: boolean("contact_bypass_flagged").default(false),
  // Optional rolling quality score (0-100), if set by review pipeline.
  jobQualityScore: integer("job_quality_score"),
  // ── Liability protection (Task #318) ──
  // Set the first time the assigned helper confirms the start-of-work
  // safety acknowledgement on this job (clock-in / on-the-way / start).
  helperSafetyConfirmedAt: timestamp("helper_safety_confirmed_at"),
  // TRUE for all jobs created by the demo/seed accounts — never shown to real users.
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assignments = pgTable("assignments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  helperId: integer("helper_id").notNull(),
  offerRate: real("offer_rate"),
  rateType: text("rate_type"),
  status: text("status").notNull().default("pending"),
  acceptedAt: timestamp("accepted_at"),
  clockedInMinutes: integer("clocked_in_minutes"),
  onTime: boolean("on_time"),
  payout: real("payout"),
  jobWaiverAcceptedAt: timestamp("job_waiver_accepted_at"),
  categoryWaiverAcceptedAt: timestamp("category_waiver_accepted_at"),
  workerAvailableFrom: timestamp("worker_available_from"),
  workerAvailableTo: timestamp("worker_available_to"),
  confirmedStartTime: timestamp("confirmed_start_time"),
  needMoreTimeSentAt: timestamp("need_more_time_sent_at"),
});

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull(),
  clockIn: timestamp("clock_in"),
  clockOut: timestamp("clock_out"),
  clockInLocation: text("clock_in_location"),
  clockOutLocation: text("clock_out_location"),
  minutes: integer("minutes"),
  approved: boolean("approved").default(false),
  notes: text("notes"),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  type: text("type"),
  read: boolean("read").default(false),
  jobId: integer("job_id"),
  cashDropId: integer("cash_drop_id"),
  ctaUrl: text("cta_url"),
  ctaLabel: text("cta_label"),
  displayMode: text("display_mode").default("toast"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  reviewerId: integer("reviewer_id").notNull(),
  revieweeId: integer("reviewee_id").notNull(),
  rating: real("rating").notNull(),
  comment: text("comment"),
  tags: json("tags").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const strikeRecords = pgTable("strike_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  reason: text("reason").notNull(),
  severity: text("severity").notNull().default("standard"),
  jobId: integer("job_id"),
  issuedBy: integer("issued_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const proofSubmissions = pgTable("proof_submissions", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  submittedBy: integer("submitted_by").notNull(),
  checklistItemId: integer("checklist_item_id"),
  imageUrls: text("image_urls"),
  videoUrl: text("video_url"),
  notes: text("notes"),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  gpsTimestamp: timestamp("gps_timestamp"),
  verified: boolean("verified").default(false),
  notEncountered: boolean("not_encountered").default(false),
  notEncounteredReason: text("not_encountered_reason"),
  captureMeta: json("capture_meta").$type<{
    deviceKind: "phone-handsfree" | "paired-android" | "paired-ios" | "direct-api";
    deviceModel?: string;
    captureStartedAt?: string;
    captureEndedAt?: string;
    gpsAtStart?: { lat: number; lng: number; accuracy?: number } | null;
    receivedAt?: string;
    consentVersion?: number;
    // ── Imported-clip freshness (paired-* only, task-461) ──
    fileLastModified?: string;
    recordedAt?: string | null;
    recordedAgeSec?: number | null;
    gpsDistanceMeters?: number | null;
    freshnessFlags?: Array<
      "recorded_before_job" | "recorded_in_future" | "missing_recorded_at" | "location_mismatch"
    >;
    // ── Pre-upload preflight warnings (task-467) ──
    preflightWarnings?: string[];
    preflight?: {
      durationSec?: number;
      fileLastModified?: string;
      capturedAt?: string;
      ageHours?: number;
      distanceMeters?: number;
      gpsSource?: "clip" | "none";
      // ── Container-embedded values (task-471) ──
      // Coordinates parsed directly from the MP4/MOV moov atom (e.g. ©xyz
      // ISO-6709 box) — i.e. what the camera/file claims, independent of the
      // device's live GPS at upload time. Used so reviewers can see
      // "the file said: shot at <capturedAt>, at <clipGps>".
      clipGps?: { lat: number; lng: number } | null;
    };
  }>(),
  povSummary: json("pov_summary").$type<{
    status: "pending" | "ready" | "failed" | "skipped";
    durationSec?: number;
    generatedAt?: string;
    modelVersion?: string;
    items?: Array<{
      label: string;
      instruction?: string;
      matched: boolean;
      timestampSec?: number;
      thumbnailUrl?: string;
      note?: string;
    }>;
    error?: string;
  }>(),
  // ── V&I Satisfied / Request-Retake review flow (Task #494) ──────────────
  reviewDecision: text("review_decision").default("pending"),       // pending | satisfied | retake_requested | auto_satisfied
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by"),
  retakeCount: integer("retake_count").default(0),
  retakeReasons: text("retake_reasons").array(),
  reviewWindowExpiresAt: timestamp("review_window_expires_at"),
  // 30-day media retention (Task #494). Set when cron purges Cloudinary
  // assets and clears imageUrls/videoUrl on this row. The summary record
  // (`task_history_summary`) survives forever.
  mediaPurgedAt: timestamp("media_purged_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  jobId: integer("job_id"),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  stripeTransferId: text("stripe_transfer_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  reviewStatus: text("review_status").default("pending"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bountyAttempts = pgTable("bounty_attempts", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  helperId: integer("helper_id").notNull(),
  status: text("status").notNull().default("pending"),
  proofPhotos: json("proof_photos").$type<string[]>(),
  proofGps: json("proof_gps").$type<{ lat: number; lng: number; accuracy?: number }>(),
  proofTimestamp: timestamp("proof_timestamp"),
  partConditionTag: text("part_condition_tag"),
  helperNotes: text("helper_notes"),
  attemptNumber: integer("attempt_number").default(1),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const jobStatusLogs = pgTable("job_status_logs", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  userId: integer("user_id"),
  statusType: text("status_type").notNull(),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  note: text("note"),
  cancelReason: text("cancel_reason"),
  cancelStage: text("cancel_stage"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type JobStatusLog = typeof jobStatusLogs.$inferSelect;
export const insertJobStatusLogSchema = createInsertSchema(jobStatusLogs).omit({ id: true, createdAt: true });

// Batched GPS breadcrumbs for an actively in-progress job (helper en route /
// on site). Written by POST /api/jobs/:id/location-batch from the foreground
// TaskTrackingService. Throttled client-side to ~25 m / 60 s so this stays
// cheap even on long routes.
export const jobLocationPings = pgTable("job_location_pings", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  userId: integer("user_id").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  recordedAt: timestamp("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type JobLocationPing = typeof jobLocationPings.$inferSelect;
export const insertJobLocationPingSchema = createInsertSchema(jobLocationPings).omit({ id: true, createdAt: true });
export type InsertJobLocationPing = z.infer<typeof insertJobLocationPingSchema>;

export const marketplaceItems = pgTable("marketplace_items", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  condition: text("condition"),
  price: real("price"),
  askingType: text("asking_type").default("fixed"),
  priceType: text("price_type").default("firm"),
  makeOfferEnabled: boolean("make_offer_enabled").default(false),
  minOfferThreshold: real("min_offer_threshold"),
  brand: text("brand"),
  model: text("model"),
  year: integer("year"),
  city: text("city"),
  state: text("state"),
  sellerAvailability: text("seller_availability").default("available_now"),
  photos: json("photos").$type<string[]>(),
  thumbnailUrl: text("thumbnail_url"),
  zipcode: text("zipcode"),
  locationApprox: text("location_approx"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  approximateLocationOnly: boolean("approximate_location_only").default(true),
  status: text("status").default("available"),
  guberVerified: boolean("guber_verified").default(false),
  verificationDate: timestamp("verification_date"),
  verifiedByUserId: integer("verified_by_user_id"),
  verifiedByName: text("verified_by_name"),
  viJobId: integer("vi_job_id"),
  verificationNotes: text("verification_notes"),
  verificationReportId: integer("verification_report_id"),
  sellerName: text("seller_name"),
  boosted: boolean("boosted").default(false),
  boostedUntil: timestamp("boosted_until"),
  boostType: text("boost_type"),
  boostStartedAt: timestamp("boost_started_at"),
  boostPaymentStatus: text("boost_payment_status").default("unpaid"),
  boostStripeSessionId: text("boost_stripe_session_id"),
  subCategory: text("sub_category"),
  listingType: text("listing_type"),
  sellerType: text("seller_type"),
  vinNumber: text("vin_number"),
  vehicleMileage: integer("vehicle_mileage"),
  titleStatus: text("title_status"),
  purchaseType: text("purchase_type"),
  details: json("details").$type<Record<string, any>>(),
  isSample: boolean("is_sample").default(false),
  publicSlug: text("public_slug"),
  viewCount: integer("view_count").default(0),
  contactCount: integer("contact_count").default(0),
  verificationRequestCount: integer("verification_request_count").default(0),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceOffers = pgTable("marketplace_offers", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  offerAmount: real("offer_amount").notNull(),
  counterAmount: real("counter_amount"),
  offerActionCount: integer("offer_action_count").default(1),
  status: text("status").default("pending"),
  message: text("message"),
  expiresAt: timestamp("expires_at"),
  sellerRespondedAt: timestamp("seller_responded_at"),
  buyerRespondedAt: timestamp("buyer_responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceViewingRequests = pgTable("marketplace_viewing_requests", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  requestedTime: timestamp("requested_time"),
  sellerResponseTime: timestamp("seller_response_time"),
  status: text("status").default("requested"),
  note: text("note"),
  addressUnlocked: boolean("address_unlocked").default(false),
  buyerOnTheWay: boolean("buyer_on_the_way").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceVerificationRequests = pgTable("marketplace_verification_requests", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  generatedTaskId: integer("generated_task_id"),
  verificationLevel: text("verification_level").default("standard"),
  status: text("status").default("pending"),
  paymentStatus: text("payment_status").default("unpaid"),
  proofReportId: integer("proof_report_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceListingReports = pgTable("marketplace_listing_reports", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  reporterUserId: integer("reporter_user_id").notNull(),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const marketplaceBuyerOrderRequests = pgTable("marketplace_buyer_order_requests", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  status: text("status").default("pending"), // pending | fulfilled | rejected
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceBuyerOrderPurchases = pgTable("marketplace_buyer_order_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  listingId: integer("listing_id").notNull(),
  amountPaid: real("amount_paid").notNull().default(0),
  stripeSessionId: text("stripe_session_id"),
  paymentStatus: text("payment_status").default("free"), // "free" | "paid"
  monthKey: text("month_key"), // "YYYY-MM" for OG monthly tracking
  createdAt: timestamp("created_at").defaultNow(),
});
export type MarketplaceBuyerOrderPurchase = typeof marketplaceBuyerOrderPurchases.$inferSelect;

export const marketplaceDeals = pgTable("marketplace_deals", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  offerId: integer("offer_id").notNull(),
  buyerUserId: integer("buyer_user_id").notNull(),
  sellerUserId: integer("seller_user_id").notNull(),
  agreedPrice: real("agreed_price").notNull(),
  // pending_completion | completed | buyer_backed_out | seller_backed_out | buyer_no_show | seller_no_show | mutual_cancellation
  status: text("status").default("pending_completion"),
  outcomeNote: text("outcome_note"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by"),
  // Future placeholder hooks
  appointmentAt: timestamp("appointment_at"),
  meetingAddress: text("meeting_address"),
  escrowId: text("escrow_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const marketplaceDealMessages = pgTable("marketplace_deal_messages", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  senderUserId: integer("sender_user_id").notNull(),
  message: text("message").notNull(),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketplaceDealReviews = pgTable("marketplace_deal_reviews", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").notNull(),
  reviewerUserId: integer("reviewer_user_id").notNull(),
  revieweeUserId: integer("reviewee_user_id").notNull(),
  reviewerRole: text("reviewer_role").notNull(), // "buyer" | "seller"
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type MarketplaceDealReview = typeof marketplaceDealReviews.$inferSelect;

export const insertMarketplaceItemSchema = createInsertSchema(marketplaceItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  guberVerified: true,
  verificationDate: true,
  verifiedByUserId: true,
  verifiedByName: true,
  viewCount: true,
  contactCount: true,
  verificationRequestCount: true,
});

export type MarketplaceItem = typeof marketplaceItems.$inferSelect;
export type InsertMarketplaceItem = z.infer<typeof insertMarketplaceItemSchema>;
export type MarketplaceOffer = typeof marketplaceOffers.$inferSelect;
export type MarketplaceViewingRequest = typeof marketplaceViewingRequests.$inferSelect;
export type MarketplaceVerificationRequest = typeof marketplaceVerificationRequests.$inferSelect;
export type MarketplaceListingReport = typeof marketplaceListingReports.$inferSelect;
export type MarketplaceDeal = typeof marketplaceDeals.$inferSelect;
export type MarketplaceDealMessage = typeof marketplaceDealMessages.$inferSelect;
export type MarketplaceBuyerOrderRequest = typeof marketplaceBuyerOrderRequests.$inferSelect;
export type MarketplaceBuyerOrderPurchaseType = typeof marketplaceBuyerOrderPurchases.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  rating: true,
  reviewCount: true,
  trustScore: true,
  jobsCompleted: true,
  jobsDisputed: true,
  strikes: true,
  suspended: true,
  banned: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3),
  fullName: z.string().min(2),
  password: z.string().min(6),
  zipcode: z.string().optional(),
});

export const businessSignupSchema = z.object({
  ein: z.string().regex(/^\d{9}$/, "EIN must be exactly 9 digits"),
  legalBusinessName: z.string().min(2, "Legal business name is required"),
  email: z.string().email(),
  username: z.string().min(3),
  fullName: z.string().min(2),
  password: z.string().min(8, "Password must be at least 8 characters"),
  industry: z.string().optional(),
  contactPhone: z.string().optional(),
  billingEmail: z.string().email().optional().or(z.literal("")),
  description: z.string().optional(),
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  isPaid: true,
  buyerConfirmed: true,
  helperConfirmed: true,
  platformFee: true,
  helperPayout: true,
  assignedHelperId: true,
  stripePaymentIntentId: true,
  stripeSessionId: true,
  stripeChargeId: true,
  stripeTransferId: true,
  lockedAt: true,
  completedAt: true,
  confirmedAt: true,
  autoConfirmAt: true,
  reviewTimerStartedAt: true,
  disputeReason: true,
  disputeNotes: true,
  disputeResolvedAt: true,
  disputeResolvedBy: true,
  platformFeeRate: true,
  workerGrossShare: true,
  posterProcessingFee: true,
  posterServiceFee: true,
  refundedAt: true,
  refundAmount: true,
  paidOutAt: true,
  boostSuggested: true,
  suggestedBudget: true,
  isBoosted: true,
  boostedAt: true,
  // ── Coordination fields are all server-controlled (set by the structured
  //    scheduling endpoints, not by the poster directly). availabilityWindows
  //    is the one exception and stays in the insert payload.
  selectedWorkerTime: true,
  selectedArrivalWindowStart: true,
  selectedArrivalWindowEnd: true,
  scheduleStatus: true,
  posterConfirmedTime: true,
  lastTimeSelectionAt: true,
  workerAcceptedAt: true,
  rescheduleSuggestedWindow: true,
  rescheduleRequestedBy: true,
  rescheduleCountPoster: true,
  rescheduleCountWorker: true,
  workerOnMyWayAt: true,
  workerArrivedAt: true,
  arrivalGpsLat: true,
  arrivalGpsLng: true,
  arrivalVerified: true,
  paymentAuthorized: true,
  addressUnlocked: true,
  navigationUnlocked: true,
  proofWindowStart: true,
  proofWindowEnd: true,
  urgentArrivalDeadline: true,
  jobAtRisk: true,
  disputeStatus: true,
  // ── Dispute & Payout Protection — server-controlled (Task #317) ─────
  disputeIssueType: true,
  disputeEvidenceUrls: true,
  disputeOpenedAt: true,
  helperResponse: true,
  helperResponseEvidenceUrls: true,
  helperResponseAt: true,
  helperResponseDeadline: true,
  adminDecision: true,
  adminDecisionNotes: true,
  adminReviewedAt: true,
  adminReviewedBy: true,
  payoutAmount: true,
  partialRefundAmount: true,
  safetyConfirmedByPoster: true,
  safetyConfirmedByHelper: true,
  internalPayoutStatus: true,
  contactBypassFlagged: true,
  jobQualityScore: true,
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ogPreapprovedEmails = pgTable("og_preapproved_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trustBoxPreapprovedEmails = pgTable("trust_box_preapproved_emails", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredId: integer("referred_id").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Category = typeof categories.$inferSelect;
export type ServiceType = typeof serviceTypes.$inferSelect;
export type VICategory = typeof viCategories.$inferSelect;
export type UseCase = typeof useCases.$inferSelect;
export type CatalogServiceType = typeof catalogServiceTypes.$inferSelect;
export type DetailOptionSet = typeof detailOptionSets.$inferSelect;
export type ProofTemplate = typeof proofTemplates.$inferSelect;
export type ProofChecklistItem = typeof proofChecklistItems.$inferSelect;
export type Assignment = typeof assignments.$inferSelect;
export type Timesheet = typeof timesheets.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type StrikeRecord = typeof strikeRecords.$inferSelect;
export type ProofSubmission = typeof proofSubmissions.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type BountyAttempt = typeof bountyAttempts.$inferSelect;

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;

export const apnsDeviceTokens = pgTable("apns_device_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceToken: text("device_token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApnsDeviceToken = typeof apnsDeviceTokens.$inferSelect;

// Firebase Cloud Messaging registration tokens for the native Android
// Capacitor app. Stored separately from APNs tokens because the send path
// differs (firebase-admin SDK vs node-apn) and tokens are not interchangeable.
export const fcmDeviceTokens = pgTable("fcm_device_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceToken: text("device_token").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type FcmDeviceToken = typeof fcmDeviceTokens.$inferSelect;

// Per-attempt log of every push delivery the server tries to send. Used by
// the admin "Push Log" tab to answer "did this user actually get notified?"
// when in-app behaviour is suspect. One row per (user, channel, attempt).
export const pushSendLog = pgTable("push_send_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  channel: text("channel").notNull(), // 'apns' | 'fcm' | 'webpush'
  success: boolean("success").notNull(),
  errorCode: text("error_code"),
  title: text("title"),
  tag: text("tag"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export type PushSendLog = typeof pushSendLog.$inferSelect;

export const businessAccounts = pgTable("business_accounts", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().unique(),
  businessName: text("business_name").notNull(),
  workEmail: text("work_email").notNull(),
  phone: text("phone"),
  industry: text("industry"),
  companyNeedsSummary: text("company_needs_summary"),
  status: text("status").notNull().default("pending_business"),
  verificationFeePaid: boolean("verification_fee_paid").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingEmail: text("billing_email"),
  businessAddress: text("business_address"),
  authorizedContactName: text("authorized_contact_name"),
  einEncrypted: text("ein_encrypted"),
  einLast4: text("ein_last4"),
  verificationSubmittedAt: timestamp("verification_submitted_at"),
  verifiedAt: timestamp("verified_at"),
  companyLogo: text("company_logo"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const businessPlans = pgTable("business_plans", {
  id: serial("id").primaryKey(),
  businessAccountId: integer("business_account_id").notNull(),
  planType: text("plan_type").notNull().default("scout"),
  status: text("status").notNull().default("active"),
  includedUnlocksPerMonth: integer("included_unlocks_per_month").notNull().default(20),
  currentUnlockBalance: integer("current_unlock_balance").notNull().default(20),
  renewsAt: timestamp("renews_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const businessCandidateUnlocks = pgTable("business_candidate_unlocks", {
  id: serial("id").primaryKey(),
  businessAccountId: integer("business_account_id").notNull(),
  userId: integer("user_id").notNull(),
  unlockSource: text("unlock_source").notNull().default("plan"),
  paymentReference: text("payment_reference"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const businessOffers = pgTable("business_offers", {
  id: serial("id").primaryKey(),
  businessAccountId: integer("business_account_id").notNull(),
  userId: integer("user_id").notNull(),
  offerType: text("offer_type").notNull().default("direct_work"),
  subject: text("subject").notNull(),
  message: text("message"),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at").defaultNow(),
  viewedAt: timestamp("viewed_at"),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
  expiredAt: timestamp("expired_at"),
});

export const workerBusinessProjections = pgTable("worker_business_projections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  guberId: text("guber_id"),
  primaryCategories: json("primary_categories").$type<string[]>(),
  currentRegion: text("current_region"),
  mobilityType: text("mobility_type").default("local_only"),
  jobsCompleted: integer("jobs_completed").default(0),
  completionRate: real("completion_rate").default(100),
  averageRating: real("average_rating").default(0),
  responseSpeedScore: real("response_speed_score").default(0),
  proofStrengthScore: real("proof_strength_score").default(0),
  recentActivityFlag: boolean("recent_activity_flag").default(false),
  recentRegionsSummary: text("recent_regions_summary"),
  idVerified: boolean("id_verified").default(false),
  backgroundVerified: boolean("background_verified").default(false),
  eliteBadgesJson: json("elite_badges_json").$type<string[]>(),
  revenueEarned: real("revenue_earned").default(0),
  availabilityStatus: text("availability_status").default("available"),
  businessVisibilityStatus: text("business_visibility_status").default("visible"),
  reviewCount: integer("review_count").default(0),
  reliabilityScore: real("reliability_score").default(100),
  droneCertified: boolean("drone_certified").default(false),
  lat: real("lat"),
  lng: real("lng"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const backgroundCheckEligibility = pgTable("background_check_eligibility", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  eligibilitySource: text("eligibility_source").notNull().default("revenue_milestone"),
  thresholdAmount: real("threshold_amount").notNull().default(1000),
  unlockedAt: timestamp("unlocked_at"),
  notificationSentAt: timestamp("notification_sent_at"),
  acceptedAt: timestamp("accepted_at"),
  passedAt: timestamp("passed_at"),
  declinedAt: timestamp("declined_at"),
  badgeGrantedAt: timestamp("badge_granted_at"),
});

export const billingEvents = pgTable("billing_events", {
  id: serial("id").primaryKey(),
  businessAccountId: integer("business_account_id").notNull(),
  stripeEventId: text("stripe_event_id").unique(),
  eventType: text("event_type").notNull(),
  processedAt: timestamp("processed_at").defaultNow(),
  status: text("status").notNull().default("processed"),
  rawReference: text("raw_reference"),
});

export const legalAcceptances = pgTable("legal_acceptances", {
  id: serial("id").primaryKey(),
  actorType: text("actor_type").notNull(),
  actorId: integer("actor_id").notNull(),
  documentType: text("document_type").notNull(),
  documentVersion: text("document_version").notNull().default("1.0"),
  acceptedAt: timestamp("accepted_at").defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  companyName: text("company_name").notNull(),
  companyLogo: text("company_logo"),
  billingEmail: text("billing_email"),
  industry: text("industry"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  description: text("description"),
  ein: text("ein"),
  legalBusinessName: text("legal_business_name"),
  companyVerified: boolean("company_verified").default(false),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bulkJobBatches = pgTable("bulk_job_batches", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  templateId: integer("template_id"),
  totalJobs: integer("total_jobs").default(0),
  completedJobs: integer("completed_jobs").default(0),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category").notNull().default("general"),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dropSponsors = pgTable("drop_sponsors", {
  id: serial("id").primaryKey(),
  businessProfileId: integer("business_profile_id"),
  businessId: integer("business_id"),
  companyName: text("company_name").notNull(),
  logoUrl: text("logo_url"),
  contactEmail: text("contact_email").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  businessAddress: text("business_address"),
  websiteUrl: text("website_url"),
  requestedDropDate: text("requested_drop_date"),
  targetZipCode: text("target_zip_code"),
  targetCityState: text("target_city_state"),
  proposedBudget: real("proposed_budget"),
  promotionGoal: text("promotion_goal"),
  preferredTime: text("preferred_time"),
  finalLocationRequested: boolean("final_location_requested").default(false),
  brandingEnabled: boolean("branding_enabled").default(false),
  sponsorMessage: text("sponsor_message"),
  sponsorshipType: text("sponsorship_type").notNull().default("cash"),
  cashContribution: real("cash_contribution"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  rewardType: text("reward_type").notNull().default("cash"),
  rewardDescription: text("reward_description"),
  rewardQuantity: integer("reward_quantity"),
  noPurchaseRequiredText: text("no_purchase_required_text"),
  disclaimerText: text("disclaimer_text"),
  finalLocationMode: text("final_location_mode").notNull().default("name_only"),
  redemptionType: text("redemption_type").notNull().default("visit_store"),
  redemptionInstructions: text("redemption_instructions"),
  status: text("status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  platformAmount: real("platform_amount"),
  dropPoolAmount: real("drop_pool_amount"),
  numberOfWinners: integer("number_of_winners").default(1),
  estimatedPrizePerWinner: real("estimated_prize_per_winner"),
  paidAt: timestamp("paid_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  approvedBy: integer("approved_by"),
  linkedDropId: integer("linked_drop_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DropSponsor = typeof dropSponsors.$inferSelect;
export type InsertDropSponsor = typeof dropSponsors.$inferInsert;

export const cashDrops = pgTable("cash_drops", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  rewardPerWinner: real("reward_per_winner").notNull(),
  winnerLimit: integer("winner_limit").notNull().default(1),
  winnersFound: integer("winners_found").default(0),
  cashWinnerCount: integer("cash_winner_count").default(1),
  rewardWinnerCount: integer("reward_winner_count").default(0),
  status: text("status").notNull().default("draft"),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  gpsRadius: integer("gps_radius").default(200),
  clueText: text("clue_text"),
  clueMediaUrls: text("clue_media_urls").array(),
  clueRevealOnArrival: boolean("clue_reveal_on_arrival").default(false),
  requireInAppCamera: boolean("require_in_app_camera").default(true),
  proofItems: json("proof_items").$type<{ label: string; type: "photo" | "video" }[]>(),
  sponsorName: text("sponsor_name"),
  sponsorLogo: text("sponsor_logo"),
  sponsorId: integer("sponsor_id"),
  isSponsored: boolean("is_sponsored").default(false),
  brandingEnabled: boolean("branding_enabled").default(false),
  finalLocationMode: text("final_location_mode").default("name_only"),
  rewardType: text("reward_type").default("cash"),
  rewardDescription: text("reward_description"),
  rewardQuantity: integer("reward_quantity"),
  rewardRedemptionType: text("reward_redemption_type"),
  redemptionType: text("redemption_type"),
  redemptionInstructions: text("redemption_instructions"),
  noPurchaseRequiredText: text("no_purchase_required_text"),
  disclaimerText: text("disclaimer_text"),
  claimCode: text("claim_code"),
  fundingSource: text("funding_source").default("guber_cash_app"),
  closedAt: timestamp("closed_at"),
  isHostDrop: boolean("is_host_drop").default(false),
  hostUserId: integer("host_user_id").references(() => users.id),
  hostLogo: text("host_logo"),
  approvalStatus: text("approval_status").default("approved"),
  isTestDrop: boolean("is_test_drop").default(false),
  visibility: text("visibility").notNull().default("public"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cashDropAttempts = pgTable("cash_drop_attempts", {
  id: serial("id").primaryKey(),
  cashDropId: integer("cash_drop_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default("claimed"),
  arrivedAt: timestamp("arrived_at"),
  submittedAt: timestamp("submitted_at"),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  proofUrls: json("proof_urls").$type<string[]>(),
  videoUrl: text("video_url"),
  payoutStatus: text("payout_status").default("none"),
  payoutMethod: text("payout_method"),
  payoutHandle: text("payout_handle"),
  payoutBankName: text("payout_bank_name"),
  payoutRoutingNumber: text("payout_routing_number"),
  payoutAccountNumber: text("payout_account_number"),
  payoutAccountType: text("payout_account_type"),
  payoutReference: text("payout_reference"),
  payoutSentAt: timestamp("payout_sent_at"),
  payoutApprovedBy: integer("payout_approved_by"),
  fundedFromSource: text("funded_from_source"),
  rewardAmount: real("reward_amount"),
  rewardType: text("reward_type").default("cash"),
  guberCreditAmount: real("guber_credit_amount"),
  validationLog: json("validation_log").$type<string[]>(),
  claimCode: text("claim_code"),
  deviceFingerprint: text("device_fingerprint"),
  stripeTransferId: text("stripe_transfer_id"),
  rejectionReason: text("rejection_reason"),
  isRewardWinner: boolean("is_reward_winner").default(false),
  redemptionShown: boolean("redemption_shown").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const servicePricingConfig = pgTable("service_pricing_config", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  serviceTypeName: text("service_type_name").notNull(),
  minPayout: real("min_payout").notNull().default(5),
  suggestedRangeLow: real("suggested_range_low").notNull().default(10),
  suggestedRangeHigh: real("suggested_range_high").notNull().default(25),
  estimatedMinutes: integer("estimated_minutes").default(30),
  complexityTier: text("complexity_tier").notNull().default("standard"),
});

export type ServicePricingConfig = typeof servicePricingConfig.$inferSelect;

export const workerQualifications = pgTable("worker_qualifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  qualificationName: text("qualification_name").notNull(),
  documentUrl: text("document_url"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  adminNotes: text("admin_notes"),
  // ── AI-extracted credential card fields (Task #372) ─────────────────
  // Populated on upload by analyzeCredentialImage(); workers may edit
  // before submission. Surfaced on the credential card after admin approval.
  issuingAuthority: text("issuing_authority"),
  expirationDate: timestamp("expiration_date"),
  credentialType: text("credential_type"),
  aiExtracted: boolean("ai_extracted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  expiryWarningSentAt: timestamp("expiry_warning_sent_at"),
});

export type WorkerQualification = typeof workerQualifications.$inferSelect;

export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  category: text("category").notNull().default("general"),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).omit({ id: true, createdAt: true, status: true, adminNote: true });
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;
export type UserFeedback = typeof userFeedback.$inferSelect;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type BusinessAccount = typeof businessAccounts.$inferSelect;
export type BusinessPlan = typeof businessPlans.$inferSelect;
export type BusinessCandidateUnlock = typeof businessCandidateUnlocks.$inferSelect;
export type BusinessOffer = typeof businessOffers.$inferSelect;
export type WorkerBusinessProjection = typeof workerBusinessProjections.$inferSelect;
export type BackgroundCheckEligibility = typeof backgroundCheckEligibility.$inferSelect;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type LegalAcceptance = typeof legalAcceptances.$inferSelect;

export const businessAccessRequestSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  workEmail: z.string().email("Valid work email required"),
  phone: z.string().optional(),
  industry: z.string().min(1, "Industry is required"),
  companyNeedsSummary: z.string().optional(),
  fullName: z.string().min(2, "Full name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  businessAddress: z.string().min(5, "Business address is required"),
  website: z.string().optional(),
  ein: z.string().optional(),
});

export const businessVerificationSchema = z.object({
  ein: z.string().regex(/^\d{9}$/, "EIN must be exactly 9 digits"),
  businessAddress: z.string().min(5, "Business address is required"),
  billingEmail: z.string().email("Valid billing email required"),
  authorizedContactName: z.string().min(2, "Authorized contact name is required"),
});

export const businessOfferSchema = z.object({
  userId: z.number(),
  offerType: z.string(),
  subject: z.string().min(3, "Subject is required"),
  message: z.string().optional(),
});

export const observations = pgTable("observations", {
  id: serial("id").primaryKey(),
  helperId: integer("helper_id").notNull(),
  observationType: text("observation_type").notNull(),
  locationLat: real("location_lat").notNull(),
  locationLng: real("location_lng").notNull(),
  address: text("address").notNull(),
  photoURLs: text("photo_urls").array().notNull().default(sql`'{}'::text[]`),
  notes: text("notes"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  status: text("status").notNull().default("open"),
  purchasedByCompanyId: integer("purchased_by_company_id"),
  purchasePrice: real("purchase_price"),
  purchasedAt: timestamp("purchased_at"),
  convertedToJobId: integer("converted_to_job_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertObservationSchema = createInsertSchema(observations).omit({
  id: true,
  createdAt: true,
  status: true,
  purchasedByCompanyId: true,
  purchasePrice: true,
  purchasedAt: true,
  convertedToJobId: true,
  expiresAt: true,
});

export type Observation = typeof observations.$inferSelect;
export type InsertObservation = z.infer<typeof insertObservationSchema>;
export type BulkJobBatch = typeof bulkJobBatches.$inferSelect;
export type CashDrop = typeof cashDrops.$inferSelect;
export type CashDropAttempt = typeof cashDropAttempts.$inferSelect;

// Phase 5 — Smart notification reminders dedupe table.
// Each row records that a given reminder was sent, so the cron sweeps
// can fire each reminder exactly once per (job|cashDrop, type[, user]).
export const remindersSent = pgTable("reminders_sent", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id"),
  cashDropId: integer("cash_drop_id"),
  userId: integer("user_id"),
  reminderType: text("reminder_type").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
}, (t) => ({
  // Atomic dedupe: claim with INSERT ... ON CONFLICT DO NOTHING.
  // Per-job singleton reminders (pre_arrival, missing_otw, payout_release,
  // at_risk_poster, at_risk_worker) are keyed by (job_id, reminder_type).
  jobTypeUniq: uniqueIndex("reminders_sent_job_type_uniq")
    .on(t.jobId, t.reminderType)
    .where(sql`job_id IS NOT NULL`),
  // Per-cash-drop-per-user reminders (drop_expiring) are keyed by
  // (cash_drop_id, user_id, reminder_type). Predicate matches the
  // runtime ON CONFLICT target in claimReminder so the index can
  // actually be used to enforce the conflict (both columns NOT NULL).
  dropUserTypeUniq: uniqueIndex("reminders_sent_drop_user_type_uniq")
    .on(t.cashDropId, t.userId, t.reminderType)
    .where(sql`cash_drop_id IS NOT NULL AND user_id IS NOT NULL`),
}));
export type ReminderSent = typeof remindersSent.$inferSelect;

export const directOffers = pgTable("direct_offers", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id"),
  hirerUserId: integer("hirer_user_id").notNull(),
  workerUserId: integer("worker_user_id").notNull(),
  initialOfferAmount: real("initial_offer_amount").notNull(),
  currentOfferAmount: real("current_offer_amount").notNull(),
  counterCountHirer: integer("counter_count_hirer").default(0),
  counterCountWorker: integer("counter_count_worker").default(0),
  lastCounterBy: text("last_counter_by"),
  lastCounterPct: real("last_counter_pct"),
  category: text("category").notNull(),
  jobSummary: text("job_summary").notNull(),
  jobType: text("job_type"),
  startTiming: text("start_timing"),
  estimatedMinutes: integer("estimated_minutes"),
  estimatedDistance: text("estimated_distance"),
  location: text("location"),
  zip: text("zip"),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").notNull().default("sent"),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  agreedAt: timestamp("agreed_at"),
  declinedAt: timestamp("declined_at"),
  canceledAt: timestamp("canceled_at"),
  paidAt: timestamp("paid_at"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  fundedAt: timestamp("funded_at"),
  activatedAt: timestamp("activated_at"),
  inProgressAt: timestamp("in_progress_at"),
  proofText: text("proof_text"),
  proofPhotos: json("proof_photos").$type<string[]>(),
  proofSubmittedAt: timestamp("proof_submitted_at"),
  completedAt: timestamp("completed_at"),
  disputeId: integer("dispute_id"),
  resolvedAt: timestamp("resolved_at"),
  cancelReasonCode: text("cancel_reason_code"),
  expiryWarningSentAt: timestamp("expiry_warning_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDirectOfferSchema = createInsertSchema(directOffers).omit({
  id: true,
  createdAt: true,
  counterCountHirer: true,
  counterCountWorker: true,
  lastCounterBy: true,
  lastCounterPct: true,
  acceptedAt: true,
  agreedAt: true,
  declinedAt: true,
  canceledAt: true,
  paidAt: true,
  stripeSessionId: true,
  stripePaymentIntentId: true,
  fundedAt: true,
  activatedAt: true,
  inProgressAt: true,
  proofText: true,
  proofPhotos: true,
  proofSubmittedAt: true,
  completedAt: true,
  disputeId: true,
  resolvedAt: true,
  cancelReasonCode: true,
  expiryWarningSentAt: true,
});
export type DirectOffer = typeof directOffers.$inferSelect;
export type InsertDirectOffer = z.infer<typeof insertDirectOfferSchema>;

export const guberPayments = pgTable("guber_payments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id"),
  offerId: integer("offer_id"),
  payerUserId: integer("payer_user_id").notNull(),
  payeeUserId: integer("payee_user_id").notNull(),
  grossAmount: real("gross_amount").notNull(),
  platformFeeAmount: real("platform_fee_amount").notNull(),
  stripeFeeEstimate: real("stripe_fee_estimate"),
  netToWorker: real("net_to_worker").notNull(),
  currency: text("currency").notNull().default("usd"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeTransferId: text("stripe_transfer_id"),
  stripeApplicationFeeId: text("stripe_application_fee_id"),
  stripeBalanceTransactionIds: json("stripe_balance_transaction_ids").$type<string[]>(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  fundedAt: timestamp("funded_at"),
  releasedAt: timestamp("released_at"),
  refundedAt: timestamp("refunded_at"),
  reversedAt: timestamp("reversed_at"),
  disputedAt: timestamp("disputed_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGuberPaymentSchema = createInsertSchema(guberPayments).omit({
  id: true,
  createdAt: true,
  fundedAt: true,
  releasedAt: true,
  refundedAt: true,
  reversedAt: true,
  disputedAt: true,
  resolvedAt: true,
});
export type GuberPayment = typeof guberPayments.$inferSelect;
export type InsertGuberPayment = z.infer<typeof insertGuberPaymentSchema>;

export const moneyLedger = pgTable("money_ledger", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id"),
  jobId: integer("job_id"),
  userIdOwner: integer("user_id_owner"),
  userIdCounterparty: integer("user_id_counterparty"),
  ledgerType: text("ledger_type").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("usd"),
  sourceSystem: text("source_system").notNull().default("guber"),
  sourceReferenceId: text("source_reference_id"),
  stripeObjectType: text("stripe_object_type"),
  stripeObjectId: text("stripe_object_id"),
  description: text("description"),
  metadataJson: json("metadata_json").$type<Record<string, any>>(),
  eventTime: timestamp("event_time").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMoneyLedgerSchema = createInsertSchema(moneyLedger).omit({
  id: true,
  createdAt: true,
});
export type MoneyLedgerEntry = typeof moneyLedger.$inferSelect;
export type InsertMoneyLedgerEntry = z.infer<typeof insertMoneyLedgerSchema>;

export const guberDisputes = pgTable("guber_disputes", {
  id: serial("id").primaryKey(),
  offerId: integer("offer_id"),
  jobId: integer("job_id"),
  paymentId: integer("payment_id"),
  openedByUserId: integer("opened_by_user_id").notNull(),
  filedByRole: text("filed_by_role"),
  againstUserId: integer("against_user_id"),
  reasonCode: text("reason_code").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  resolutionType: text("resolution_type"),
  adminNotes: text("admin_notes"),
  resolvedByUserId: integer("resolved_by_user_id"),
  slaWarningSentAt: timestamp("sla_warning_sent_at"),
  // ── Dispute & Payout Protection (Task #317) — audit mirror ──────────
  issueType: text("issue_type"),
  evidenceUrls: text("evidence_urls").array(),
  helperResponse: text("helper_response"),
  helperResponseEvidenceUrls: text("helper_response_evidence_urls").array(),
  helperResponseAt: timestamp("helper_response_at"),
  helperResponseDeadline: timestamp("helper_response_deadline"),
  adminDecision: text("admin_decision"),
  adminDecisionNotes: text("admin_decision_notes"),
  adminReviewedAt: timestamp("admin_reviewed_at"),
  adminReviewedBy: integer("admin_reviewed_by"),
});

export const insertGuberDisputeSchema = createInsertSchema(guberDisputes).omit({
  id: true,
  openedAt: true,
  resolvedAt: true,
  resolution: true,
  resolutionType: true,
  adminNotes: true,
  resolvedByUserId: true,
  slaWarningSentAt: true,
  helperResponse: true,
  helperResponseEvidenceUrls: true,
  helperResponseAt: true,
  adminDecision: true,
  adminDecisionNotes: true,
  adminReviewedAt: true,
  adminReviewedBy: true,
});
export type GuberDispute = typeof guberDisputes.$inferSelect;
export type InsertGuberDispute = z.infer<typeof insertGuberDisputeSchema>;

export const cancellationLog = pgTable("cancellation_log", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull(),
  paymentId: integer("payment_id"),
  canceledByUserId: integer("canceled_by_user_id").notNull(),
  canceledByRole: text("canceled_by_role").notNull(),
  cancelReasonCode: text("cancel_reason_code").notNull(),
  freeText: text("free_text"),
  canceledAt: timestamp("canceled_at").defaultNow(),
  feeForfeitureApplied: boolean("fee_forfeiture_applied").default(false),
  stripeFeeLossAmount: real("stripe_fee_loss_amount"),
  platformFeeKeptAmount: real("platform_fee_kept_amount"),
  refundAmount: real("refund_amount"),
});

export const insertCancellationLogSchema = createInsertSchema(cancellationLog).omit({
  id: true,
  canceledAt: true,
});
export type CancellationLogEntry = typeof cancellationLog.$inferSelect;
export type InsertCancellationLogEntry = z.infer<typeof insertCancellationLogSchema>;

export const fundClaimsOrHolds = pgTable("fund_claims_or_holds", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id"),
  jobId: integer("job_id"),
  apparentOwnerUserId: integer("apparent_owner_user_id"),
  ownerRole: text("owner_role"),
  reasonCode: text("reason_code").notNull(),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("open"),
  firstNoticeAt: timestamp("first_notice_at"),
  secondNoticeAt: timestamp("second_notice_at"),
  lastContactAttemptAt: timestamp("last_contact_attempt_at"),
  dormancyStartAt: timestamp("dormancy_start_at"),
  closedAt: timestamp("closed_at"),
  closureMethod: text("closure_method"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFundClaimSchema = createInsertSchema(fundClaimsOrHolds).omit({
  id: true,
  createdAt: true,
  firstNoticeAt: true,
  secondNoticeAt: true,
  lastContactAttemptAt: true,
  dormancyStartAt: true,
  closedAt: true,
  closureMethod: true,
});
export type FundClaimOrHold = typeof fundClaimsOrHolds.$inferSelect;
export type InsertFundClaimOrHold = z.infer<typeof insertFundClaimSchema>;

export const zipGeocodeCache = pgTable("zip_geocode_cache", {
  zip: text("zip").primaryKey(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});
export type ZipGeocodeCache = typeof zipGeocodeCache.$inferSelect;

export const pinnedFindings = pgTable("pinned_findings", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").notNull(),
  content: text("content").notNull(),
  note: text("note").default(""),
  assignee: text("assignee").default(""),
  category: text("category").default(null),
  pinnedAt: timestamp("pinned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPinnedFindingSchema = createInsertSchema(pinnedFindings).omit({
  id: true,
  createdAt: true,
});
export type PinnedFinding = typeof pinnedFindings.$inferSelect;
export type InsertPinnedFinding = z.infer<typeof insertPinnedFindingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// GUBER STUDIO V2 — session-based AI generation (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────
// Generated media is TEMPORARY. Nothing is persisted to the user's profile,
// resume, or any other surface. A studio_session is created on entry,
// touched on each generation, and purged (rows + Cloudinary assets) on
// explicit exit, 30 minutes of inactivity, or 1 hour of total session age.
//
// studio_sessions       — one active per user; tracks lifecycle.
// studio_session_files  — every uploaded reference + every generated output;
//                         deleted alongside the session.
// studio_generation_log — lightweight history (prompt, cost, provider, ok)
//                         that we KEEP for analytics/abuse review. No URLs.
// studio_model_pricing  — admin-editable cost per generation.

export const studioSessions = pgTable("studio_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull().default("active"), // active | ended | expired
  startedAt: timestamp("started_at").notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  endReason: text("end_reason"), // user_exit | inactive_timeout | hard_timeout
});
export type StudioSession = typeof studioSessions.$inferSelect;

export const studioSessionFiles = pgTable("studio_session_files", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: integer("user_id").notNull(),
  fileType: text("file_type").notNull(), // upload_image | upload_video | upload_audio | output_video | output_audio
  providerUrl: text("provider_url").notNull(),
  cloudinaryPublicId: text("cloudinary_public_id"),
  resourceType: text("resource_type").notNull().default("image"), // image | video | raw
  meta: json("meta").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type StudioSessionFile = typeof studioSessionFiles.$inferSelect;

export const studioGenerationLog = pgTable("studio_generation_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  sessionId: integer("session_id"),
  toolKey: text("tool_key").notNull(),       // kling_motion_control | wan_motion | minimax_music
  prompt: text("prompt"),
  creditsCost: integer("credits_cost").notNull().default(0),
  durationSeconds: integer("duration_seconds"),
  providerJobId: text("provider_job_id"),
  status: text("status").notNull().default("succeeded"), // succeeded | refunded | failed
  errorReason: text("error_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type StudioGenerationLog = typeof studioGenerationLog.$inferSelect;

export const studioModelPricing = pgTable("studio_model_pricing", {
  id: serial("id").primaryKey(),
  toolKey: text("tool_key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  providerEndpoint: text("provider_endpoint").notNull(),
  creditsCost: integer("credits_cost").notNull().default(1),
  durationSeconds: integer("duration_seconds"),
  active: boolean("active").notNull().default(true),
  tileImageUrl: text("tile_image_url"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export type StudioModelPricing = typeof studioModelPricing.$inferSelect;

// studio_free_quota — free Quick Pic counter per user per UTC day (task-520).
// Increment atomically before each free Quick Pic; decrement on provider
// failure (mirrors the credit refund flow).
export const studioFreeQuota = pgTable("studio_free_quota", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  day: date("day").notNull(),
  usedCount: integer("used_count").notNull().default(0),
}, (t) => ({
  userDayUniq: uniqueIndex("studio_free_quota_user_day_uniq").on(t.userId, t.day),
}));
export type StudioFreeQuota = typeof studioFreeQuota.$inferSelect;

// studio_featured_clips — admin-curated "Trending now" rail above the
// Templates carousel on /studio. Each row is one looping cinematic card.
// `caption` is the prompt that gets inserted into the Studio textarea when
// the user taps "Use this prompt".
export const studioFeaturedClips = pgTable("studio_featured_clips", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  caption: text("caption").notNull(),
  videoUrl: text("video_url").notNull(),
  posterUrl: text("poster_url"),
  position: integer("position").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type StudioFeaturedClip = typeof studioFeaturedClips.$inferSelect;
export type InsertStudioFeaturedClip = Omit<StudioFeaturedClip, "id" | "createdAt">;

// studio_prompt_templates — admin-managed "Trending Templates" carousel on /studio.
// Replaces the hardcoded TEMPLATES array; if the table is empty the frontend
// falls back to its built-in defaults so the page is never blank.
export const studioPromptTemplates = pgTable("studio_prompt_templates", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  tag: text("tag").notNull().default(""),
  prompt: text("prompt").notNull(),
  gradientKey: text("gradient_key").notNull().default("from-emerald-400 via-teal-500 to-cyan-500"),
  iconKey: text("icon_key").notNull().default("zap"),
  kind: text("kind").notNull().default("video"), // video | audio | image
  videoUrl: text("video_url"),
  posterUrl: text("poster_url"),
  wizardKey: text("wizard_key"), // mirror_motion | commercial_builder | null
  position: integer("position").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type StudioPromptTemplate = typeof studioPromptTemplates.$inferSelect;
export type InsertStudioPromptTemplate = Omit<StudioPromptTemplate, "id" | "createdAt">;

// ─────────────────────────────────────────────────────────────────────────────
// QA DASHBOARD (task-462) — feature flags, tester allowlist, cash-drop events
// ─────────────────────────────────────────────────────────────────────────────

export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  rolloutScope: text("rollout_scope").notNull().default("global"), // off | global | role | allowlist
  allowedRoles: text("allowed_roles").array(),
  allowedUserIds: integer("allowed_user_ids").array(),
  note: text("note"),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type FeatureFlag = typeof featureFlags.$inferSelect;

export const testerAllowlist = pgTable("tester_allowlist", {
  id: serial("id").primaryKey(),
  itemType: text("item_type").notNull(), // job | cash_drop
  itemId: integer("item_id").notNull(),
  userId: integer("user_id").notNull(),
  invitedBy: integer("invited_by"),
  invitedAt: timestamp("invited_at").defaultNow(),
});
export type TesterAllowlist = typeof testerAllowlist.$inferSelect;

export const cashDropEvents = pgTable("cash_drop_events", {
  id: serial("id").primaryKey(),
  cashDropId: integer("cash_drop_id").notNull(),
  eventType: text("event_type").notNull(),
  reasonCode: text("reason_code"),
  actorUserId: integer("actor_user_id"),
  source: text("source"), // route | cron | webhook
  payload: json("payload").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CashDropEvent = typeof cashDropEvents.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// TASK HISTORY SUMMARY (Task #494) — permanent, lightweight per-job record.
// ─────────────────────────────────────────────────────────────────────────────
// Detailed proof media is purged after 30 days, but a one-row summary is kept
// forever so resumes, dashboards, and admin pages can still show "completed
// V&I — Vehicle Check — 2 retakes — auto-satisfied" indefinitely.
export const taskHistorySummary = pgTable("task_history_summary", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().unique(),
  posterId: integer("poster_id"),
  helperId: integer("helper_id"),
  category: text("category"),
  viCategory: text("vi_category"),
  jobType: text("job_type"),
  // V&I review summary
  proofReviewDecision: text("proof_review_decision"),  // satisfied | retake_requested | auto_satisfied | pending | none
  retakeCount: integer("retake_count").default(0),
  proofCount: integer("proof_count").default(0),
  // Outcome
  completionStatus: text("completion_status"),  // completed_paid | cancelled | disputed | refunded
  outcome: text("outcome"),                     // free-form short label
  posterRatingImpact: real("poster_rating_impact"),  // signed delta applied to poster
  workerRatingImpact: real("worker_rating_impact"),  // signed delta applied to worker
  metadata: json("metadata").$type<Record<string, any>>(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertTaskHistorySummarySchema = createInsertSchema(taskHistorySummary).omit({
  id: true,
  createdAt: true,
});
export type TaskHistorySummary = typeof taskHistorySummary.$inferSelect;
export type InsertTaskHistorySummary = z.infer<typeof insertTaskHistorySummarySchema>;

// ── Business Verify & Inspect for Companies ───────────────────────────────
export const businessVerifyRequests = pgTable("business_verify_requests", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  companyType: text("company_type"),
  assetType: text("asset_type").notNull(),
  assetName: text("asset_name").notNull(),
  identifierType: text("identifier_type"),
  identifierValue: text("identifier_value"),
  assetLocation: text("asset_location").notNull(),
  packageType: text("package_type").notNull(),
  requiredProof: text("required_proof"),
  budget: real("budget"),
  urgency: text("urgency").default("standard"),
  // draft | payment_pending | admin_review | live | accepted | proof_submitted | retake_requested | completed | disputed | cancelled
  status: text("status").default("admin_review"),
  assignedWorkerId: integer("assigned_worker_id"),
  proofSubmissionId: integer("proof_submission_id"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const businessProofSubmissions = pgTable("business_proof_submissions", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull(),
  workerId: integer("worker_id").notNull(),
  photos: text("photos").array(),
  notes: text("notes"),
  gpsLat: real("gps_lat"),
  gpsLng: real("gps_lng"),
  capturedAt: timestamp("captured_at"),
  // submitted | approved | retake_requested | disputed
  status: text("status").default("submitted"),
  submittedAt: timestamp("submitted_at").defaultNow(),
});

export const insertBusinessVerifyRequestSchema = createInsertSchema(businessVerifyRequests).omit({
  id: true, createdAt: true, updatedAt: true, status: true,
  assignedWorkerId: true, proofSubmissionId: true, completedAt: true,
});
export type BusinessVerifyRequest = typeof businessVerifyRequests.$inferSelect;
export type InsertBusinessVerifyRequest = z.infer<typeof insertBusinessVerifyRequestSchema>;
export type BusinessProofSubmission = typeof businessProofSubmissions.$inferSelect;

// ── Load Board ────────────────────────────────────────────────────────────────
// draft | posted | offer_received | offer_accepted | connection_pending | connected | in_progress | delivered | completed | cancelled | disputed
export const loadBoardListings = pgTable("load_board_listings", {
  id: serial("id").primaryKey(),
  posterId: integer("poster_id").notNull(),
  transportType: text("transport_type").notNull(), // vehicle | equipment | boat | rv | trailer | hotshot | other
  vin: text("vin"),
  vinVerified: boolean("vin_verified").default(false),
  year: text("year"),
  make: text("make"),
  model: text("model"),
  vehicleType: text("vehicle_type"), // car | truck | suv | van | motorcycle | atv_utv | other
  assetDescription: text("asset_description"),
  vehicleCondition: text("vehicle_condition").array(),
  ownershipProofStatus: text("ownership_proof_status"), // title_in_hand | bill_of_sale | auction_invoice | dealer_owned | lienholder | not_ready
  equipmentType: text("equipment_type"), // skid_steer | tractor | forklift | excavator | loader | generator | other
  boatType: text("boat_type"), // powerboat | sailboat | pontoon | jet_ski | fishing | other
  rvClass: text("rv_class"), // class_a | class_b | class_c | travel_trailer | fifth_wheel | other
  trailerType: text("trailer_type"), // utility | enclosed | car_hauler | dump | flatbed | boat_trailer | other
  freightType: text("freight_type").array(), // for hotshot: machinery | auto_parts | building_materials | pallets | oversized | other
  palletized: text("palletized"), // palletized | loose | mixed
  weightRange: text("weight_range"), // under_1k | 1k_5k | 5k_10k | 10k_20k | 20k_plus
  trailerIncluded: boolean("trailer_included").default(false),
  trailerPreference: text("trailer_preference"),
  loadingMethod: text("loading_method").array(),
  unloadingMethod: text("unloading_method").array(),
  pickupAccess: text("pickup_access").array(),
  deliveryAccess: text("delivery_access").array(),
  pickupFlexibility: text("pickup_flexibility"), // asap | today | this_week | scheduled
  deliveryFlexibility: text("delivery_flexibility"),
  loadingAssistAvailable: text("loading_assist_available"), // yes | no | unknown
  unloadingAssistAvailable: text("unloading_assist_available"),
  dockAvailable: text("dock_available"), // yes | no | unknown
  pickupZip: text("pickup_zip"),
  pickupCity: text("pickup_city").notNull(),
  pickupState: text("pickup_state").notNull(),
  deliveryZip: text("delivery_zip"),
  deliveryCity: text("delivery_city").notNull(),
  deliveryState: text("delivery_state").notNull(),
  estimatedMiles: integer("estimated_miles"),
  pricingMode: text("pricing_mode").notNull().default("fixed"), // fixed | open_to_offers
  postedPrice: real("posted_price"),
  suggestedLow: real("suggested_low"),
  suggestedHigh: real("suggested_high"),
  addonFlags: text("addon_flags").array(), // urgent_boost | enclosed_transport | winch_required | liftgate | forklift | loading_help | unloading_help | photo_proof | vin_verification | gps_tracking | premium_carrier_only
  status: text("status").notNull().default("posted"),
  urgent: boolean("urgent").default(false),
  boosted: boolean("boosted").default(false),
  connectedCarrierId: integer("connected_carrier_id"),
  connectedAt: timestamp("connected_at"),
  connectionTier: text("connection_tier"),
  connectionFeePaid: integer("connection_fee_paid"),
  // Freight trailer type system
  freightTrailerType: text("freight_trailer_type"), // dry_van | reefer | flatbed | conestoga | hotshot | power_only | step_deck | lowboy_rgn | car_hauler | other
  commodityType: text("commodity_type"),
  palletCount: integer("pallet_count"),
  dockPickup: boolean("dock_pickup"),
  dockDelivery: boolean("dock_delivery"),
  liftgateRequired: boolean("liftgate_required"),
  tempRequired: text("temp_required"), // frozen | chilled | fresh | custom
  tempValue: text("temp_value"),
  tarpRequired: boolean("tarp_required"),
  chainsRequired: boolean("chains_required"),
  strapsRequired: boolean("straps_required"),
  oversized: boolean("oversized"),
  permitRequired: boolean("permit_required"),
  escortRequired: boolean("escort_required"),
  vehicleCount: integer("vehicle_count"),
  carrierType: text("carrier_type"), // open | enclosed
  trailerNumber: text("trailer_number"),
  weatherSensitive: boolean("weather_sensitive"),
  sideLoadRequired: boolean("side_load_required"),
  hotshotTrailerType: text("hotshot_trailer_type"), // bumper_pull | gooseneck
  powerOnlyTrailerType: text("power_only_trailer_type"),
  customFreightType: text("custom_freight_type"),
  pickupDate: text("pickup_date"),
  deliveryDate: text("delivery_date"),
  weightLbs: real("weight_lbs"),
  dimensionsLength: real("dimensions_length"),
  dimensionsWidth: real("dimensions_width"),
  dimensionsHeight: real("dimensions_height"),
  activationFeePaid: boolean("activation_fee_paid").default(false),
  activationFeeSessionId: text("activation_fee_session_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertLoadBoardListingSchema = createInsertSchema(loadBoardListings).omit({
  id: true, createdAt: true, updatedAt: true, status: true,
  connectedCarrierId: true, connectedAt: true, connectionTier: true, connectionFeePaid: true,
  activationFeePaid: true, activationFeeSessionId: true,
});
export type LoadBoardListing = typeof loadBoardListings.$inferSelect;
export type InsertLoadBoardListing = z.infer<typeof insertLoadBoardListingSchema>;

export const carrierProfiles = pgTable("carrier_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  equipmentTypes: text("equipment_types").array(),
  trailerTypes: text("trailer_types").array(),
  dotNumber: text("dot_number"),
  mcNumber: text("mc_number"),
  insuranceAmount: real("insurance_amount"),
  insuranceCertUrl: text("insurance_cert_url"),
  dlPhotoUrl: text("dl_photo_url"),
  selfieUrl: text("selfie_url"),
  equipmentPhotoUrls: text("equipment_photo_urls").array(),
  acceptedPaymentMethods: text("accepted_payment_methods").array(),
  subscriptionTier: text("subscription_tier").default("basic"),
  subscriptionId: text("subscription_id"),
  completedTransports: integer("completed_transports").default(0),
  cancelledTransports: integer("cancelled_transports").default(0),
  noShows: integer("no_shows").default(0),
  identityVerified: boolean("identity_verified").default(false),
  insuranceVerified: boolean("insurance_verified").default(false),
  credentialsVerified: boolean("credentials_verified").default(false),
  offersThisMonth: integer("offers_this_month").default(0),
  offerMonthKey: text("offer_month_key"),
  gpsTrackingEnabled: boolean("gps_tracking_enabled").default(false),
  serviceArea: text("service_area"),
  bio: text("bio"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type CarrierProfile = typeof carrierProfiles.$inferSelect;

export const loadBoardOffers = pgTable("load_board_offers", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  carrierId: integer("carrier_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | countered | accepted | declined | withdrawn
  offerAmount: real("offer_amount").notNull(),
  counterAmount: real("counter_amount"),
  actionCount: integer("action_count").default(1),
  lastMovedBy: text("last_moved_by"),
  message: text("message"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type LoadBoardOffer = typeof loadBoardOffers.$inferSelect;

export const loadBoardAddons = pgTable("load_board_addons", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  posterId: integer("poster_id").notNull(),
  addonType: text("addon_type").notNull(),
  status: text("status").notNull().default("requested"),
  linkedJobId: integer("linked_job_id"),
  amountPaid: integer("amount_paid"),
  stripeSessionId: text("stripe_session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type LoadBoardAddon = typeof loadBoardAddons.$inferSelect;

export const carrierCredentials = pgTable("carrier_credentials", {
  id: serial("id").primaryKey(),
  carrierId: integer("carrier_id").notNull(),
  credentialType: text("credential_type").notNull(), // cdl | dot | mc | insurance | cargo_insurance | equipment_photo | vehicle_registration | w9
  status: text("status").notNull().default("not_submitted"), // not_submitted | pending | approved | rejected | expired
  documentUrl: text("document_url"),
  notes: text("notes"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type CarrierCredential = typeof carrierCredentials.$inferSelect;

// ── GUBER Scout: lead-generation preset listings ────────────────────────────
// Mock-scraped local business profiles staged for semi-automated outreach.
// Populated by the admin "Guber Scout" panel; each row carries an AI-drafted
// peer-to-peer outreach message and a map-ready coordinate near its ZIP.
export const presetListings = pgTable("preset_listings", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  phoneNumber: text("phone_number"),
  socialMediaUrl: text("social_media_url"),
  category: text("category").notNull(),
  zipCode: text("zip_code").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  profileSlug: text("profile_slug").notNull().unique(),
  claimedStatus: boolean("claimed_status").notNull().default(false),
  draftedMessage: text("drafted_message"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertPresetListingSchema = createInsertSchema(presetListings).omit({ id: true, createdAt: true });
export type InsertPresetListing = z.infer<typeof insertPresetListingSchema>;
export type PresetListing = typeof presetListings.$inferSelect;

// ════════════════════════════════════════════════════════════════════════════
// GUBER Verified Release System™ — Asset Custody Engine
// ────────────────────────────────────────────────────────────────────────────
// An additive, reusable custody/chain-of-control layer. The Load Board is the
// first consumer (a protected_asset links to a load_board_listing) but nothing
// here is Load-Board-specific. Core principles:
//   • custody_events is APPEND-ONLY (enforced by a Postgres rule, see
//     server/index.ts) — it is the immutable chain of custody.
//   • GPS is never trusted alone; release requires a live selfie, geofence
//     proximity, tow/trailer verification, and a mandatory VIN match.
//   • All money/state transitions are server-authoritative.
// ════════════════════════════════════════════════════════════════════════════

// The protected asset itself. One row per item under custody protection.
export const protectedAssets = pgTable("protected_assets", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(), // sender / asset owner
  // First use case: a Load Board listing. Generic by design — either may be null.
  listingId: integer("listing_id"),
  jobId: integer("job_id"), // optional linked GUBER job (witness V&I, etc.)
  assetType: text("asset_type").notNull().default("vehicle"), // vehicle | equipment | boat | rv | trailer | other
  vin: text("vin"),
  year: text("year"),
  make: text("make"),
  model: text("model"),
  description: text("description"),
  estimatedValue: real("estimated_value"),
  // Security package: none | standard ($49) | premium ($149) | elite ($299–499)
  packageTier: text("package_tier").notNull().default("none"),
  witnessAddon: boolean("witness_addon").default(false),
  // pending → active → in_transit → released → delivered → closed
  // (or disputed | frozen at any point)
  status: text("status").notNull().default("pending"),
  // Geofence lock around the pickup/origin. Release is blocked outside this.
  geofenceLat: real("geofence_lat"),
  geofenceLng: real("geofence_lng"),
  geofenceRadiusMeters: integer("geofence_radius_meters").default(250),
  founderProtected: boolean("founder_protected").default(false),
  frozenAt: timestamp("frozen_at"),
  frozenReason: text("frozen_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertProtectedAssetSchema = createInsertSchema(protectedAssets).omit({
  id: true, status: true, founderProtected: true, frozenAt: true, frozenReason: true,
  createdAt: true, updatedAt: true,
});
export type ProtectedAsset = typeof protectedAssets.$inferSelect;
export type InsertProtectedAsset = z.infer<typeof insertProtectedAssetSchema>;

// Who plays which part for a given asset (sender, carrier, witness, admin, recipient).
export const assetRoles = pgTable("asset_roles", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(), // sender | carrier | witness | admin | recipient
  status: text("status").notNull().default("active"), // active | revoked
  assignedAt: timestamp("assigned_at").defaultNow(),
});
export const insertAssetRoleSchema = createInsertSchema(assetRoles).omit({ id: true, assignedAt: true });
export type AssetRole = typeof assetRoles.$inferSelect;
export type InsertAssetRole = z.infer<typeof insertAssetRoleSchema>;

// APPEND-ONLY chain of custody. Never updated or deleted (DB rule enforced).
export const custodyEvents = pgTable("custody_events", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  actorId: integer("actor_id"), // null for system-generated events
  eventType: text("event_type").notNull(), // created | package_purchased | release_requested | release_approved | release_denied | code_issued | code_redeemed | vin_verified | vin_mismatch | tow_verified | trailer_verified | loaded | departed | in_transit | arrived | delivered | incident_reported | stored | retrieved | frozen | unfrozen | witness_assigned | witness_report | closed
  description: text("description"),
  metadata: json("metadata"),
  lat: real("lat"),
  lng: real("lng"),
  photoUrls: text("photo_urls").array(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertCustodyEventSchema = createInsertSchema(custodyEvents).omit({ id: true, createdAt: true });
export type CustodyEvent = typeof custodyEvents.$inferSelect;
export type InsertCustodyEvent = z.infer<typeof insertCustodyEventSchema>;

// A carrier's request to take custody / release the asset. Bundles the live
// selfie, GPS, and references to the tow/trailer/VIN verifications.
export const releaseAuthorizations = pgTable("release_authorizations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  requestedBy: integer("requested_by").notNull(), // carrier
  status: text("status").notNull().default("pending"), // pending | approved | denied | expired
  selfieUrl: text("selfie_url"),
  lat: real("lat"),
  lng: real("lng"),
  geofenceVerified: boolean("geofence_verified").default(false),
  geofenceMeters: integer("geofence_meters"),
  towVerificationId: integer("tow_verification_id"),
  trailerVerificationId: integer("trailer_verification_id"),
  vinVerificationId: integer("vin_verification_id"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  deniedReason: text("denied_reason"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertReleaseAuthorizationSchema = createInsertSchema(releaseAuthorizations).omit({
  id: true, status: true, approvedBy: true, approvedAt: true, deniedReason: true, createdAt: true,
});
export type ReleaseAuthorization = typeof releaseAuthorizations.$inferSelect;
export type InsertReleaseAuthorization = z.infer<typeof insertReleaseAuthorizationSchema>;

// One-time release codes. Sender shares the code; carrier redeems on hand-off.
export const releaseCodes = pgTable("release_codes", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  authorizationId: integer("authorization_id"),
  // `code` stores only a masked display value (e.g. "••••••XY"); the redeemable
  // secret is never persisted in plaintext. Validation is against `codeHash`.
  code: text("code").notNull(),
  codeHash: text("code_hash"),
  status: text("status").notNull().default("active"), // active | used | expired | revoked
  usedAt: timestamp("used_at"),
  usedBy: integer("used_by"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type ReleaseCode = typeof releaseCodes.$inferSelect;

// Tow vehicle verification (the vehicle hauling the asset).
export const towVehicleVerifications = pgTable("tow_vehicle_verifications", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  authorizationId: integer("authorization_id"),
  carrierId: integer("carrier_id").notNull(),
  vehicleType: text("vehicle_type"),
  plateNumber: text("plate_number"),
  plateState: text("plate_state"),
  photoUrls: text("photo_urls").array(),
  verified: boolean("verified").default(false),
  verifiedBy: integer("verified_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type TowVehicleVerification = typeof towVehicleVerifications.$inferSelect;

// Trailer verification (the trailer/transport the asset is loaded onto).
export const trailerVerifications = pgTable("trailer_verifications", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  authorizationId: integer("authorization_id"),
  carrierId: integer("carrier_id").notNull(),
  trailerType: text("trailer_type"),
  trailerNumber: text("trailer_number"),
  plateNumber: text("plate_number"),
  photoUrls: text("photo_urls").array(),
  verified: boolean("verified").default(false),
  verifiedBy: integer("verified_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type TrailerVerification = typeof trailerVerifications.$inferSelect;

// Mandatory VIN verification. A mismatch is a HARD BLOCK on release.
export const vinVerifications = pgTable("vin_verifications", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  authorizationId: integer("authorization_id"),
  expectedVin: text("expected_vin"),
  scannedVin: text("scanned_vin"),
  matched: boolean("matched"),
  photoUrl: text("photo_url"),
  verifiedBy: integer("verified_by"),
  status: text("status").notNull().default("pending"), // pending | matched | mismatch
  createdAt: timestamp("created_at").defaultNow(),
});
export type VinVerification = typeof vinVerifications.$inferSelect;

// The Master Transport Event — the umbrella record for one transport leg,
// tying together origin/destination, sender, carrier, and lifecycle timestamps.
export const masterTransportEvents = pgTable("master_transport_events", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  senderId: integer("sender_id").notNull(),
  carrierId: integer("carrier_id"),
  originAddress: text("origin_address"),
  originLat: real("origin_lat"),
  originLng: real("origin_lng"),
  destAddress: text("dest_address"),
  destLat: real("dest_lat"),
  destLng: real("dest_lng"),
  status: text("status").notNull().default("created"), // created | loaded | in_transit | arrived | delivered | closed
  loadedAt: timestamp("loaded_at"),
  departedAt: timestamp("departed_at"),
  arrivedAt: timestamp("arrived_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type MasterTransportEvent = typeof masterTransportEvents.$inferSelect;

// Issues raised mid-transport (route change, delay, dispute, etc.).
export const transportIssues = pgTable("transport_issues", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  masterEventId: integer("master_event_id"),
  reportedBy: integer("reported_by").notNull(),
  issueType: text("issue_type").notNull(), // route_change | delay | dispute | mechanical | other
  description: text("description"),
  status: text("status").notNull().default("open"), // open | acknowledged | resolved
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type TransportIssue = typeof transportIssues.$inferSelect;

// Incident protection records (theft, damage, accident). Drives claims.
export const incidents = pgTable("incidents", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  reportedBy: integer("reported_by").notNull(),
  incidentType: text("incident_type").notNull(), // theft | damage | accident | delay | other
  description: text("description"),
  photoUrls: text("photo_urls").array(),
  lat: real("lat"),
  lng: real("lng"),
  severity: text("severity").notNull().default("medium"), // low | medium | high | critical
  status: text("status").notNull().default("open"), // open | investigating | resolved
  protectionClaimStatus: text("protection_claim_status").notNull().default("none"), // none | filed | approved | denied | paid
  createdAt: timestamp("created_at").defaultNow(),
});
export type Incident = typeof incidents.$inferSelect;

// Storage custody events (asset placed in / pulled from a storage location).
export const storageEvents = pgTable("storage_events", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  eventType: text("event_type").notNull(), // stored | retrieved | transferred
  locationName: text("location_name"),
  lat: real("lat"),
  lng: real("lng"),
  photoUrls: text("photo_urls").array(),
  actorId: integer("actor_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type StorageEvent = typeof storageEvents.$inferSelect;

// Witness verification — fulfilled via the existing V&I system. 80/20 payout.
export const witnessAssignments = pgTable("witness_assignments", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull(),
  witnessUserId: integer("witness_user_id"),
  jobId: integer("job_id"), // linked V&I job
  status: text("status").notNull().default("open"), // open | assigned | accepted | completed | declined
  payoutAmount: real("payout_amount"),
  payoutStatus: text("payout_status").notNull().default("pending"), // pending | available | sent
  stripeTransferId: text("stripe_transfer_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type WitnessAssignment = typeof witnessAssignments.$inferSelect;

export const witnessReports = pgTable("witness_reports", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull(),
  assetId: integer("asset_id").notNull(),
  witnessUserId: integer("witness_user_id").notNull(),
  reportType: text("report_type").notNull(), // loading | release | delivery
  notes: text("notes"),
  photoUrls: text("photo_urls").array(),
  lat: real("lat"),
  lng: real("lng"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type WitnessReport = typeof witnessReports.$inferSelect;

// Stripe purchase records for protection packages, witness add-ons, founders.
export const assetProtectionPurchases = pgTable("asset_protection_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  assetId: integer("asset_id"),
  listingId: integer("listing_id"),
  productType: text("product_type").notNull(), // package | witness_addon | founders_club
  packageTier: text("package_tier"), // standard | premium | elite (for product_type=package)
  amountCents: integer("amount_cents").notNull(),
  stripeSessionId: text("stripe_session_id").unique(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status").notNull().default("pending"), // pending | paid | refunded
  fulfilledAt: timestamp("fulfilled_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AssetProtectionPurchase = typeof assetProtectionPurchases.$inferSelect;

// Singleton global state for the Founders Club (first 500 at $99, then $299).
export const foundersClubState = pgTable("founders_club_state", {
  id: serial("id").primaryKey(),
  totalClaimed: integer("total_claimed").notNull().default(0),
  capLimit: integer("cap_limit").notNull().default(500),
  founderPriceCents: integer("founder_price_cents").notNull().default(9900), // $99
  standardPriceCents: integer("standard_price_cents").notNull().default(29900), // $299
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type FoundersClubState = typeof foundersClubState.$inferSelect;

// ── GUBER Growth Engine ───────────────────────────────────────────────────────
// Growth tasks are NOT marketplace jobs. They are community engagement missions
// that earn credits (1000 cr = $1, min 25000 cr cashout) and guberScore.
// They never appear in real job counts or the paid-work flow.

export const growthTaskTemplates = pgTable("growth_task_templates", {
  id: serial("id").primaryKey(),
  emoji: text("emoji").notNull().default("📢"),
  title: text("title").notNull(),
  description: text("description"),
  rewardCredits: integer("reward_credits").notNull().default(25),
  rewardScore: integer("reward_score").notNull().default(50),
  ogBonusPct: integer("og_bonus_pct").notNull().default(25),
  category: text("category").notNull().default("community"), // community | referral | verify
  isActive: boolean("is_active").notNull().default(true),
  paused: boolean("paused").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type GrowthTaskTemplate = typeof growthTaskTemplates.$inferSelect;

// Per-scope fallback configuration (global → state → city → zip, most specific wins).
// scopeValue = '' for global, 'CA' for state, 'Los Angeles' for city, '90210' for zip.
export const zipFallbackSettings = pgTable("zip_fallback_settings", {
  id: serial("id").primaryKey(),
  scope: text("scope").notNull().default("global"), // global | state | city | zip
  scopeValue: text("scope_value").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  showWhenRealJobsExist: boolean("show_when_real_jobs_exist").notNull().default(false),
  maxTasksShown: integer("max_tasks_shown").notNull().default(6),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type ZipFallbackSetting = typeof zipFallbackSettings.$inferSelect;

// Append-only completion log — anti-abuse + analytics source of truth.
export const growthTaskCompletions = pgTable("growth_task_completions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  templateId: integer("template_id").notNull(),
  zip: text("zip"),
  creditsAwarded: integer("credits_awarded").notNull().default(0),
  scoreAwarded: integer("score_awarded").notNull().default(0),
  submissionData: json("submission_data"),
  deviceFingerprint: text("device_fingerprint"),
  ipAddress: text("ip_address"),
  lat: real("lat"),
  lng: real("lng"),
  status: text("status").notNull().default("approved"), // approved | rejected | duplicate | suspicious
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type GrowthTaskCompletion = typeof growthTaskCompletions.$inferSelect;

// Admin-editable reward config — every tunable number lives here, nothing hardcoded.
export const growthRewardConfig = pgTable("growth_reward_config", {
  key: text("key").primaryKey(),
  valueInt: integer("value_int").notNull().default(0),
  label: text("label").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type GrowthRewardConfig = typeof growthRewardConfig.$inferSelect;

// GUBER Credit Ledger — append-only audit trail for every credit event.
export const creditLedger = pgTable("credit_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(), // positive = earned, negative = spent/redeemed
  dollarEquivalent: text("dollar_equivalent").notNull().default("0.0000"),
  sourceType: text("source_type").notNull(),
  // map_mission | referral_signup | referral_verified | referral_first_job |
  // referral_biz | referral_og | admin_grant | cashout | boost_spend
  taskCompletionId: integer("task_completion_id"),
  status: text("status").notNull().default("approved"),
  // pending | approved | denied | redeemed
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  redeemedAt: timestamp("redeemed_at"),
});
export type CreditLedgerRow = typeof creditLedger.$inferSelect;

// Cashout requests — user-initiated, require admin approval.
export const cashoutRequests = pgTable("cashout_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  creditsRequested: integer("credits_requested").notNull(),
  dollarAmount: text("dollar_amount").notNull(),
  status: text("status").notNull().default("pending"),
  // pending | approved | denied | paid
  payoutMethod: text("payout_method"), // stripe | cash_app | venmo | other
  payoutDetails: text("payout_details"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by"),
});
export type CashoutRequest = typeof cashoutRequests.$inferSelect;

// ── Local Business Pins ───────────────────────────────────────────────────────
// Admin-curated local business map pins shown on the public Opportunity Map.
export const localBusinessPins = pgTable("local_business_pins", {
  id:              serial("id").primaryKey(),
  name:            text("name").notNull(),
  category:        text("category").notNull().default("Business"),
  description:     text("description"),
  address:         text("address"),
  city:            text("city"),
  state:           text("state"),
  zip:             text("zip"),
  lat:             real("lat").notNull(),
  lng:             real("lng").notNull(),
  phone:           text("phone"),
  website:         text("website"),
  logoUrl:         text("logo_url"),
  status:          text("status").notNull().default("active"),    // active | pending | inactive
  featured:        boolean("featured").notNull().default(false),
  addedByAdminId:  integer("added_by_admin_id"),
  createdAt:       timestamp("created_at").defaultNow(),
});
export type LocalBusinessPin    = typeof localBusinessPins.$inferSelect;
export type InsertLocalBusinessPin = typeof localBusinessPins.$inferInsert;

// ── Mission Instances ─────────────────────────────────────────────────────────
// Tracks a user's accepted mission through its full lifecycle.
// status: accepted → in_progress → proof_submitted → approved | rejected | expired
export const missionInstances = pgTable("mission_instances", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").notNull(),
  templateId:    integer("template_id").notNull(),
  status:        text("status").notNull().default("accepted"),
  zip:           text("zip"),
  lat:           real("lat"),
  lng:           real("lng"),
  acceptedAt:    timestamp("accepted_at").defaultNow(),
  submittedAt:   timestamp("submitted_at"),
  reviewedAt:    timestamp("reviewed_at"),
  reviewedBy:    integer("reviewed_by"),
  creditsAwarded: integer("credits_awarded").default(0),
  adminNote:     text("admin_note"),
  createdAt:     timestamp("created_at").defaultNow(),
});
export type MissionInstance       = typeof missionInstances.$inferSelect;
export type InsertMissionInstance = typeof missionInstances.$inferInsert;

// ── Mission Proofs ────────────────────────────────────────────────────────────
// One proof record per mission submission: photo (live camera only), GPS, notes.
export const missionProofs = pgTable("mission_proofs", {
  id:                serial("id").primaryKey(),
  instanceId:        integer("instance_id").notNull(),
  photoUrl:          text("photo_url"),
  gpsLat:            real("gps_lat"),
  gpsLng:            real("gps_lng"),
  capturedAt:        timestamp("captured_at"),
  businessName:      text("business_name"),
  address:           text("address"),
  notes:             text("notes"),
  deviceFingerprint: text("device_fingerprint"),
  createdAt:         timestamp("created_at").defaultNow(),
});
export type MissionProof       = typeof missionProofs.$inferSelect;
export type InsertMissionProof = typeof missionProofs.$inferInsert;

// ── Jac Homepage Interactions ─────────────────────────────────────────────────
export const jacInteractions = pgTable("jac_interactions", {
  id:          serial("id").primaryKey(),
  visitorId:   text("visitor_id").notNull(),
  userId:      integer("user_id").references(() => users.id),
  sessionId:   text("session_id"),
  intent:      text("intent"),
  messages:    jsonb("messages").$type<Array<{ role: string; content: string }>>().default([]),
  zip:         text("zip"),
  converted:   boolean("converted").default(false),
  createdAt:   timestamp("created_at").defaultNow(),
  updatedAt:   timestamp("updated_at").defaultNow(),
});
export type JacInteraction       = typeof jacInteractions.$inferSelect;
export type InsertJacInteraction = typeof jacInteractions.$inferInsert;

// ── JAC User Profile ──────────────────────────────────────────────────────────
export const jacUserProfile = pgTable("jac_user_profile", {
  userId:            integer("user_id").primaryKey().references(() => users.id),
  primaryGoal:       text("primary_goal"),
  userType:          text("user_type"),
  zipCode:           text("zip_code"),
  interests:         jsonb("interests").$type<string[]>().default([]),
  serviceNeeds:      jsonb("service_needs").$type<string[]>().default([]),
  workInterests:     jsonb("work_interests").$type<string[]>().default([]),
  transportInterest: boolean("transport_interest").default(false),
  creatorInterest:   boolean("creator_interest").default(false),
  creatorPlatforms:  jsonb("creator_platforms").$type<string[]>().default([]),
  businessOwner:     boolean("business_owner").default(false),
  serviceProvider:   boolean("service_provider").default(false),
  retired:           boolean("retired").default(false),
  prefersVoice:                boolean("prefers_voice").default(false),
  assistantMode:               text("assistant_mode").default("full"),
  startupBehavior:             text("startup_behavior").default("show_summary"),
  voiceEnabled:                boolean("voice_enabled").default(true),
  textResponses:               boolean("text_responses").default(true),
  voiceActivation:             boolean("voice_activation").default(false),
  floatingButton:              boolean("floating_button").default(true),
  proactiveSuggestions:        boolean("proactive_suggestions").default(true),
  personalizedRecommendations: boolean("personalized_recommendations").default(true),
  voiceSelection:              text("voice_selection").default("default"),
  lowDataMode:                 boolean("low_data_mode").default(false),
  language:                    text("language").default("en"),
  tutorialStatus:              text("tutorial_status").default("not_started"),
  lastJacSummary:              jsonb("last_jac_summary").$type<Record<string, unknown>>().default({}),
  memoryConsent:               text("memory_consent").default("unset"), // unset | granted | denied
  updatedAt:                   timestamp("updated_at").defaultNow(),
});
export type JacUserProfile       = typeof jacUserProfile.$inferSelect;
export type InsertJacUserProfile = typeof jacUserProfile.$inferInsert;

// ── JAC Tutorial State ────────────────────────────────────────────────────────
export const jacTutorialState = pgTable("jac_tutorial_state", {
  userId:                 integer("user_id").primaryKey().references(() => users.id),
  tutorialStarted:        boolean("tutorial_started").default(false),
  tutorialCompleted:      boolean("tutorial_completed").default(false),
  selectedGoal:           text("selected_goal"),
  completedSteps:         jsonb("completed_steps").$type<string[]>().default([]),
  skippedSteps:           jsonb("skipped_steps").$type<string[]>().default([]),
  lastTutorialScreen:     text("last_tutorial_screen"),
  needsFollowup:          boolean("needs_followup").default(false),
  resetCount:             integer("reset_count").default(0),
  lastSeenFeatureVersion: text("last_seen_feature_version").default("1.0"),
  updatedAt:              timestamp("updated_at").defaultNow(),
});
export type JacTutorialState       = typeof jacTutorialState.$inferSelect;
export type InsertJacTutorialState = typeof jacTutorialState.$inferInsert;

// ── JAC Missed Actions ────────────────────────────────────────────────────────
export const jacMissedActions = pgTable("jac_missed_actions", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").references(() => users.id).notNull(),
  actionType:  text("action_type").notNull(),
  priority:    text("priority").default("medium"),
  title:       text("title").notNull(),
  description: text("description"),
  route:       text("route"),
  ctaLabel:    text("cta_label"),
  status:      text("status").default("active"),
  createdAt:   timestamp("created_at").defaultNow(),
  dismissedAt: timestamp("dismissed_at"),
  remindAt:    timestamp("remind_at"),
});
export type JacMissedAction       = typeof jacMissedActions.$inferSelect;
export type InsertJacMissedAction = typeof jacMissedActions.$inferInsert;

// ── JAC Knowledge Base ────────────────────────────────────────────────────────
export const jacKnowledge = pgTable("jac_knowledge", {
  id:              serial("id").primaryKey(),
  category:        text("category").notNull(),
  title:           text("title").notNull(),
  questionPatterns:jsonb("question_patterns").$type<string[]>().default([]),
  keywords:        jsonb("keywords").$type<string[]>().default([]),
  answer:          text("answer").notNull(),
  followUpActions: jsonb("follow_up_actions").$type<Array<{ label: string; message: string }>>().default([]),
  active:          boolean("active").default(true),
  adminApproved:   boolean("admin_approved").default(true),
  hitCount:        integer("hit_count").default(0),
  createdBy:       text("created_by").default("system"),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
});
export type JacKnowledge       = typeof jacKnowledge.$inferSelect;
export type InsertJacKnowledge = typeof jacKnowledge.$inferInsert;

// ── System Issues (JAC System Guardian telemetry) ─────────────────────────────
// Rich end-to-end failure reports captured across web / iOS / Android. Deduped
// by fingerprint = md5(module + normalized error + route + platform); repeat
// occurrences bump occurrence_count + last_seen instead of inserting new rows.
// Severity is ALWAYS classified server-side — never trusted from the client.
export const systemIssues = pgTable("system_issues", {
  id:              serial("id").primaryKey(),
  fingerprint:     text("fingerprint").notNull().unique(),
  userId:          integer("user_id"),
  platform:        text("platform").default("web"),        // web | ios | android
  device:          text("device"),
  appVersion:      text("app_version"),
  route:           text("route"),
  module:          text("module").notNull(),               // payment | login | upload | gps | map | wallet | studio | network | client | general
  attemptedAction: text("attempted_action"),
  errorMessage:    text("error_message"),
  relatedIds:      jsonb("related_ids").$type<Record<string, string | number>>().default({}),
  severity:        text("severity").default("medium"),     // low | medium | high | critical
  blocked:         boolean("blocked").default(false),
  steps:           jsonb("steps").$type<string[]>().default([]),
  screenshotUrl:   text("screenshot_url"),
  gpsPermission:   text("gps_permission"),
  occurrenceCount: integer("occurrence_count").default(1),
  firstSeen:       timestamp("first_seen").defaultNow(),
  lastSeen:        timestamp("last_seen").defaultNow(),
  status:          text("status").default("open"),         // open | ack | resolved
  // ── 24/7 Smart Monitoring additions ──
  affectedUserIds: jsonb("affected_user_ids").$type<number[]>().default([]), // distinct users hit (capped)
  source:          text("source").default("user_event"),   // user_event | health_probe
  suggestedFix:    text("suggested_fix"),                   // static remediation hint (self-healing prep)
  aiDiagnosis:     jsonb("ai_diagnosis").$type<Record<string, string>>(), // { whatBroke, whereBroke, whoAffected, likelyCause, suggestedFix, urgency }
  aiDiagnosedAt:   timestamp("ai_diagnosed_at"),            // set atomically BEFORE the OpenAI call — guarantees once-per-fingerprint
});
export const insertSystemIssueSchema = createInsertSchema(systemIssues).omit({
  id: true, fingerprint: true, severity: true, occurrenceCount: true,
  firstSeen: true, lastSeen: true, status: true,
});
export type SystemIssue       = typeof systemIssues.$inferSelect;
export type InsertSystemIssue = z.infer<typeof insertSystemIssueSchema>;

// ── JAC Intents ───────────────────────────────────────────────────────────────
export const jacIntents = pgTable("jac_intents", {
  id:                serial("id").primaryKey(),
  intentName:        text("intent_name").unique().notNull(),
  displayName:       text("display_name").notNull(),
  samplePhrases:     jsonb("sample_phrases").$type<string[]>().default([]),
  requiredFields:    jsonb("required_fields").$type<string[]>().default([]),
  targetFlow:        text("target_flow"),
  targetRoute:       text("target_route"),
  backendAction:     text("backend_action"),
  followUpQuestions: jsonb("follow_up_questions").$type<string[]>().default([]),
  fallbackResponse:  text("fallback_response"),
  active:            boolean("active").default(true),
  hitCount:          integer("hit_count").default(0),
  createdAt:         timestamp("created_at").defaultNow(),
  updatedAt:         timestamp("updated_at").defaultNow(),
});
export type JacIntent       = typeof jacIntents.$inferSelect;
export type InsertJacIntent = typeof jacIntents.$inferInsert;

// ── JAC Response Cache ────────────────────────────────────────────────────────
export const jacResponseCache = pgTable("jac_response_cache", {
  id:           serial("id").primaryKey(),
  cacheKey:     text("cache_key").unique().notNull(),
  questionText: text("question_text").notNull(),
  answerText:   text("answer_text").notNull(),
  intentName:   text("intent_name"),
  source:       text("source").default("ai_approved"),
  adminApproved:boolean("admin_approved").default(false),
  hitCount:     integer("hit_count").default(0),
  lastHitAt:    timestamp("last_hit_at"),
  createdAt:    timestamp("created_at").defaultNow(),
});
export type JacResponseCache       = typeof jacResponseCache.$inferSelect;
export type InsertJacResponseCache = typeof jacResponseCache.$inferInsert;

// ── JAC Memory (living user profile) ──────────────────────────────────────────
export const jacMemory = pgTable("jac_memory", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => users.id),
  category:  text("category").notNull(), // personal | work | marketplace | vi | load_board | preferences
  key:       text("key").notNull(),
  value:     jsonb("value").$type<unknown>().notNull(),
  source:    text("source").default("user_said"), // user_said | extracted | system
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type JacMemoryEntry       = typeof jacMemory.$inferSelect;
export type InsertJacMemoryEntry = typeof jacMemory.$inferInsert;

export const jacFeedbackReports = pgTable("jac_feedback_reports", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").references(() => users.id),
  userEmail:       text("user_email"),
  platform:        text("platform"),
  deviceInfo:      text("device_info"),
  currentRoute:    text("current_route"),
  issueCategory:   text("issue_category"), // mic_failure|voice_failure|listing_interruption|payment_issue|gps_issue|form_problem|app_bug|general
  userDescription: text("user_description"),
  jacMessages:     jsonb("jac_messages").$type<Array<{role:string;content:string}>>().default([]),
  status:          text("status").notNull().default("new"), // new|reviewed|fixed|dismissed
  adminNotes:      text("admin_notes"),
  createdAt:       timestamp("created_at").defaultNow(),
  updatedAt:       timestamp("updated_at").defaultNow(),
});
export type JacFeedbackReport       = typeof jacFeedbackReports.$inferSelect;
export type InsertJacFeedbackReport = typeof jacFeedbackReports.$inferInsert;

// ── JAC Pending Actions (confirm-before-submit workflow execution) ────────────
export const jacPendingActions = pgTable("jac_pending_actions", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").notNull().references(() => users.id),
  actionType: text("action_type").notNull(), // post_job | marketplace_listing | transport_request | vi_request
  payload:    jsonb("payload").$type<Record<string, unknown>>().notNull(),
  summary:    text("summary").notNull(),
  status:     text("status").notNull().default("pending"), // pending | confirmed | executed | failed | cancelled | expired
  resultBody: jsonb("result_body").$type<Record<string, unknown>>(),
  createdAt:  timestamp("created_at").defaultNow(),
  expiresAt:  timestamp("expires_at"),
});
export type JacPendingAction       = typeof jacPendingActions.$inferSelect;
export type InsertJacPendingAction = typeof jacPendingActions.$inferInsert;

// ── JAC Voice Usage Log (TTS/STT credit + reliability tracking) ──────────────
export const jacVoiceUsageLog = pgTable("jac_voice_usage_log", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").references(() => users.id),
  type:       text("type").notNull(), // tts | stt
  provider:   text("provider").notNull(), // elevenlabs | whisper | web_speech | static_cache
  voiceId:    text("voice_id"),
  units:      integer("units").notNull(), // tts: chars sent | stt: audio bytes
  success:    boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  ip:         text("ip"),
  latencyMs:  integer("latency_ms"), // time from request received to response sent
  createdAt:  timestamp("created_at").defaultNow(),
});
export type JacVoiceUsageLog       = typeof jacVoiceUsageLog.$inferSelect;
export type InsertJacVoiceUsageLog = typeof jacVoiceUsageLog.$inferInsert;

// ── GUBER Campaign Lab ────────────────────────────────────────────────────────

// Per-tool dollar cost registry (admin-editable, stored in cents)
export const campaignLabToolCosts = pgTable("campaign_lab_tool_costs", {
  id:          serial("id").primaryKey(),
  toolKey:     text("tool_key").unique().notNull(),
  displayName: text("display_name").notNull(),
  costCents:   integer("cost_cents").notNull().default(0),
  description: text("description"),
  active:      boolean("active").default(true),
  updatedAt:   timestamp("updated_at").defaultNow(),
});
export type CampaignLabToolCost       = typeof campaignLabToolCosts.$inferSelect;
export type InsertCampaignLabToolCost = typeof campaignLabToolCosts.$inferInsert;

// Global/monthly AI budget + kill switch (singleton row id=1)
export const campaignLabBudgetConfig = pgTable("campaign_lab_budget_config", {
  id:                   integer("id").primaryKey().default(1),
  monthlyBudgetCents:   integer("monthly_budget_cents").default(50000),
  monthlySpentCents:    integer("monthly_spent_cents").default(0),
  budgetMonthYear:      text("budget_month_year"),
  aiKillSwitch:         boolean("ai_kill_switch").default(false),
  updatedAt:            timestamp("updated_at").defaultNow(),
  updatedByUserId:      integer("updated_by_user_id").references(() => users.id),
});
export type CampaignLabBudgetConfig = typeof campaignLabBudgetConfig.$inferSelect;

// Brand knowledge chunks injected into every AI prompt
export const campaignLabBrandContext = pgTable("campaign_lab_brand_context", {
  id:        serial("id").primaryKey(),
  category:  text("category").notNull(),
  title:     text("title").notNull(),
  content:   text("content").notNull(),
  isActive:  boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type CampaignLabBrandContext       = typeof campaignLabBrandContext.$inferSelect;
export type InsertCampaignLabBrandContext = typeof campaignLabBrandContext.$inferInsert;

// Asset library (logos, music, templates, screenshots, etc.)
export const campaignLabAssets = pgTable("campaign_lab_assets", {
  id:                 serial("id").primaryKey(),
  category:          text("category").notNull(),
  name:              text("name").notNull(),
  description:       text("description"),
  url:               text("url").notNull(),
  cloudinaryPublicId:text("cloudinary_public_id"),
  fileType:          text("file_type").notNull(),
  mimeType:          text("mime_type"),
  tags:              jsonb("tags").$type<string[]>().default([]),
  isApproved:        boolean("is_approved").default(true),
  uploadedByUserId:  integer("uploaded_by_user_id").references(() => users.id),
  createdAt:         timestamp("created_at").defaultNow(),
});
export type CampaignLabAsset       = typeof campaignLabAssets.$inferSelect;
export type InsertCampaignLabAsset = typeof campaignLabAssets.$inferInsert;

// Campaign definitions
export const campaignLabCampaigns = pgTable("campaign_lab_campaigns", {
  id:                serial("id").primaryKey(),
  title:             text("title").notNull(),
  description:       text("description"),
  goal:              text("goal"),
  audience:          text("audience"),
  approvedMessaging: text("approved_messaging"),
  requiredCta:       text("required_cta"),
  hashtags:          jsonb("hashtags").$type<string[]>().default([]),
  budgetCents:       integer("budget_cents").default(0),
  spentCents:        integer("spent_cents").default(0),
  status:            text("status").notNull().default("draft"),
  dueDate:           timestamp("due_date"),
  coverImageUrl:     text("cover_image_url"),
  createdByUserId:   integer("created_by_user_id").references(() => users.id),
  createdAt:         timestamp("created_at").defaultNow(),
  updatedAt:         timestamp("updated_at").defaultNow(),
});
export type CampaignLabCampaign       = typeof campaignLabCampaigns.$inferSelect;
export type InsertCampaignLabCampaign = typeof campaignLabCampaigns.$inferInsert;

// Creator assignments to campaigns (with per-creator spending limits)
export const campaignLabCreatorAssignments = pgTable("campaign_lab_creator_assignments", {
  id:                serial("id").primaryKey(),
  userId:            integer("user_id").notNull().references(() => users.id),
  campaignId:        integer("campaign_id").notNull().references(() => campaignLabCampaigns.id),
  spendingLimitCents:integer("spending_limit_cents").default(2500),
  spentCents:        integer("spent_cents").default(0),
  active:            boolean("active").default(true),
  assignedAt:        timestamp("assigned_at").defaultNow(),
  assignedByUserId:  integer("assigned_by_user_id").references(() => users.id),
});
export type CampaignLabCreatorAssignment       = typeof campaignLabCreatorAssignments.$inferSelect;
export type InsertCampaignLabCreatorAssignment = typeof campaignLabCreatorAssignments.$inferInsert;

// Individual work items (script → storyboard → video approval gates)
export const campaignLabWorkItems = pgTable("campaign_lab_work_items", {
  id:               serial("id").primaryKey(),
  userId:           integer("user_id").notNull().references(() => users.id),
  campaignId:       integer("campaign_id").notNull().references(() => campaignLabCampaigns.id),
  title:            text("title").notNull(),
  type:             text("type").notNull(),
  status:           text("status").notNull().default("draft"),
  content:          text("content"),
  assetUrl:         text("asset_url"),
  cloudinaryPublicId:text("cloudinary_public_id"),
  aiPromptUsed:     text("ai_prompt_used"),
  notes:            text("notes"),
  reviewerFeedback: text("reviewer_feedback"),
  reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
  reviewedAt:       timestamp("reviewed_at"),
  parentWorkItemId: integer("parent_work_item_id"),
  createdAt:        timestamp("created_at").defaultNow(),
  updatedAt:        timestamp("updated_at").defaultNow(),
});
export type CampaignLabWorkItem       = typeof campaignLabWorkItems.$inferSelect;
export type InsertCampaignLabWorkItem = typeof campaignLabWorkItems.$inferInsert;

// Every AI generation — dollar cost tracked per creator/campaign
export const campaignLabGenerationLog = pgTable("campaign_lab_generation_log", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").notNull().references(() => users.id),
  campaignId:    integer("campaign_id").references(() => campaignLabCampaigns.id),
  workItemId:    integer("work_item_id").references(() => campaignLabWorkItems.id),
  toolKey:       text("tool_key").notNull(),
  costCents:     integer("cost_cents").notNull().default(0),
  status:        text("status").notNull().default("success"),
  promptUsed:    text("prompt_used"),
  outputUrl:     text("output_url"),
  providerJobId: text("provider_job_id"),
  createdAt:     timestamp("created_at").defaultNow(),
});
export type CampaignLabGenerationLog       = typeof campaignLabGenerationLog.$inferSelect;
export type InsertCampaignLabGenerationLog = typeof campaignLabGenerationLog.$inferInsert;
