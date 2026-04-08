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
  trustBoxPurchased: boolean("trust_box_purchased").default(false),
  trustBoxSubscriptionId: text("trust_box_subscription_id"),
  monthlyImageUploads: integer("monthly_image_uploads").default(0),
  monthlyVideoUploads: integer("monthly_video_uploads").default(0),
  uploadMonthYear: text("upload_month_year"),
  lat: real("lat"),
  lng: real("lng"),
  idDocumentType: text("id_document_type"),
  guberId: text("guber_id").unique(),
  publicUsername: text("public_username").unique(),
  referralCode: text("referral_code").unique(),
  referredBy: integer("referred_by"),
  referralCount: integer("referral_count").default(0),
  referralFeePct: real("referral_fee_pct").default(0),
  referralDiscountExpiresAt: timestamp("referral_discount_expires_at"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  accountType: text("account_type").default("personal"),
  stripeProfileType: text("stripe_profile_type"),
  createdAt: timestamp("created_at").defaultNow(),
  notifNearbyJobs: boolean("notif_nearby_jobs").default(true),
  notifMessages: boolean("notif_messages").default(true),
  notifJobUpdates: boolean("notif_job_updates").default(true),
  notifCashDrops: boolean("notif_cash_drops").default(true),
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
  proofRequired: boolean("proof_required").default(false),
  proofTemplateId: integer("proof_template_id"),
  proofStatus: text("proof_status"),
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

export const marketplaceItems = pgTable("marketplace_items", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  condition: text("condition"),
  price: real("price"),
  askingType: text("asking_type").default("fixed"),
  photos: json("photos").$type<string[]>(),
  zipcode: text("zipcode"),
  locationApprox: text("location_approx"),
  status: text("status").default("active"),
  guberVerified: boolean("guber_verified").default(false),
  verificationDate: timestamp("verification_date"),
  verifiedByUserId: integer("verified_by_user_id"),
  verifiedByName: text("verified_by_name"),
  viJobId: integer("vi_job_id"),
  verificationNotes: text("verification_notes"),
  sellerName: text("seller_name"),
  boosted: boolean("boosted").default(false),
  boostedUntil: timestamp("boosted_until"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMarketplaceItemSchema = createInsertSchema(marketplaceItems).omit({
  id: true,
  createdAt: true,
  guberVerified: true,
  verificationDate: true,
  verifiedByUserId: true,
  verifiedByName: true,
});

export type MarketplaceItem = typeof marketplaceItems.$inferSelect;
export type InsertMarketplaceItem = z.infer<typeof insertMarketplaceItemSchema>;

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
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
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
