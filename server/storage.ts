import {
  users, jobs, categories, serviceTypes, assignments, timesheets,
  notifications, reviews, strikeRecords, proofSubmissions, walletTransactions,
  viCategories, useCases, catalogServiceTypes, detailOptionSets,
  proofTemplates, proofChecklistItems, auditLogs, passwordResetTokens,
  marketplaceItems, jobStatusLogs, bountyAttempts,
  businessProfiles, bulkJobBatches, cashDrops, cashDropAttempts, servicePricingConfig,
  workerQualifications, observations, dropSponsors,
  businessAccounts, businessPlans, businessCandidateUnlocks, businessOffers,
  workerBusinessProjections, backgroundCheckEligibility, billingEvents, legalAcceptances,
  directOffers, guberPayments, moneyLedger, guberDisputes, cancellationLog, fundClaimsOrHolds,
  type User, type InsertUser, type Job, type InsertJob,
  type Category, type ServiceType, type Assignment, type Timesheet,
  type Notification, type Review, type StrikeRecord, type ProofSubmission,
  type WalletTransaction, type VICategory, type UseCase, type CatalogServiceType,
  type DetailOptionSet, type ProofTemplate, type ProofChecklistItem, type AuditLog,
  type MarketplaceItem, type JobStatusLog, type BountyAttempt,
  type BusinessProfile, type CashDrop, type CashDropAttempt, type ServicePricingConfig,
  type WorkerQualification, type Observation, type DropSponsor,
  type BusinessAccount, type BusinessPlan, type BusinessCandidateUnlock,
  type BusinessOffer, type WorkerBusinessProjection, type BackgroundCheckEligibility,
  type BillingEvent, type LegalAcceptance,
  type DirectOffer, type GuberPayment, type MoneyLedgerEntry,
  type GuberDispute, type CancellationLogEntry, type FundClaimOrHold,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, isNotNull, count, inArray, lt, isNull } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByGuberId(guberId: string): Promise<User | undefined>;
  getUserByPublicUsername(publicUsername: string): Promise<User | undefined>;
  createUser(user: any): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;

  getJobs(onlyPublished?: boolean): Promise<Job[]>;
  getJob(id: number): Promise<Job | undefined>;
  getJobsByCategory(category: string): Promise<Job[]>;
  getJobsByUser(userId: number): Promise<Job[]>;
  getUserJobs(userId: number): Promise<Job[]>;
  createJob(job: any): Promise<Job>;
  updateJob(id: number, data: Partial<Job>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<void>;
  adminRemoveJob(id: number, reason: string): Promise<void>;

  getCategories(): Promise<Category[]>;
  createCategory(name: string, icon?: string, color?: string): Promise<Category>;

  getServiceTypes(): Promise<ServiceType[]>;
  getServiceTypesByCategory(category: string): Promise<ServiceType[]>;
  createServiceType(data: any): Promise<ServiceType>;

  getVICategories(): Promise<VICategory[]>;
  createVICategory(data: any): Promise<VICategory>;

  getUseCases(): Promise<UseCase[]>;
  getUseCasesByVICategory(viCategoryId: number): Promise<UseCase[]>;
  createUseCase(data: any): Promise<UseCase>;

  getCatalogServiceTypes(): Promise<CatalogServiceType[]>;
  getCatalogServiceTypesByUseCase(useCaseId: number): Promise<CatalogServiceType[]>;
  createCatalogServiceType(data: any): Promise<CatalogServiceType>;

  getDetailOptionSets(): Promise<DetailOptionSet[]>;
  getDetailOptionSetsByUseCase(useCaseId: number): Promise<DetailOptionSet[]>;
  getDetailOptionSetsByVICategory(viCategoryId: number): Promise<DetailOptionSet[]>;
  createDetailOptionSet(data: any): Promise<DetailOptionSet>;

  getProofTemplates(): Promise<ProofTemplate[]>;
  getProofTemplate(id: number): Promise<ProofTemplate | undefined>;
  createProofTemplate(data: any): Promise<ProofTemplate>;
  updateProofTemplate(id: number, data: Partial<ProofTemplate>): Promise<ProofTemplate | undefined>;

  getProofChecklistItems(templateId: number): Promise<ProofChecklistItem[]>;
  createProofChecklistItem(data: any): Promise<ProofChecklistItem>;

  getJobChecklists(category: string, serviceTypeName?: string): Promise<DetailOptionSet[]>;
  createJobChecklist(data: any): Promise<DetailOptionSet>;
  updateJobChecklist(id: number, data: Partial<DetailOptionSet>): Promise<DetailOptionSet | undefined>;
  deleteJobChecklist(id: number): Promise<void>;

  createAssignment(data: any): Promise<Assignment>;
  getAssignmentsByJob(jobId: number): Promise<Assignment[]>;
  updateAssignment(id: number, data: Partial<Assignment>): Promise<Assignment>;

  createTimesheet(data: any): Promise<Timesheet>;
  getTimesheetsByAssignment(assignmentId: number): Promise<Timesheet[]>;

  getNotificationsByUser(userId: number): Promise<Notification[]>;
  createNotification(data: any): Promise<Notification>;
  markNotificationRead(id: number): Promise<void>;
  markAllNotificationsRead(userId: number): Promise<void>;

  createReview(data: any): Promise<Review>;
  getReviewsByUser(userId: number): Promise<Review[]>;
  getReviewsByJob(jobId: number): Promise<Review[]>;

  createStrike(data: any): Promise<StrikeRecord>;
  getStrikesByUser(userId: number): Promise<StrikeRecord[]>;

  createProofSubmission(data: any): Promise<ProofSubmission>;
  getProofsByJob(jobId: number): Promise<ProofSubmission[]>;

  createWalletTransaction(data: any): Promise<WalletTransaction>;
  getWalletByUser(userId: number): Promise<WalletTransaction[]>;
  updateWalletTransaction(id: number, data: Partial<WalletTransaction>): Promise<WalletTransaction | undefined>;

  createAuditLog(data: any): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  getJobCountsByZip(): Promise<{ zip: string; count: number }[]>;
  getOpenJobsForMap(): Promise<Job[]>;
  getAvailableWorkers(): Promise<User[]>;

  getUserByGoogleSub(googleSub: string): Promise<User | undefined>;
  createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void>;
  getPasswordResetToken(token: string): Promise<{ userId: number; expiresAt: Date; used: boolean } | undefined>;
  invalidatePasswordResetToken(token: string): Promise<void>;

  createJobStatusLog(data: any): Promise<JobStatusLog>;
  getJobStatusLogs(jobId: number): Promise<JobStatusLog[]>;
  computeAndUpdateReliability(userId: number): Promise<void>;
  maybeUnderReview(userId: number): Promise<void>;

  getBountyAttempts(jobId: number): Promise<BountyAttempt[]>;
  getBountyAttempt(id: number): Promise<BountyAttempt | undefined>;
  createBountyAttempt(data: any): Promise<BountyAttempt>;
  updateBountyAttempt(id: number, data: Partial<BountyAttempt>): Promise<BountyAttempt | undefined>;
  getHelperAttemptCount(jobId: number, helperId: number): Promise<number>;

  getBusinessProfile(userId: number): Promise<BusinessProfile | undefined>;
  createBusinessProfile(data: any): Promise<BusinessProfile>;
  updateBusinessProfile(userId: number, data: Partial<BusinessProfile>): Promise<BusinessProfile | undefined>;

  createBulkJobBatch(data: any): Promise<any>;

  getDropSponsors(status?: string): Promise<DropSponsor[]>;
  getDropSponsor(id: number): Promise<DropSponsor | undefined>;
  createDropSponsor(data: any): Promise<DropSponsor>;
  updateDropSponsor(id: number, data: any): Promise<DropSponsor | undefined>;

  getCashDrops(): Promise<CashDrop[]>;
  getActiveCashDrops(): Promise<CashDrop[]>;
  getCashDrop(id: number): Promise<CashDrop | undefined>;
  createCashDrop(data: any): Promise<CashDrop>;
  updateCashDrop(id: number, data: Partial<CashDrop>): Promise<CashDrop | undefined>;
  deleteCashDrop(id: number): Promise<void>;

  getCashDropAttempt(id: number): Promise<CashDropAttempt | undefined>;
  getCashDropAttemptByUser(cashDropId: number, userId: number): Promise<CashDropAttempt | undefined>;
  getCashDropAttempts(cashDropId: number): Promise<CashDropAttempt[]>;
  createCashDropAttempt(data: any): Promise<CashDropAttempt>;
  updateCashDropAttempt(id: number, data: Partial<CashDropAttempt>): Promise<CashDropAttempt | undefined>;

  getServicePricingConfig(category: string, serviceTypeName: string): Promise<import("@shared/schema").ServicePricingConfig | undefined>;
  getAllServicePricingConfigs(): Promise<import("@shared/schema").ServicePricingConfig[]>;

  getWorkerQualifications(userId: number): Promise<WorkerQualification[]>;
  getAllPendingQualifications(): Promise<WorkerQualification[]>;
  createQualification(data: any): Promise<WorkerQualification>;
  updateQualification(id: number, data: Partial<WorkerQualification>): Promise<WorkerQualification | undefined>;

  createObservation(data: any): Promise<Observation>;
  getObservation(id: number): Promise<Observation | undefined>;
  getObservations(filters?: { type?: string; city?: string; state?: string; zip?: string; status?: string; lat?: number; lng?: number; radius?: number }): Promise<Observation[]>;
  getObservationsByHelper(helperId: number): Promise<Observation[]>;
  claimObservationForPurchase(id: number, companyId: number, price: number): Promise<Observation | null>;
  updateObservation(id: number, data: Partial<Observation>): Promise<Observation | undefined>;
  expireOldObservations(): Promise<number>;

  getBusinessAccount(ownerUserId: number): Promise<BusinessAccount | undefined>;
  getBusinessAccountById(id: number): Promise<BusinessAccount | undefined>;
  createBusinessAccount(data: any): Promise<BusinessAccount>;
  updateBusinessAccount(id: number, data: Partial<BusinessAccount>): Promise<BusinessAccount | undefined>;
  getAllBusinessAccounts(status?: string): Promise<BusinessAccount[]>;

  getBusinessPlan(businessAccountId: number): Promise<BusinessPlan | undefined>;
  createBusinessPlan(data: any): Promise<BusinessPlan>;
  updateBusinessPlan(id: number, data: Partial<BusinessPlan>): Promise<BusinessPlan | undefined>;

  getBusinessUnlock(businessAccountId: number, userId: number): Promise<BusinessCandidateUnlock | undefined>;
  getBusinessUnlocks(businessAccountId: number): Promise<BusinessCandidateUnlock[]>;
  createBusinessUnlock(data: any): Promise<BusinessCandidateUnlock>;

  getBusinessOffers(businessAccountId: number): Promise<BusinessOffer[]>;
  getBusinessOffersByUser(userId: number): Promise<BusinessOffer[]>;
  getBusinessOffer(id: number): Promise<BusinessOffer | undefined>;
  createBusinessOffer(data: any): Promise<BusinessOffer>;
  updateBusinessOffer(id: number, data: Partial<BusinessOffer>): Promise<BusinessOffer | undefined>;

  getWorkerProjection(userId: number): Promise<WorkerBusinessProjection | undefined>;
  upsertWorkerProjection(data: any): Promise<WorkerBusinessProjection>;
  searchWorkerProjections(filters: {
    lat?: number; lng?: number; radiusMiles?: number;
    category?: string; minJobs?: number; minRating?: number;
    minCompletionRate?: number; mobilityType?: string;
    idVerified?: boolean; backgroundVerified?: boolean;
    availability?: string; recentActivity?: boolean;
    limit?: number; offset?: number;
  }): Promise<WorkerBusinessProjection[]>;

  getBackgroundCheckEligibility(userId: number): Promise<BackgroundCheckEligibility | undefined>;
  createBackgroundCheckEligibility(data: any): Promise<BackgroundCheckEligibility>;
  updateBackgroundCheckEligibility(userId: number, data: Partial<BackgroundCheckEligibility>): Promise<BackgroundCheckEligibility | undefined>;

  createBillingEvent(data: any): Promise<BillingEvent>;
  getBillingEvents(businessAccountId: number): Promise<BillingEvent[]>;

  createLegalAcceptance(data: any): Promise<LegalAcceptance>;
  getLegalAcceptances(actorType: string, actorId: number): Promise<LegalAcceptance[]>;

  createDirectOffer(data: any): Promise<DirectOffer>;
  getDirectOffer(id: number): Promise<DirectOffer | undefined>;
  getDirectOffersByHirer(hirerUserId: number): Promise<DirectOffer[]>;
  getDirectOffersByWorker(workerUserId: number): Promise<DirectOffer[]>;
  updateDirectOffer(id: number, data: Partial<DirectOffer>): Promise<DirectOffer | undefined>;
  getExpiredOffers(): Promise<DirectOffer[]>;
  getSoonExpiringOffers(): Promise<DirectOffer[]>;
  getDirectOffersByStatus(status: string): Promise<DirectOffer[]>;

  getDirectOfferByStripeSession(sessionId: string): Promise<DirectOffer | undefined>;

  createGuberPayment(data: any): Promise<GuberPayment>;
  getGuberPayment(id: number): Promise<GuberPayment | undefined>;
  getGuberPaymentByJob(jobId: number): Promise<GuberPayment | undefined>;
  getGuberPaymentByOffer(offerId: number): Promise<GuberPayment | undefined>;
  updateGuberPayment(id: number, data: Partial<GuberPayment>): Promise<GuberPayment | undefined>;

  createMoneyLedgerEntry(data: any): Promise<MoneyLedgerEntry>;
  getMoneyLedgerByJob(jobId: number): Promise<MoneyLedgerEntry[]>;
  getMoneyLedgerByPayment(paymentId: number): Promise<MoneyLedgerEntry[]>;

  createGuberDispute(data: any): Promise<GuberDispute>;
  getGuberDispute(id: number): Promise<GuberDispute | undefined>;
  getGuberDisputeByJob(jobId: number): Promise<GuberDispute | undefined>;
  updateGuberDispute(id: number, data: Partial<GuberDispute>): Promise<GuberDispute | undefined>;

  createCancellationLogEntry(data: any): Promise<CancellationLogEntry>;
  getCancellationLogByJob(jobId: number): Promise<CancellationLogEntry[]>;

  createFundClaim(data: any): Promise<FundClaimOrHold>;
  getFundClaim(id: number): Promise<FundClaimOrHold | undefined>;
  getOpenFundClaims(): Promise<FundClaimOrHold[]>;
  updateFundClaim(id: number, data: Partial<FundClaimOrHold>): Promise<FundClaimOrHold | undefined>;

  getClockedInWorkers(): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(sql`LOWER(${users.email})`, email.toLowerCase().trim()));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByGuberId(guberId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq((users as any).guberId, guberId));
    return user;
  }

  async getUserByPublicUsername(publicUsername: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq((users as any).publicUsername, publicUsername));
    return user;
  }

  async createUser(data: any): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getJobs(onlyPublished: boolean = true): Promise<Job[]> {
    if (onlyPublished) {
      return db.select().from(jobs)
        .where(and(eq(jobs.isPublished, true), eq(jobs.isPaid, true)))
        .orderBy(
          sql`CASE WHEN ${jobs.boostedAt} IS NOT NULL THEN 0 ELSE 1 END`,
          desc(sql`COALESCE(${jobs.boostedAt}, ${jobs.createdAt})`),
        );
    }
    return db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  async adminRemoveJob(id: number, reason: string): Promise<void> {
    await db.update(jobs).set({
      status: "cancelled",
      removedByAdmin: true,
      removedByAdminReason: reason,
    }).where(eq(jobs.id, id));
  }

  async getJobsByCategory(category: string): Promise<Job[]> {
    return db.select().from(jobs)
      .where(and(
        eq(jobs.category, category),
        eq(jobs.isPublished, true),
        eq(jobs.isPaid, true)
      ))
      .orderBy(desc(jobs.createdAt));
  }

  async getJobsByUser(userId: number): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.postedById, userId)).orderBy(desc(jobs.createdAt));
  }

  async getUserJobs(userId: number): Promise<Job[]> {
    return db.select().from(jobs)
      .where(or(eq(jobs.postedById, userId), eq(jobs.assignedHelperId, userId)))
      .orderBy(desc(jobs.createdAt));
  }

  async createJob(data: any): Promise<Job> {
    const [job] = await db.insert(jobs).values(data).returning();
    return job;
  }

  async updateJob(id: number, data: Partial<Job>): Promise<Job | undefined> {
    const [job] = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
    return job;
  }

  async getCategories(): Promise<Category[]> {
    return db.select().from(categories);
  }

  async createCategory(name: string, icon?: string, color?: string): Promise<Category> {
    const [cat] = await db.insert(categories).values({ name, icon, color }).returning();
    return cat;
  }

  async getServiceTypes(): Promise<ServiceType[]> {
    return db.select().from(serviceTypes);
  }

  async getServiceTypesByCategory(category: string): Promise<ServiceType[]> {
    return db.select().from(serviceTypes).where(eq(serviceTypes.category, category));
  }

  async createServiceType(data: any): Promise<ServiceType> {
    const [st] = await db.insert(serviceTypes).values(data).returning();
    return st;
  }

  async getVICategories(): Promise<VICategory[]> {
    return db.select().from(viCategories).orderBy(viCategories.sortOrder);
  }

  async createVICategory(data: any): Promise<VICategory> {
    const [c] = await db.insert(viCategories).values(data).returning();
    return c;
  }

  async getUseCases(): Promise<UseCase[]> {
    return db.select().from(useCases).orderBy(useCases.sortOrder);
  }

  async getUseCasesByVICategory(viCategoryId: number): Promise<UseCase[]> {
    return db.select().from(useCases).where(eq(useCases.viCategoryId, viCategoryId)).orderBy(useCases.sortOrder);
  }

  async createUseCase(data: any): Promise<UseCase> {
    const [uc] = await db.insert(useCases).values(data).returning();
    return uc;
  }

  async getCatalogServiceTypes(): Promise<CatalogServiceType[]> {
    return db.select().from(catalogServiceTypes).orderBy(catalogServiceTypes.sortOrder);
  }

  async getCatalogServiceTypesByUseCase(useCaseId: number): Promise<CatalogServiceType[]> {
    return db.select().from(catalogServiceTypes).where(eq(catalogServiceTypes.useCaseId, useCaseId)).orderBy(catalogServiceTypes.sortOrder);
  }

  async createCatalogServiceType(data: any): Promise<CatalogServiceType> {
    const [st] = await db.insert(catalogServiceTypes).values(data).returning();
    return st;
  }

  async getDetailOptionSets(): Promise<DetailOptionSet[]> {
    return db.select().from(detailOptionSets).orderBy(detailOptionSets.sortOrder);
  }

  async getDetailOptionSetsByUseCase(useCaseId: number): Promise<DetailOptionSet[]> {
    return db.select().from(detailOptionSets).where(eq(detailOptionSets.useCaseId, useCaseId)).orderBy(detailOptionSets.sortOrder);
  }

  async getDetailOptionSetsByVICategory(viCategoryId: number): Promise<DetailOptionSet[]> {
    return db.select().from(detailOptionSets).where(eq(detailOptionSets.viCategoryId, viCategoryId)).orderBy(detailOptionSets.sortOrder);
  }

  async createDetailOptionSet(data: any): Promise<DetailOptionSet> {
    const [dos] = await db.insert(detailOptionSets).values(data).returning();
    return dos;
  }

  async getProofTemplates(): Promise<ProofTemplate[]> {
    return db.select().from(proofTemplates);
  }

  async getProofTemplate(id: number): Promise<ProofTemplate | undefined> {
    const [pt] = await db.select().from(proofTemplates).where(eq(proofTemplates.id, id));
    return pt;
  }

  async createProofTemplate(data: any): Promise<ProofTemplate> {
    const [pt] = await db.insert(proofTemplates).values(data).returning();
    return pt;
  }

  async updateProofTemplate(id: number, data: Partial<ProofTemplate>): Promise<ProofTemplate | undefined> {
    const [pt] = await db.update(proofTemplates).set(data).where(eq(proofTemplates.id, id)).returning();
    return pt;
  }

  async getProofChecklistItems(templateId: number): Promise<ProofChecklistItem[]> {
    return db.select().from(proofChecklistItems).where(eq(proofChecklistItems.templateId, templateId)).orderBy(proofChecklistItems.sortOrder);
  }

  async createProofChecklistItem(data: any): Promise<ProofChecklistItem> {
    const [pci] = await db.insert(proofChecklistItems).values(data).returning();
    return pci;
  }

  async getJobChecklists(category: string, serviceTypeName?: string): Promise<DetailOptionSet[]> {
    const conditions = [eq(detailOptionSets.category, category)];
    if (serviceTypeName) {
      conditions.push(or(eq(detailOptionSets.serviceTypeName, serviceTypeName), isNull(detailOptionSets.serviceTypeName))!);
    } else {
      conditions.push(isNull(detailOptionSets.serviceTypeName));
    }
    return db.select().from(detailOptionSets)
      .where(and(...conditions))
      .orderBy(detailOptionSets.sortOrder);
  }

  async createJobChecklist(data: any): Promise<DetailOptionSet> {
    const [dos] = await db.insert(detailOptionSets).values(data).returning();
    return dos;
  }

  async updateJobChecklist(id: number, data: Partial<DetailOptionSet>): Promise<DetailOptionSet | undefined> {
    const [dos] = await db.update(detailOptionSets).set(data).where(eq(detailOptionSets.id, id)).returning();
    return dos;
  }

  async deleteJobChecklist(id: number): Promise<void> {
    await db.delete(detailOptionSets).where(eq(detailOptionSets.id, id));
  }

  async createAssignment(data: any): Promise<Assignment> {
    const [a] = await db.insert(assignments).values(data).returning();
    return a;
  }

  async getAssignmentsByJob(jobId: number): Promise<Assignment[]> {
    return db.select().from(assignments).where(eq(assignments.jobId, jobId));
  }

  async updateAssignment(id: number, data: Partial<Assignment>): Promise<Assignment> {
    const [a] = await db.update(assignments).set(data).where(eq(assignments.id, id)).returning();
    return a;
  }

  async createTimesheet(data: any): Promise<Timesheet> {
    const [t] = await db.insert(timesheets).values(data).returning();
    return t;
  }

  async getTimesheetsByAssignment(assignmentId: number): Promise<Timesheet[]> {
    return db.select().from(timesheets).where(eq(timesheets.assignmentId, assignmentId));
  }

  async getNotificationsByUser(userId: number): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: any): Promise<Notification> {
    const [n] = await db.insert(notifications).values(data).returning();
    import("./push").then(({ sendPushToUser }) => {
      sendPushToUser(data.userId, {
        title: data.title,
        body: data.body,
        url: data.jobId ? `/jobs/${data.jobId}` : "/",
      }).catch(() => {});
    }).catch(() => {});
    return n;
  }

  async markNotificationRead(id: number): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: number): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }

  async createReview(data: any): Promise<Review> {
    const [r] = await db.insert(reviews).values(data).returning();
    return r;
  }

  async getReviewsByUser(userId: number): Promise<Review[]> {
    return db.select().from(reviews)
      .where(eq(reviews.revieweeId, userId))
      .orderBy(desc(reviews.createdAt));
  }

  async getReviewsByJob(jobId: number): Promise<Review[]> {
    return db.select().from(reviews).where(eq(reviews.jobId, jobId));
  }

  async createStrike(data: any): Promise<StrikeRecord> {
    const [s] = await db.insert(strikeRecords).values(data).returning();
    return s;
  }

  async getStrikesByUser(userId: number): Promise<StrikeRecord[]> {
    return db.select().from(strikeRecords)
      .where(eq(strikeRecords.userId, userId))
      .orderBy(desc(strikeRecords.createdAt));
  }

  async createProofSubmission(data: any): Promise<ProofSubmission> {
    const [p] = await db.insert(proofSubmissions).values(data).returning();
    return p;
  }

  async getProofsByJob(jobId: number): Promise<ProofSubmission[]> {
    return db.select().from(proofSubmissions).where(eq(proofSubmissions.jobId, jobId));
  }

  async createWalletTransaction(data: any): Promise<WalletTransaction> {
    const [w] = await db.insert(walletTransactions).values(data).returning();
    return w;
  }

  async getWalletByUser(userId: number): Promise<WalletTransaction[]> {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt));
  }

  async updateWalletTransaction(id: number, data: Partial<WalletTransaction>): Promise<WalletTransaction | undefined> {
    const [w] = await db.update(walletTransactions).set(data).where(eq(walletTransactions.id, id)).returning();
    return w;
  }

  async createAuditLog(data: any): Promise<AuditLog> {
    const [a] = await db.insert(auditLogs).values(data).returning();
    return a;
  }

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async getOpenJobsForMap(): Promise<Job[]> {
    return db.select().from(jobs)
      .where(and(
        eq(jobs.isPublished, true),
        inArray(jobs.status, ["posted_public", "accepted_pending_payment", "in_progress", "active", "funded"])
      ));
  }

  async getAvailableWorkers(): Promise<User[]> {
    return db.select().from(users)
      .where(and(
        eq(users.isAvailable, true),
        sql`${users.role} != 'admin'`,
        or(
          and(isNotNull(users.lat), isNotNull(users.lng)),
          isNotNull(users.zipcode)
        )
      ));
  }

  async getJobCountsByZip(): Promise<{ zip: string; count: number }[]> {
    const results = await db
      .select({ zip: jobs.zip, count: count() })
      .from(jobs)
      .where(and(isNotNull(jobs.zip), eq(jobs.isPublished, true)))
      .groupBy(jobs.zip);
    return results
      .filter((r): r is { zip: string; count: number } => r.zip !== null)
      .map(r => ({ zip: r.zip, count: Number(r.count) }));
  }

  async getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleSub, googleSub));
    return user;
  }

  async createPasswordResetToken(userId: number, token: string, expiresAt: Date): Promise<void> {
    await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
  }

  async getPasswordResetToken(token: string): Promise<{ userId: number; expiresAt: Date; used: boolean } | undefined> {
    const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
    if (!row) return undefined;
    return { userId: row.userId, expiresAt: row.expiresAt, used: row.used ?? false };
  }

  async invalidatePasswordResetToken(token: string): Promise<void> {
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.token, token));
  }

  async getMarketplaceItems(filters?: { category?: string; status?: string }): Promise<MarketplaceItem[]> {
    const conditions = [eq(marketplaceItems.status, filters?.status || "active")];
    if (filters?.category) conditions.push(eq(marketplaceItems.category, filters.category));
    const items = await db.select().from(marketplaceItems).where(and(...conditions));
    const now = new Date();
    return items.sort((a, b) => {
      const aActive = a.boosted && a.boostedUntil && a.boostedUntil > now;
      const bActive = b.boosted && b.boostedUntil && b.boostedUntil > now;
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (a.guberVerified && !b.guberVerified) return -1;
      if (!a.guberVerified && b.guberVerified) return 1;
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });
  }

  async getMarketplaceItem(id: number): Promise<MarketplaceItem | undefined> {
    const [item] = await db.select().from(marketplaceItems).where(eq(marketplaceItems.id, id));
    return item;
  }

  async createMarketplaceItem(data: any): Promise<MarketplaceItem> {
    const [item] = await db.insert(marketplaceItems).values(data).returning();
    return item;
  }

  async updateMarketplaceItem(id: number, data: Partial<MarketplaceItem>): Promise<MarketplaceItem | undefined> {
    const [item] = await db.update(marketplaceItems).set(data).where(eq(marketplaceItems.id, id)).returning();
    return item;
  }

  async getMarketplaceItemsBySeller(sellerId: number): Promise<MarketplaceItem[]> {
    return db.select().from(marketplaceItems)
      .where(eq(marketplaceItems.sellerId, sellerId))
      .orderBy(desc(marketplaceItems.createdAt));
  }

  async createJobStatusLog(data: any): Promise<JobStatusLog> {
    const [log] = await db.insert(jobStatusLogs).values(data).returning();
    return log;
  }

  async getJobStatusLogs(jobId: number): Promise<JobStatusLog[]> {
    return db.select().from(jobStatusLogs)
      .where(eq(jobStatusLogs.jobId, jobId))
      .orderBy(desc(jobStatusLogs.createdAt));
  }

  async computeAndUpdateReliability(userId: number): Promise<void> {
    const userJobs = await db.select().from(jobs)
      .where(and(eq(jobs.assignedHelperId, userId)));

    const completedJobs = userJobs.filter(j => ["completion_submitted", "completed_paid"].includes(j.status));
    const canceledJobs = userJobs.filter(j => j.status === "cancelled" || j.cancelReason != null);
    const total = completedJobs.length + canceledJobs.length;

    const cancelRate = total > 0 ? canceledJobs.length / total : 0;
    const canceledCount = canceledJobs.length;

    let onTimePct = 100;
    if (completedJobs.length > 0) {
      const onTimeLogs = await db.select().from(jobStatusLogs)
        .where(and(eq(jobStatusLogs.userId, userId), eq(jobStatusLogs.statusType, "on_the_way")));
      const onTimeJobIds = new Set(onTimeLogs.map(l => l.jobId));
      const onTimeCount = completedJobs.filter(j => onTimeJobIds.has(j.id)).length;
      onTimePct = Math.round((onTimeCount / completedJobs.length) * 100);
    }

    const currentUser = await db.select().from(users).where(eq(users.id, userId));
    const existingConsecutive = currentUser[0]?.consecutiveOnTime || 0;

    let badgeTier = "standard";
    let badgeActive = true;
    let consecutiveOnTime = existingConsecutive;

    if (completedJobs.length >= 20 && onTimePct >= 90 && cancelRate <= 0.1) {
      badgeTier = "reliable";
      badgeActive = true;
    } else if (completedJobs.length >= 20 && onTimePct >= 90 && cancelRate <= 0.1) {
      badgeTier = "reliable";
    } else if (badgeTier === "reliable" && (onTimePct < 85 || cancelRate > 0.15)) {
      badgeActive = false;
    }

    if (badgeTier === "reliable" && !badgeActive && consecutiveOnTime >= 5) {
      badgeActive = true;
    }

    await db.update(users).set({
      jobsCompleted: completedJobs.length,
      canceledCount,
      cancellationRate: Math.round(cancelRate * 100) / 100,
      onTimePct,
      badgeTier,
      badgeActive,
    }).where(eq(users.id, userId));
  }

  async getBountyAttempts(jobId: number): Promise<BountyAttempt[]> {
    return db.select().from(bountyAttempts).where(eq(bountyAttempts.jobId, jobId)).orderBy(desc(bountyAttempts.createdAt));
  }

  async getBountyAttempt(id: number): Promise<BountyAttempt | undefined> {
    const [attempt] = await db.select().from(bountyAttempts).where(eq(bountyAttempts.id, id));
    return attempt;
  }

  async createBountyAttempt(data: any): Promise<BountyAttempt> {
    const [attempt] = await db.insert(bountyAttempts).values(data).returning();
    return attempt;
  }

  async updateBountyAttempt(id: number, data: Partial<BountyAttempt>): Promise<BountyAttempt | undefined> {
    const [attempt] = await db.update(bountyAttempts).set(data).where(eq(bountyAttempts.id, id)).returning();
    return attempt;
  }

  async getHelperAttemptCount(jobId: number, helperId: number): Promise<number> {
    const result = await db.select({ count: count() }).from(bountyAttempts)
      .where(and(eq(bountyAttempts.jobId, jobId), eq(bountyAttempts.helperId, helperId)));
    return result[0]?.count ?? 0;
  }

  async maybeUnderReview(userId: number): Promise<void> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await db.select().from(jobStatusLogs)
      .where(
        and(
          eq(jobStatusLogs.userId, userId),
          eq(jobStatusLogs.statusType, "cancelled")
        )
      );

    const cancels30d = logs.filter(l => l.createdAt && new Date(l.createdAt) >= since).length;

    if (cancels30d >= 3) {
      await db.update(users).set({ underReview: true, strikes30d: cancels30d }).where(eq(users.id, userId));
    }
  }

  async getBusinessProfile(userId: number): Promise<BusinessProfile | undefined> {
    const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
    return profile;
  }

  async createBusinessProfile(data: any): Promise<BusinessProfile> {
    const [profile] = await db.insert(businessProfiles).values(data).returning();
    return profile;
  }

  async updateBusinessProfile(userId: number, data: Partial<BusinessProfile>): Promise<BusinessProfile | undefined> {
    const [profile] = await db.update(businessProfiles).set(data).where(eq(businessProfiles.userId, userId)).returning();
    return profile;
  }

  async createBulkJobBatch(data: any): Promise<any> {
    const [batch] = await db.insert(bulkJobBatches).values(data).returning();
    return batch;
  }

  async getDropSponsors(status?: string): Promise<DropSponsor[]> {
    if (status) {
      return db.select().from(dropSponsors).where(eq(dropSponsors.status, status)).orderBy(desc(dropSponsors.createdAt));
    }
    return db.select().from(dropSponsors).orderBy(desc(dropSponsors.createdAt));
  }

  async getDropSponsor(id: number): Promise<DropSponsor | undefined> {
    const [sponsor] = await db.select().from(dropSponsors).where(eq(dropSponsors.id, id));
    return sponsor;
  }

  async createDropSponsor(data: any): Promise<DropSponsor> {
    const [sponsor] = await db.insert(dropSponsors).values(data).returning();
    return sponsor;
  }

  async updateDropSponsor(id: number, data: any): Promise<DropSponsor | undefined> {
    const [sponsor] = await db.update(dropSponsors).set(data).where(eq(dropSponsors.id, id)).returning();
    return sponsor;
  }

  async getCashDrops(): Promise<CashDrop[]> {
    return db.select().from(cashDrops).orderBy(desc(cashDrops.createdAt));
  }

  async getActiveCashDrops(): Promise<CashDrop[]> {
    return db.select().from(cashDrops).where(eq(cashDrops.status, "active")).orderBy(desc(cashDrops.createdAt));
  }

  async getCashDrop(id: number): Promise<CashDrop | undefined> {
    const [drop] = await db.select().from(cashDrops).where(eq(cashDrops.id, id));
    return drop;
  }

  async createCashDrop(data: any): Promise<CashDrop> {
    const [drop] = await db.insert(cashDrops).values(data).returning();
    return drop;
  }

  async updateCashDrop(id: number, data: Partial<CashDrop>): Promise<CashDrop | undefined> {
    const [drop] = await db.update(cashDrops).set(data).where(eq(cashDrops.id, id)).returning();
    return drop;
  }

  async deleteCashDrop(id: number): Promise<void> {
    await db.delete(cashDrops).where(eq(cashDrops.id, id));
  }

  async getCashDropAttempt(id: number): Promise<CashDropAttempt | undefined> {
    const [attempt] = await db.select().from(cashDropAttempts).where(eq(cashDropAttempts.id, id));
    return attempt;
  }

  async getCashDropAttemptByUser(cashDropId: number, userId: number): Promise<CashDropAttempt | undefined> {
    const [attempt] = await db.select().from(cashDropAttempts)
      .where(and(eq(cashDropAttempts.cashDropId, cashDropId), eq(cashDropAttempts.userId, userId)))
      .orderBy(desc(cashDropAttempts.createdAt));
    return attempt;
  }

  async getCashDropAttempts(cashDropId: number): Promise<CashDropAttempt[]> {
    return db.select().from(cashDropAttempts).where(eq(cashDropAttempts.cashDropId, cashDropId)).orderBy(desc(cashDropAttempts.createdAt));
  }

  async createCashDropAttempt(data: any): Promise<CashDropAttempt> {
    const [attempt] = await db.insert(cashDropAttempts).values(data).returning();
    return attempt;
  }

  async updateCashDropAttempt(id: number, data: Partial<CashDropAttempt>): Promise<CashDropAttempt | undefined> {
    const [attempt] = await db.update(cashDropAttempts).set(data).where(eq(cashDropAttempts.id, id)).returning();
    return attempt;
  }

  async getServicePricingConfig(category: string, serviceTypeName: string): Promise<ServicePricingConfig | undefined> {
    const [config] = await db.select().from(servicePricingConfig)
      .where(and(eq(servicePricingConfig.category, category), eq(servicePricingConfig.serviceTypeName, serviceTypeName)));
    return config;
  }

  async getAllServicePricingConfigs(): Promise<ServicePricingConfig[]> {
    return db.select().from(servicePricingConfig);
  }

  async getWorkerQualifications(userId: number): Promise<WorkerQualification[]> {
    return db.select().from(workerQualifications)
      .where(eq(workerQualifications.userId, userId))
      .orderBy(desc(workerQualifications.createdAt));
  }

  async getAllPendingQualifications(): Promise<WorkerQualification[]> {
    return db.select().from(workerQualifications)
      .where(eq(workerQualifications.verificationStatus, "pending"))
      .orderBy(desc(workerQualifications.createdAt));
  }

  async createQualification(data: any): Promise<WorkerQualification> {
    const [q] = await db.insert(workerQualifications).values(data).returning();
    return q;
  }

  async updateQualification(id: number, data: Partial<WorkerQualification>): Promise<WorkerQualification | undefined> {
    const [q] = await db.update(workerQualifications).set(data).where(eq(workerQualifications.id, id)).returning();
    return q;
  }

  async createObservation(data: any): Promise<Observation> {
    const [obs] = await db.insert(observations).values(data).returning();
    return obs;
  }

  async getObservation(id: number): Promise<Observation | undefined> {
    const [obs] = await db.select().from(observations).where(eq(observations.id, id));
    return obs;
  }

  async getObservations(filters?: { type?: string; city?: string; state?: string; zip?: string; status?: string; lat?: number; lng?: number; radius?: number }): Promise<Observation[]> {
    const conditions: any[] = [];
    if (filters?.status) {
      conditions.push(eq(observations.status, filters.status));
    } else {
      conditions.push(eq(observations.status, "open"));
    }
    if (filters?.type) conditions.push(eq(observations.observationType, filters.type));
    if (filters?.zip) conditions.push(sql`${observations.address} ILIKE ${'%' + filters.zip + '%'}`);
    if (filters?.city) conditions.push(sql`${observations.address} ILIKE ${'%' + filters.city + '%'}`);
    if (filters?.state) conditions.push(sql`${observations.address} ILIKE ${'%' + filters.state + '%'}`);
    if (filters?.lat !== undefined && filters?.lng !== undefined && filters?.radius !== undefined) {
      const lat = filters.lat;
      const lng = filters.lng;
      const radiusMiles = filters.radius;
      conditions.push(sql`(
        3958.8 * acos(
          cos(radians(${lat})) * cos(radians(${observations.locationLat})) *
          cos(radians(${observations.locationLng}) - radians(${lng})) +
          sin(radians(${lat})) * sin(radians(${observations.locationLat}))
        )
      ) <= ${radiusMiles}`);
    }
    return db.select().from(observations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(observations.createdAt));
  }

  async getObservationsByHelper(helperId: number): Promise<Observation[]> {
    return db.select().from(observations).where(eq(observations.helperId, helperId)).orderBy(desc(observations.createdAt));
  }

  async claimObservationForPurchase(id: number, companyId: number, price: number): Promise<Observation | null> {
    const now = new Date();
    const [claimed] = await db.update(observations)
      .set({ status: "purchasing", purchasedByCompanyId: companyId, purchasePrice: price, purchasedAt: now })
      .where(and(eq(observations.id, id), eq(observations.status, "open")))
      .returning();
    return claimed || null;
  }

  async updateObservation(id: number, data: Partial<Observation>): Promise<Observation | undefined> {
    const [obs] = await db.update(observations).set(data).where(eq(observations.id, id)).returning();
    return obs;
  }

  async expireOldObservations(): Promise<number> {
    const now = new Date();
    const result = await db.update(observations)
      .set({ status: "expired" })
      .where(and(
        eq(observations.status, "open"),
        lt(observations.expiresAt, now)
      ))
      .returning({ id: observations.id });
    return result.length;
  }

  async getBusinessAccount(ownerUserId: number): Promise<BusinessAccount | undefined> {
    const [acct] = await db.select().from(businessAccounts).where(eq(businessAccounts.ownerUserId, ownerUserId));
    return acct;
  }

  async getBusinessAccountById(id: number): Promise<BusinessAccount | undefined> {
    const [acct] = await db.select().from(businessAccounts).where(eq(businessAccounts.id, id));
    return acct;
  }

  async createBusinessAccount(data: any): Promise<BusinessAccount> {
    const [acct] = await db.insert(businessAccounts).values(data).returning();
    return acct;
  }

  async updateBusinessAccount(id: number, data: Partial<BusinessAccount>): Promise<BusinessAccount | undefined> {
    const [acct] = await db.update(businessAccounts).set({ ...data, updatedAt: new Date() }).where(eq(businessAccounts.id, id)).returning();
    return acct;
  }

  async getAllBusinessAccounts(status?: string): Promise<BusinessAccount[]> {
    if (status) {
      return db.select().from(businessAccounts).where(eq(businessAccounts.status, status)).orderBy(desc(businessAccounts.createdAt));
    }
    return db.select().from(businessAccounts).orderBy(desc(businessAccounts.createdAt));
  }

  async getBusinessPlan(businessAccountId: number): Promise<BusinessPlan | undefined> {
    const [plan] = await db.select().from(businessPlans).where(eq(businessPlans.businessAccountId, businessAccountId));
    return plan;
  }

  async createBusinessPlan(data: any): Promise<BusinessPlan> {
    const [plan] = await db.insert(businessPlans).values(data).returning();
    return plan;
  }

  async updateBusinessPlan(id: number, data: Partial<BusinessPlan>): Promise<BusinessPlan | undefined> {
    const [plan] = await db.update(businessPlans).set({ ...data, updatedAt: new Date() }).where(eq(businessPlans.id, id)).returning();
    return plan;
  }

  async getBusinessUnlock(businessAccountId: number, userId: number): Promise<BusinessCandidateUnlock | undefined> {
    const [unlock] = await db.select().from(businessCandidateUnlocks)
      .where(and(eq(businessCandidateUnlocks.businessAccountId, businessAccountId), eq(businessCandidateUnlocks.userId, userId)));
    return unlock;
  }

  async getBusinessUnlocks(businessAccountId: number): Promise<BusinessCandidateUnlock[]> {
    return db.select().from(businessCandidateUnlocks)
      .where(eq(businessCandidateUnlocks.businessAccountId, businessAccountId))
      .orderBy(desc(businessCandidateUnlocks.createdAt));
  }

  async createBusinessUnlock(data: any): Promise<BusinessCandidateUnlock> {
    const [unlock] = await db.insert(businessCandidateUnlocks).values(data).returning();
    return unlock;
  }

  async getBusinessOffers(businessAccountId: number): Promise<BusinessOffer[]> {
    return db.select().from(businessOffers)
      .where(eq(businessOffers.businessAccountId, businessAccountId))
      .orderBy(desc(businessOffers.sentAt));
  }

  async getBusinessOffersByUser(userId: number): Promise<BusinessOffer[]> {
    return db.select().from(businessOffers)
      .where(eq(businessOffers.userId, userId))
      .orderBy(desc(businessOffers.sentAt));
  }

  async getBusinessOffer(id: number): Promise<BusinessOffer | undefined> {
    const [offer] = await db.select().from(businessOffers).where(eq(businessOffers.id, id));
    return offer;
  }

  async createBusinessOffer(data: any): Promise<BusinessOffer> {
    const [offer] = await db.insert(businessOffers).values(data).returning();
    return offer;
  }

  async updateBusinessOffer(id: number, data: Partial<BusinessOffer>): Promise<BusinessOffer | undefined> {
    const [offer] = await db.update(businessOffers).set(data).where(eq(businessOffers.id, id)).returning();
    return offer;
  }

  async getWorkerProjection(userId: number): Promise<WorkerBusinessProjection | undefined> {
    const [proj] = await db.select().from(workerBusinessProjections).where(eq(workerBusinessProjections.userId, userId));
    return proj;
  }

  async upsertWorkerProjection(data: any): Promise<WorkerBusinessProjection> {
    const existing = await this.getWorkerProjection(data.userId);
    if (existing) {
      const [updated] = await db.update(workerBusinessProjections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(workerBusinessProjections.userId, data.userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(workerBusinessProjections).values(data).returning();
    return created;
  }

  async searchWorkerProjections(filters: {
    lat?: number; lng?: number; radiusMiles?: number;
    category?: string; minJobs?: number; minRating?: number;
    minCompletionRate?: number; mobilityType?: string;
    idVerified?: boolean; backgroundVerified?: boolean;
    availability?: string; recentActivity?: boolean;
    limit?: number; offset?: number;
  }): Promise<WorkerBusinessProjection[]> {
    const conditions: any[] = [eq(workerBusinessProjections.businessVisibilityStatus, "visible")];

    if (filters.minJobs !== undefined) {
      conditions.push(sql`${workerBusinessProjections.jobsCompleted} >= ${filters.minJobs}`);
    }
    if (filters.minRating !== undefined) {
      conditions.push(sql`${workerBusinessProjections.averageRating} >= ${filters.minRating}`);
    }
    if (filters.minCompletionRate !== undefined) {
      conditions.push(sql`${workerBusinessProjections.completionRate} >= ${filters.minCompletionRate}`);
    }
    if (filters.mobilityType) {
      conditions.push(eq(workerBusinessProjections.mobilityType, filters.mobilityType));
    }
    if (filters.idVerified === true) {
      conditions.push(eq(workerBusinessProjections.idVerified, true));
    }
    if (filters.backgroundVerified === true) {
      conditions.push(eq(workerBusinessProjections.backgroundVerified, true));
    }
    if (filters.recentActivity === true) {
      conditions.push(eq(workerBusinessProjections.recentActivityFlag, true));
    }
    if (filters.availability) {
      conditions.push(eq(workerBusinessProjections.availabilityStatus, filters.availability));
    }
    if (filters.lat !== undefined && filters.lng !== undefined && filters.radiusMiles !== undefined) {
      conditions.push(sql`(
        3958.8 * acos(
          cos(radians(${filters.lat})) * cos(radians(${workerBusinessProjections.lat})) *
          cos(radians(${workerBusinessProjections.lng}) - radians(${filters.lng})) +
          sin(radians(${filters.lat})) * sin(radians(${workerBusinessProjections.lat}))
        )
      ) <= ${filters.radiusMiles}`);
    }
    if (filters.category) {
      conditions.push(sql`${workerBusinessProjections.primaryCategories}::jsonb ? ${filters.category}`);
    }

    const lim = filters.limit || 50;
    const off = filters.offset || 0;

    return db.select().from(workerBusinessProjections)
      .where(and(...conditions))
      .orderBy(desc(workerBusinessProjections.jobsCompleted))
      .limit(lim)
      .offset(off);
  }

  async getBackgroundCheckEligibility(userId: number): Promise<BackgroundCheckEligibility | undefined> {
    const [elig] = await db.select().from(backgroundCheckEligibility).where(eq(backgroundCheckEligibility.userId, userId));
    return elig;
  }

  async createBackgroundCheckEligibility(data: any): Promise<BackgroundCheckEligibility> {
    const [elig] = await db.insert(backgroundCheckEligibility).values(data).returning();
    return elig;
  }

  async updateBackgroundCheckEligibility(userId: number, data: Partial<BackgroundCheckEligibility>): Promise<BackgroundCheckEligibility | undefined> {
    const [elig] = await db.update(backgroundCheckEligibility).set(data).where(eq(backgroundCheckEligibility.userId, userId)).returning();
    return elig;
  }

  async createBillingEvent(data: any): Promise<BillingEvent> {
    const [evt] = await db.insert(billingEvents).values(data).returning();
    return evt;
  }

  async getBillingEvents(businessAccountId: number): Promise<BillingEvent[]> {
    return db.select().from(billingEvents)
      .where(eq(billingEvents.businessAccountId, businessAccountId))
      .orderBy(desc(billingEvents.processedAt));
  }

  async createLegalAcceptance(data: any): Promise<LegalAcceptance> {
    const [acc] = await db.insert(legalAcceptances).values(data).returning();
    return acc;
  }

  async getLegalAcceptances(actorType: string, actorId: number): Promise<LegalAcceptance[]> {
    return db.select().from(legalAcceptances)
      .where(and(eq(legalAcceptances.actorType, actorType), eq(legalAcceptances.actorId, actorId)))
      .orderBy(desc(legalAcceptances.acceptedAt));
  }

  async createDirectOffer(data: any): Promise<DirectOffer> {
    const [offer] = await db.insert(directOffers).values(data).returning();
    return offer;
  }
  async getDirectOffer(id: number): Promise<DirectOffer | undefined> {
    const [offer] = await db.select().from(directOffers).where(eq(directOffers.id, id));
    return offer;
  }
  async getDirectOffersByHirer(hirerUserId: number): Promise<DirectOffer[]> {
    return db.select().from(directOffers).where(eq(directOffers.hirerUserId, hirerUserId)).orderBy(desc(directOffers.createdAt));
  }
  async getDirectOffersByWorker(workerUserId: number): Promise<DirectOffer[]> {
    return db.select().from(directOffers).where(eq(directOffers.workerUserId, workerUserId)).orderBy(desc(directOffers.createdAt));
  }
  async updateDirectOffer(id: number, data: Partial<DirectOffer>): Promise<DirectOffer | undefined> {
    const [offer] = await db.update(directOffers).set(data).where(eq(directOffers.id, id)).returning();
    return offer;
  }
  async getExpiredOffers(): Promise<DirectOffer[]> {
    return db.select().from(directOffers)
      .where(and(
        or(
          eq(directOffers.status, "sent"),
          eq(directOffers.status, "countered_by_worker"),
          eq(directOffers.status, "countered_by_hirer"),
          eq(directOffers.status, "agreed_payment_pending"),
          eq(directOffers.status, "payment_pending"),
        ),
        lt(directOffers.expiresAt, new Date())
      ));
  }

  async getDirectOffersByStatus(status: string): Promise<DirectOffer[]> {
    return db.select().from(directOffers).where(eq(directOffers.status, status));
  }

  async getSoonExpiringOffers(): Promise<DirectOffer[]> {
    const tenMinFromNow = new Date(Date.now() + 10 * 60 * 1000);
    return db.select().from(directOffers)
      .where(and(
        or(
          eq(directOffers.status, "sent"),
          eq(directOffers.status, "countered_by_worker"),
          eq(directOffers.status, "countered_by_hirer"),
          eq(directOffers.status, "agreed_payment_pending"),
          eq(directOffers.status, "payment_pending"),
        ),
        lt(directOffers.expiresAt, tenMinFromNow),
        isNull(directOffers.expiryWarningSentAt),
      ));
  }

  async getDirectOfferByStripeSession(sessionId: string): Promise<DirectOffer | undefined> {
    const [offer] = await db.select().from(directOffers).where(eq(directOffers.stripeSessionId, sessionId));
    return offer;
  }

  async createGuberPayment(data: any): Promise<GuberPayment> {
    const [payment] = await db.insert(guberPayments).values(data).returning();
    return payment;
  }
  async getGuberPayment(id: number): Promise<GuberPayment | undefined> {
    const [payment] = await db.select().from(guberPayments).where(eq(guberPayments.id, id));
    return payment;
  }
  async getGuberPaymentByJob(jobId: number): Promise<GuberPayment | undefined> {
    const [payment] = await db.select().from(guberPayments).where(eq(guberPayments.jobId, jobId));
    return payment;
  }
  async getGuberPaymentByOffer(offerId: number): Promise<GuberPayment | undefined> {
    const [payment] = await db.select().from(guberPayments).where(eq(guberPayments.offerId, offerId));
    return payment;
  }
  async updateGuberPayment(id: number, data: Partial<GuberPayment>): Promise<GuberPayment | undefined> {
    const [payment] = await db.update(guberPayments).set(data).where(eq(guberPayments.id, id)).returning();
    return payment;
  }

  async createMoneyLedgerEntry(data: any): Promise<MoneyLedgerEntry> {
    const [entry] = await db.insert(moneyLedger).values(data).returning();
    return entry;
  }
  async getMoneyLedgerByJob(jobId: number): Promise<MoneyLedgerEntry[]> {
    return db.select().from(moneyLedger).where(eq(moneyLedger.jobId, jobId)).orderBy(desc(moneyLedger.eventTime));
  }
  async getMoneyLedgerByPayment(paymentId: number): Promise<MoneyLedgerEntry[]> {
    return db.select().from(moneyLedger).where(eq(moneyLedger.paymentId, paymentId)).orderBy(desc(moneyLedger.eventTime));
  }

  async createGuberDispute(data: any): Promise<GuberDispute> {
    const [dispute] = await db.insert(guberDisputes).values(data).returning();
    return dispute;
  }
  async getGuberDispute(id: number): Promise<GuberDispute | undefined> {
    const [dispute] = await db.select().from(guberDisputes).where(eq(guberDisputes.id, id));
    return dispute;
  }
  async getGuberDisputeByJob(jobId: number): Promise<GuberDispute | undefined> {
    const [dispute] = await db.select().from(guberDisputes).where(eq(guberDisputes.jobId, jobId));
    return dispute;
  }
  async updateGuberDispute(id: number, data: Partial<GuberDispute>): Promise<GuberDispute | undefined> {
    const [dispute] = await db.update(guberDisputes).set(data).where(eq(guberDisputes.id, id)).returning();
    return dispute;
  }

  async createCancellationLogEntry(data: any): Promise<CancellationLogEntry> {
    const [entry] = await db.insert(cancellationLog).values(data).returning();
    return entry;
  }
  async getCancellationLogByJob(jobId: number): Promise<CancellationLogEntry[]> {
    return db.select().from(cancellationLog).where(eq(cancellationLog.jobId, jobId)).orderBy(desc(cancellationLog.canceledAt));
  }

  async createFundClaim(data: any): Promise<FundClaimOrHold> {
    const [claim] = await db.insert(fundClaimsOrHolds).values(data).returning();
    return claim;
  }
  async getFundClaim(id: number): Promise<FundClaimOrHold | undefined> {
    const [claim] = await db.select().from(fundClaimsOrHolds).where(eq(fundClaimsOrHolds.id, id));
    return claim;
  }
  async getOpenFundClaims(): Promise<FundClaimOrHold[]> {
    return db.select().from(fundClaimsOrHolds).where(eq(fundClaimsOrHolds.status, "open")).orderBy(desc(fundClaimsOrHolds.createdAt));
  }
  async updateFundClaim(id: number, data: Partial<FundClaimOrHold>): Promise<FundClaimOrHold | undefined> {
    const [claim] = await db.update(fundClaimsOrHolds).set(data).where(eq(fundClaimsOrHolds.id, id)).returning();
    return claim;
  }

  async getClockedInWorkers(): Promise<User[]> {
    return db.select().from(users)
      .where(and(
        eq(users.isAvailable, true),
        isNotNull(users.clockedInAt),
        isNotNull(users.lat),
        isNotNull(users.lng)
      ));
  }
}

export const storage = new DatabaseStorage();
