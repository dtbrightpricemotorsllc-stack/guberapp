import cron from "node-cron";
import { db } from "./db";
import { jobs, jobStatusLogs, users, walletTransactions, observations, guberDisputes } from "@shared/schema";
import { and, eq, lt, lte, isNull, isNotNull, inArray, desc, notInArray } from "drizzle-orm";
import { storage } from "./storage";
import { notifyNearbyAvailableWorkers } from "./notify-helpers";
import { TRUST_ADJUSTMENTS } from "./pricing";
import { getDemoUserIds } from "./demo-guard";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!, { apiVersion: "2025-01-27.acacia" as any });

const STALE_THRESHOLD_MINUTES = 30;

async function expireUnacceptedJobs(): Promise<number> {
  const now = new Date();
  const demoIds = await getDemoUserIds();
  const demoIdArr = Array.from(demoIds);

  const toExpire = await db.select({ id: jobs.id, postedById: jobs.postedById })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "posted_public"),
        isNull(jobs.assignedHelperId),
        lt(jobs.expiresAt, now),
        ...(demoIdArr.length > 0 ? [notInArray(jobs.postedById, demoIdArr)] : [])
      )
    );

  for (const job of toExpire) {
    await db.update(jobs).set({ status: "expired" }).where(eq(jobs.id, job.id));
    await db.insert(jobStatusLogs).values({
      jobId: job.id,
      userId: job.postedById,
      statusType: "expired",
      note: "Auto-expired: no helper accepted within window",
    });
  }

  return toExpire.length;
}

function computeSuggestedBudget(current: number): number {
  const bumped = Math.ceil(current * 1.25);
  return Math.ceil(bumped / 5) * 5;
}

async function flagStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);
  const demoIds = await getDemoUserIds();
  const demoIdArr = Array.from(demoIds);

  const staleJobs = await db.select({
    id: jobs.id,
    postedById: jobs.postedById,
    budget: jobs.budget,
    title: jobs.title,
    boostSuggested: jobs.boostSuggested,
  })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["posted_public", "accepted_pending_payment"]),
        isNull(jobs.assignedHelperId),
        eq(jobs.boostSuggested, false),
        eq(jobs.isBoosted, false),
        lt(jobs.createdAt, cutoff),
        ...(demoIdArr.length > 0 ? [notInArray(jobs.postedById, demoIdArr)] : [])
      )
    );

  let flagged = 0;
  for (const job of staleJobs) {
    if (!job.budget || job.budget <= 0) continue;

    const suggested = computeSuggestedBudget(job.budget);

    await db.update(jobs).set({
      boostSuggested: true,
      suggestedBudget: suggested,
    }).where(eq(jobs.id, job.id));

    await storage.createNotification({
      userId: job.postedById,
      title: "Boost your job reward?",
      body: `"${job.title}" has not been accepted yet. Increasing the reward to $${suggested} may help it get picked up faster.`,
      type: "boost_suggestion",
      jobId: job.id,
    });

    flagged++;
  }

  return flagged;
}

async function autoIncreaseJobs(): Promise<number> {
  const now = new Date();
  const demoIds = await getDemoUserIds();
  const demoIdArr = Array.from(demoIds);

  const eligible = await db.select({
    id: jobs.id,
    title: jobs.title,
    budget: jobs.budget,
    autoIncreaseAmount: jobs.autoIncreaseAmount,
    autoIncreaseMax: jobs.autoIncreaseMax,
    autoIncreaseIntervalMins: jobs.autoIncreaseIntervalMins,
    postedById: jobs.postedById,
    category: jobs.category,
    lat: jobs.lat,
    lng: jobs.lng,
  })
    .from(jobs)
    .where(
      and(
        eq(jobs.autoIncreaseEnabled, true),
        eq(jobs.status, "posted_public"),
        isNull(jobs.assignedHelperId),
        isNotNull(jobs.nextIncreaseAt),
        lte(jobs.nextIncreaseAt, now),
        ...(demoIdArr.length > 0 ? [notInArray(jobs.postedById, demoIdArr)] : [])
      )
    );

  let increased = 0;
  for (const job of eligible) {
    if (!job.budget || !job.autoIncreaseAmount || !job.autoIncreaseMax) continue;

    const newBudget = Math.min(job.budget + job.autoIncreaseAmount, job.autoIncreaseMax);
    const hitCap = newBudget >= job.autoIncreaseMax;

    const intervalMs = (job.autoIncreaseIntervalMins || 60) * 60 * 1000;
    const nextAt = hitCap ? null : new Date(Date.now() + intervalMs);

    const poster = await db.select({ day1OG: users.day1OG }).from(users).where(eq(users.id, job.postedById)).then(r => r[0]);
    const isOG = poster?.day1OG === true;
    const baseFeeRate = isOG ? 0.15 : 0.20;
    const platformFee = Math.round(newBudget * baseFeeRate * 100) / 100;
    const helperPayout = Math.round((newBudget - platformFee) * 100) / 100;

    await db.update(jobs).set({
      budget: newBudget,
      autoIncreaseEnabled: !hitCap,
      nextIncreaseAt: nextAt,
      platformFee,
      helperPayout,
    }).where(eq(jobs.id, job.id));

    if (hitCap) {
      await storage.createNotification({
        userId: job.postedById,
        title: "Auto Pay Increase Complete",
        body: `"${job.title}" has reached its maximum payout of $${job.autoIncreaseMax}. Auto-increase has been disabled.`,
        type: "auto_increase",
        jobId: job.id,
      });
    }

    notifyNearbyAvailableWorkers(
      { id: job.id, title: job.title, category: job.category, lat: job.lat, lng: job.lng, postedById: job.postedById },
      {
        titleOverride: "Pay Increased!",
        bodyOverride: `"${job.title}" payout increased to $${newBudget}${hitCap ? " (max reached)" : ""}`,
      }
    ).catch(() => {});

    increased++;
  }

  return increased;
}

async function autoConfirmReviewTimerJobs(): Promise<number> {
  const now = new Date();

  const toAutoConfirm = await db.select({
    id: jobs.id,
    title: jobs.title,
    postedById: jobs.postedById,
    assignedHelperId: jobs.assignedHelperId,
    helperPayout: jobs.helperPayout,
    proofRequired: jobs.proofRequired,
    status: jobs.status,
    stripePaymentIntentId: jobs.stripePaymentIntentId,
    workerGrossShare: jobs.workerGrossShare,
    payoutStatus: jobs.payoutStatus,
  })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["completion_submitted"]),
        isNotNull(jobs.autoConfirmAt),
        lte(jobs.autoConfirmAt, now)
      )
    );

  let confirmed = 0;
  for (const job of toAutoConfirm) {
    const proofs = await storage.getProofsByJob(job.id);
    const hasProof = proofs.length > 0;

    if (job.proofRequired && !hasProof) {
      console.log(`[cron] skipping auto-confirm for job ${job.id}: proof required but missing`);
      continue;
    }

    const update: any = {
      status: "completed_paid",
      confirmedAt: now,
      payoutStatus: "payout_eligible",
    };

    await db.update(jobs).set(update).where(eq(jobs.id, job.id));

    // Capture the PaymentIntent — releases 80% to worker, GUBER keeps 20% application fee
    // Idempotency: skip if authorization was already captured or has expired
    const piId = job.stripePaymentIntentId;
    const jobPayoutStatus = job.payoutStatus;
    // canonicalWorkerShare: prefer workerGrossShare (set at checkout from 80% of total), fall back to helperPayout
    const canonicalWorkerShare = job.workerGrossShare || job.helperPayout || 0;
    let captureSucceeded = false;
    let captureExpired = false;

    if (piId && jobPayoutStatus !== "paid_out" && jobPayoutStatus !== "capture_expired") {
      try {
        const captured = await stripe.paymentIntents.capture(piId);
        const capturedAmount = (captured.amount_received || captured.amount || 0) / 100;
        // chargedAt set here — marks when funds actually settled (not at authorization)
        await db.update(jobs).set({ payoutStatus: "paid_out", chargedAt: new Date() }).where(eq(jobs.id, job.id));
        captureSucceeded = true;
        console.log(`[GUBER][capture] cron jobId=${job.id} paymentIntentId=${piId} captured=success amount=$${capturedAmount}`);

        const cronPlatformFee = job.platformFeeRate ? capturedAmount * job.platformFeeRate : capturedAmount - canonicalWorkerShare;
        await storage.createMoneyLedgerEntry({
          jobId: job.id,
          userIdOwner: job.postedById,
          userIdCounterparty: job.assignedHelperId,
          ledgerType: "job_payment_captured",
          amount: -capturedAmount,
          sourceSystem: "stripe",
          sourceReferenceId: piId,
          stripeObjectType: "payment_intent",
          stripeObjectId: piId,
          description: `Auto-confirm payment captured for job #${job.id}: ${job.title}`,
        });
        await storage.createMoneyLedgerEntry({
          jobId: job.id,
          userIdOwner: job.assignedHelperId,
          userIdCounterparty: job.postedById,
          ledgerType: "job_earning",
          amount: canonicalWorkerShare,
          sourceSystem: "stripe",
          sourceReferenceId: piId,
          stripeObjectType: "payment_intent",
          stripeObjectId: piId,
          description: `Auto-confirm earning for job #${job.id}: ${job.title}`,
        });
        await storage.createMoneyLedgerEntry({
          jobId: job.id,
          userIdOwner: null,
          ledgerType: "platform_fee",
          amount: cronPlatformFee,
          sourceSystem: "stripe",
          sourceReferenceId: piId,
          stripeObjectType: "payment_intent",
          stripeObjectId: piId,
          description: `Platform fee for job #${job.id}: ${job.title}`,
        });
      } catch (captureErr: any) {
        // Check for 7-day expiry (uncaptured authorization expires after 7 days)
        if (captureErr.code === "charge_expired_for_capture") {
          console.error(`[GUBER][capture] cron jobId=${job.id} EXPIRED — authorization lapsed. Needs admin attention.`);
          await db.update(jobs).set({ payoutStatus: "capture_expired" }).where(eq(jobs.id, job.id));
          captureExpired = true;
          // Notify poster immediately — they need to contact support
          await storage.createNotification({
            userId: job.postedById,
            title: "Payment Authorization Expired",
            body: `The payment hold for "${job.title}" has expired after 7 days. Please contact GUBER support to resolve.`,
            type: "job",
            jobId: job.id,
          });
        } else {
          console.error(`[GUBER][capture] cron jobId=${job.id} paymentIntentId=${piId} error: ${captureErr.message}`);
        }
      }
    }

    if (job.assignedHelperId) {
      const helper = await db.select().from(users).where(eq(users.id, job.assignedHelperId)).then(r => r[0]);
      if (helper) {
        await db.update(users).set({
          jobsCompleted: (helper.jobsCompleted || 0) + 1,
          trustScore: Math.min(100, (helper.trustScore || 50) + TRUST_ADJUSTMENTS.JOB_COMPLETED_WITH_PROOF + TRUST_ADJUSTMENTS.POSTER_CONFIRMED),
          jobsConfirmed: ((helper as any).jobsConfirmed || 0) + 1,
        }).where(eq(users.id, helper.id));
      }

      // Send capture-state-specific notification — never say "on its way" if capture expired
      if (captureExpired) {
        await storage.createNotification({
          userId: job.assignedHelperId,
          title: "Payment Hold Expired — Action Required",
          body: `The payment authorization for "${job.title}" has expired. Please contact GUBER support to arrange your payment.`,
          type: "job",
          jobId: job.id,
        });
      } else {
        await storage.createNotification({
          userId: job.assignedHelperId,
          title: "Job Auto-Confirmed!",
          body: captureSucceeded
            ? `"${job.title}" auto-confirmed. Your payment of $${canonicalWorkerShare.toFixed(2)} has been released to your bank account.`
            : `"${job.title}" has been auto-confirmed. Your payment is being processed.`,
          type: "job",
          jobId: job.id,
        });
      }

      const existingEarning = await db.select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(and(
          eq(walletTransactions.jobId, job.id),
          eq(walletTransactions.type, "earning"),
          eq(walletTransactions.userId, job.assignedHelperId)
        ))
        .limit(1);

      if (existingEarning.length === 0) {
        await storage.createWalletTransaction({
          userId: job.assignedHelperId,
          jobId: job.id,
          type: "earning",
          amount: canonicalWorkerShare,
          status: captureSucceeded ? "completed" : "pending",
          description: captureSucceeded
            ? `Payment released via Stripe for "${job.title}"`
            : `Auto-confirmed earnings for "${job.title}" — awaiting release`,
        });
      } else {
        // Update existing pending tx to completed if capture just succeeded
        if (captureSucceeded) {
          await db.update(walletTransactions)
            .set({ status: "completed" })
            .where(and(
              eq(walletTransactions.jobId, job.id),
              eq(walletTransactions.type, "earning"),
              eq(walletTransactions.userId, job.assignedHelperId)
            ));
        }
        console.log(`[cron] wallet tx for job ${job.id} already exists — capture status synced`);
      }
    }

    await storage.createNotification({
      userId: job.postedById,
      title: "Job Auto-Confirmed",
      body: `"${job.title}" was automatically confirmed after review period expired.`,
      type: "job",
      jobId: job.id,
    });

    confirmed++;
  }

  return confirmed;
}

async function enforceDisputeSLA(): Promise<number> {
  const now = new Date();
  const day4Cutoff = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const day5Cutoff = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const openDisputes = await db.select()
    .from(guberDisputes)
    .where(and(
      eq(guberDisputes.status, "open"),
      isNotNull(guberDisputes.jobId),
    ));

  let resolved = 0;

  for (const dispute of openDisputes) {
    const disputeOpenedAt = dispute.openedAt ? new Date(dispute.openedAt) : now;

    if (disputeOpenedAt <= day5Cutoff) {
      if (dispute.jobId) {
        const job = await storage.getJob(dispute.jobId);
        if (job) {
          const piId = (job as any).stripePaymentIntentId;
          let refundSucceeded = false;
          if (piId) {
            try {
              await stripe.refunds.create({ payment_intent: piId });
              refundSucceeded = true;
              console.log(`[cron][dispute-sla] jobId=${job.id} refund issued for expired dispute`);
            } catch (refundErr: any) {
              console.error(`[cron][dispute-sla] jobId=${job.id} refund failed: ${refundErr.message}`);
            }
          }

          if (!refundSucceeded && piId) {
            console.error(`[cron][dispute-sla] disputeId=${dispute.id} skipping auto-resolve — refund failed`);
            continue;
          }

          await db.update(guberDisputes).set({
            status: "resolved",
            resolution: "auto_resolved_sla_expired",
            resolutionType: "sla_auto_refund",
            resolvedAt: now,
            adminNotes: refundSucceeded
              ? "Auto-resolved: 5-day SLA expired without admin action. Full refund issued to hirer."
              : "Auto-resolved: 5-day SLA expired. No payment intent found — no refund needed.",
          }).where(eq(guberDisputes.id, dispute.id));

          await db.update(jobs).set({
            status: "cancelled",
            payoutStatus: refundSucceeded ? "refunded" : "cancelled",
          }).where(eq(jobs.id, dispute.jobId));

          if (refundSucceeded) {
            await storage.createMoneyLedgerEntry({
              jobId: job.id, ledgerType: "dispute_sla_auto_refund", amount: job.budget || 0,
              userIdOwner: job.postedById, userIdCounterparty: null,
              sourceSystem: "stripe", stripeObjectType: "payment_intent", stripeObjectId: piId || null,
              description: `Dispute auto-resolved after 5-day SLA — full refund issued.`,
            });
          }

          await storage.createNotification({
            userId: job.postedById,
            title: "Dispute Auto-Resolved",
            body: refundSucceeded
              ? `Dispute for "${job.title}" was auto-resolved after 5 days. A full refund has been issued.`
              : `Dispute for "${job.title}" was auto-resolved after 5 days.`,
            type: "job",
            jobId: job.id,
          });
          if (job.assignedHelperId) {
            await storage.createNotification({
              userId: job.assignedHelperId,
              title: "Dispute Auto-Resolved",
              body: `Dispute for "${job.title}" was auto-resolved after 5 days. No payout will be issued.`,
              type: "job",
              jobId: job.id,
            });
          }
        }
      }
      resolved++;
    } else if (disputeOpenedAt <= day4Cutoff && !dispute.slaWarningSentAt) {
      await db.update(guberDisputes).set({
        slaWarningSentAt: now,
      }).where(eq(guberDisputes.id, dispute.id));

      await storage.createNotification({
        userId: dispute.openedByUserId,
        title: "Dispute Expiring Soon",
        body: `Your dispute will be auto-resolved with a full refund in 24 hours if not resolved by admin.`,
        type: "system",
      });
    }
  }

  return resolved;
}

export function startCron() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const expired = await expireUnacceptedJobs();
      if (expired > 0) console.log(`[cron] expired ${expired} unaccepted job(s)`);

      const boosted = await flagStaleJobs();
      if (boosted > 0) console.log(`[cron] flagged ${boosted} stale job(s) for boost suggestion`);

      const autoIncreased = await autoIncreaseJobs();
      if (autoIncreased > 0) console.log(`[cron] auto-increased pay on ${autoIncreased} job(s)`);

      const autoConfirmed = await autoConfirmReviewTimerJobs();
      if (autoConfirmed > 0) console.log(`[cron] auto-confirmed ${autoConfirmed} job(s) after review timer`);

      const slaResolved = await enforceDisputeSLA();
      if (slaResolved > 0) console.log(`[cron] auto-resolved ${slaResolved} dispute(s) due to SLA expiry`);

      const expiredObs = await storage.expireOldObservations();
      if (expiredObs > 0) console.log(`[cron] expired ${expiredObs} old observation(s)`);

      const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000);
      const recovered = await db.update(observations)
        .set({ status: "open", purchasedByCompanyId: null, purchasePrice: null, purchasedAt: null })
        .where(and(eq(observations.status, "purchasing"), lt(observations.purchasedAt!, stuckCutoff)))
        .returning();
      if (recovered.length > 0) console.log(`[cron] recovered ${recovered.length} stuck purchasing observation(s)`);
    } catch (err) {
      console.error("[cron] error in cron job:", err);
    }
  });
  console.log("[cron] job expiration + stale boost + review timer cron started (every 5 min)");
}
