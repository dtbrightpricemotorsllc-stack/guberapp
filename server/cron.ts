import cron from "node-cron";
import { db, pool } from "./db";
import { jobs, jobStatusLogs, users, walletTransactions, observations, guberDisputes, cashDrops } from "@shared/schema";
import { and, eq, lt, lte, gte, isNull, isNotNull, inArray, desc, notInArray } from "drizzle-orm";
import { storage } from "./storage";
import { notifyNearbyAvailableWorkers, notifyCashDropExpired } from "./notify-helpers";
import { sendPushToUser } from "./push";
import { claimReminder, isUserInQuietHours } from "./reminders";
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
      internalPayoutStatus: "approved",
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
        await db.update(jobs).set({ payoutStatus: "paid_out", internalPayoutStatus: "released", payoutAmount: canonicalWorkerShare, chargedAt: new Date() }).where(eq(jobs.id, job.id));
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
          await db.update(jobs).set({ payoutStatus: "capture_expired", internalPayoutStatus: "on_hold" }).where(eq(jobs.id, job.id));
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
        const oldTrust = helper.trustScore || 50;
        const newTrust = Math.min(100, oldTrust + TRUST_ADJUSTMENTS.JOB_COMPLETED_WITH_PROOF + TRUST_ADJUSTMENTS.POSTER_CONFIRMED);
        const existingBadges: string[] = (helper as any).milestoneBadges || [];
        const cronBadgeUpdates: Record<string, any> = {
          jobsCompleted: (helper.jobsCompleted || 0) + 1,
          trustScore: newTrust,
          jobsConfirmed: ((helper as any).jobsConfirmed || 0) + 1,
        };
        const cronNewBadges: string[] = [];
        if (newTrust >= 60 && oldTrust < 60 && !existingBadges.includes("verified_worker")) {
          cronNewBadges.push("verified_worker");
        }
        if (newTrust >= 80 && oldTrust < 80 && !existingBadges.includes("trusted_worker")) {
          cronNewBadges.push("trusted_worker");
        }
        if (cronNewBadges.length > 0) {
          cronBadgeUpdates.milestoneBadges = [...existingBadges, ...cronNewBadges];
        }
        await db.update(users).set(cronBadgeUpdates).where(eq(users.id, helper.id));

        // Notify worker of milestone badge(s) earned via auto-completion
        const cronNewBadge = cronNewBadges.includes("trusted_worker")
          ? "trusted_worker"
          : cronNewBadges.includes("verified_worker") ? "verified_worker" : null;
        if (cronNewBadge) {
          const badgeLabel = cronNewBadge === "trusted_worker" ? "Trusted Worker" : "Verified Worker";
          const badgeBody = cronNewBadge === "trusted_worker"
            ? "You've reached the highest trust tier. Instant payouts are now unlocked!"
            : "Your trust has grown. Early payouts are now available to you.";
          await storage.createNotification({
            userId: helper.id,
            title: `🏆 You leveled up to ${badgeLabel}!`,
            body: badgeBody,
            type: "job",
            jobId: job.id,
          });
        }
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
            internalPayoutStatus: refundSucceeded ? "refunded" : "on_hold",
          } as any).where(eq(jobs.id, dispute.jobId));

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

async function autoExpireCashDrops(): Promise<number> {
  const now = new Date();
  const toExpire = await db
    .select({ id: cashDrops.id, title: cashDrops.title })
    .from(cashDrops)
    .where(
      and(
        eq(cashDrops.status, "active"),
        isNotNull(cashDrops.endTime),
        lt(cashDrops.endTime!, now)
      )
    );

  for (const drop of toExpire) {
    await db.update(cashDrops)
      .set({ status: "expired", closedAt: now })
      .where(eq(cashDrops.id, drop.id));

    notifyCashDropExpired(drop.id, drop.title || "Cash Drop").catch(() => {});
  }

  return toExpire.length;
}

async function pruneExpiredOAuthNonces(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM oauth_used_nonces WHERE expires_at < NOW()`
  );
  return result.rowCount ?? 0;
}

// ── Phase 5 — Smart notification reminder sweeps ────────────────────────
// Each sweep is dedup-gated by reminders_sent so it fires at most once per
// (job|cashDrop, type[, user]). Quiet hours (10pm–7am local) are respected
// for all reminders here. The urgent at-risk push lives in the routes.ts
// coordination cron and intentionally bypasses quiet hours.

async function preArrivalReminderSweep(): Promise<number> {
  const now = new Date();
  const earliest = new Date(now.getTime() + 25 * 60_000);
  const latest = new Date(now.getTime() + 35 * 60_000);

  const candidates = await db.select({
    id: jobs.id,
    title: jobs.title,
    assignedHelperId: jobs.assignedHelperId,
  }).from(jobs).where(and(
    eq(jobs.scheduleStatus, "scheduled"),
    isNotNull(jobs.assignedHelperId),
    isNotNull(jobs.selectedWorkerTime),
    gte(jobs.selectedWorkerTime!, earliest),
    lte(jobs.selectedWorkerTime!, latest),
  ));

  let sent = 0;
  for (const j of candidates) {
    if (!j.assignedHelperId) continue;
    const helper = await storage.getUser(j.assignedHelperId);
    if (!helper) continue;
    if (helper.notifReminderPreArrival === false) continue;
    if (isUserInQuietHours(helper)) continue;
    // Atomic claim — DB partial unique index guarantees single send.
    if (!(await claimReminder({ jobId: j.id, type: "pre_arrival" }))) continue;

    const title = "Heads up — your GUBER job starts in 30 min";
    const body = `"${j.title}" begins soon. Tap "On the way" when you head out.`;
    await storage.createNotification({
      userId: helper.id, title, body, type: "job", jobId: j.id,
    });
    sendPushToUser(helper.id, {
      title, body, url: `/jobs/${j.id}`, tag: `job-status-${j.id}`, priority: "normal",
    }).catch(() => {});
    sent++;
  }
  return sent;
}

async function missingOnTheWaySweep(): Promise<number> {
  const now = new Date();
  const earliest = new Date(now.getTime() - 15 * 60_000);
  const latest = new Date(now.getTime() - 5 * 60_000);

  const candidates = await db.select({
    id: jobs.id,
    title: jobs.title,
    assignedHelperId: jobs.assignedHelperId,
  }).from(jobs).where(and(
    eq(jobs.scheduleStatus, "scheduled"),
    isNotNull(jobs.assignedHelperId),
    isNotNull(jobs.selectedWorkerTime),
    gte(jobs.selectedWorkerTime!, earliest),
    lte(jobs.selectedWorkerTime!, latest),
    isNull(jobs.workerOnMyWayAt),
    isNull(jobs.onTheWayAt),
    isNull(jobs.workerArrivedAt),
    isNull(jobs.arrivedAt),
  ));

  let sent = 0;
  for (const j of candidates) {
    if (!j.assignedHelperId) continue;
    const helper = await storage.getUser(j.assignedHelperId);
    if (!helper) continue;
    if (helper.notifReminderOnTheWay === false) continue;
    if (isUserInQuietHours(helper)) continue;
    if (!(await claimReminder({ jobId: j.id, type: "missing_otw" }))) continue;

    const title = "Are you still on the way?";
    const body = `"${j.title}" was scheduled to start. Tap "On the way" to confirm or Dismiss to silence this reminder.`;
    await storage.createNotification({
      userId: helper.id, title, body, type: "job", jobId: j.id,
    });
    // url stays clean (no ?action=…) — only the explicit action button
    // should trigger on-the-way. The SW handler routes per-button.
    // Tapping "Snooze 5m" hits POST /api/reminders/snooze, which defers the
    // next nudge by 5 minutes and (after that delay) re-delivers the push
    // if the worker still hasn't tapped "On the way".
    sendPushToUser(helper.id, {
      title, body,
      url: `/jobs/${j.id}`,
      tag: `job-status-${j.id}`,
      priority: "high",
      actions: [
        { action: "on_the_way", title: "On the way" },
        { action: "snooze", title: "Snooze 5m" },
      ],
    }).catch(() => {});
    sent++;
  }
  return sent;
}

async function payoutReleaseReminderSweep(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 2 * 60 * 60_000);

  const candidates = await db.select({
    id: jobs.id,
    title: jobs.title,
    postedById: jobs.postedById,
  }).from(jobs).where(and(
    eq(jobs.status, "completion_submitted"),
    isNotNull(jobs.completedAt),
    lte(jobs.completedAt!, cutoff),
  ));

  let sent = 0;
  for (const j of candidates) {
    const poster = await storage.getUser(j.postedById);
    if (!poster) continue;
    if (poster.notifReminderPayoutRelease === false) continue;
    if (isUserInQuietHours(poster)) continue;
    if (!(await claimReminder({ jobId: j.id, type: "payout_release" }))) continue;

    const title = "Don't forget to release payment";
    const body = `Your worker submitted "${j.title}" 2+ hours ago. Tap to release payment.`;
    await storage.createNotification({
      userId: poster.id, title, body, type: "job", jobId: j.id,
    });
    // url stays clean — only the explicit "Release payment" button should
    // trigger the release flow. Tapping the notification body just opens.
    sendPushToUser(poster.id, {
      title, body,
      url: `/jobs/${j.id}`,
      tag: `job-status-${j.id}`,
      priority: "normal",
      actions: [{ action: "release_payment", title: "Release payment" }],
    }).catch(() => {});
    sent++;
  }
  return sent;
}

async function cashDropExpiringSweep(): Promise<number> {
  const now = new Date();
  const earliest = new Date(now.getTime() + 4 * 60_000);
  const latest = new Date(now.getTime() + 6 * 60_000);

  const expiring = await db.select({
    id: cashDrops.id,
    title: cashDrops.title,
  }).from(cashDrops).where(and(
    eq(cashDrops.status, "active"),
    isNotNull(cashDrops.endTime),
    gte(cashDrops.endTime!, earliest),
    lte(cashDrops.endTime!, latest),
  ));

  let sent = 0;
  for (const d of expiring) {
    const attempts = await storage.getCashDropAttempts(d.id);
    const userIds = [...new Set(
      attempts
        .filter((a) => a.status !== "confirmed" && a.status !== "won" && a.status !== "rejected")
        .map((a) => a.userId)
    )];
    for (const uid of userIds) {
      const user = await storage.getUser(uid);
      if (!user) continue;
      // Both gates: the broad cash-drops category AND the dedicated
      // expiring-reminder pref. Either one being off mutes this push.
      if (user.notifCashDrops === false) continue;
      if (user.notifReminderDropExpiring === false) continue;
      if (isUserInQuietHours(user)) continue;
      if (!(await claimReminder({ cashDropId: d.id, userId: uid, type: "drop_expiring" }))) continue;

      const title = "Cash Drop expiring in 5 min";
      const body = `"${d.title || "Cash Drop"}" is closing soon. Submit your proof now or it'll be too late.`;
      await storage.createNotification({
        userId: uid, title, body, type: "cash_drop", cashDropId: d.id, jobId: null,
      });
      sendPushToUser(uid, {
        title, body,
        url: `/cash-drop/${d.id}`,
        tag: `cashdrop-expiring-${d.id}`,
        priority: "high",
      }).catch(() => {});
      sent++;
    }
  }
  return sent;
}

// Task #317 — Pings the poster once their per-job review window
// (reviewTimerStartedAt -> autoConfirmAt) crosses its midpoint.
async function autoConfirmMidpointSweep(): Promise<number> {
  const now = new Date();
  const candidates = await db.select({
    id: jobs.id,
    title: jobs.title,
    postedById: jobs.postedById,
    autoConfirmAt: jobs.autoConfirmAt,
    reviewTimerStartedAt: jobs.reviewTimerStartedAt,
  }).from(jobs).where(and(
    eq(jobs.status, "completion_submitted"),
    isNotNull(jobs.autoConfirmAt),
    isNotNull(jobs.reviewTimerStartedAt),
    gte(jobs.autoConfirmAt!, now),
  ));

  let sent = 0;
  for (const j of candidates) {
    const start = j.reviewTimerStartedAt;
    const end = j.autoConfirmAt;
    if (!start || !end) continue;

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (endMs <= startMs) continue;
    const midpointMs = startMs + (endMs - startMs) / 2;
    if (now.getTime() < midpointMs || now.getTime() >= endMs) continue;

    const poster = await storage.getUser(j.postedById);
    if (!poster) continue;
    if (isUserInQuietHours(poster)) continue;
    if (!(await claimReminder({ jobId: j.id, type: "auto_confirm_midpoint" }))) continue;

    const remainingMs = endMs - now.getTime();
    const remainingHours = Math.max(1, Math.round(remainingMs / 3_600_000));
    const title = "Review window halfway done";
    const body = `"${j.title}" auto-confirms in about ${remainingHours}h. Confirm completion or report an issue now.`;
    await storage.createNotification({
      userId: poster.id, title, body, type: "job", jobId: j.id,
    });
    sendPushToUser(poster.id, {
      title, body, url: `/jobs/${j.id}`, tag: `job-status-${j.id}`, priority: "high",
    }).catch(() => {});
    sent++;
  }
  return sent;
}

// Task #317 — Pings the helper ~6h before their helperResponseDeadline
// when they haven't responded yet, so the dispute window doesn't lapse silently.
async function helperResponseBufferSweep(): Promise<number> {
  const now = new Date();
  const earliest = new Date(now.getTime() + 5.5 * 60 * 60_000);
  const latest = new Date(now.getTime() + 6.5 * 60 * 60_000);
  const candidates = await db.select({
    id: jobs.id,
    title: jobs.title,
    assignedHelperId: jobs.assignedHelperId,
    helperResponseDeadline: jobs.helperResponseDeadline,
  }).from(jobs).where(and(
    eq(jobs.status, "disputed"),
    isNotNull(jobs.assignedHelperId),
    isNull(jobs.helperResponseAt),
    isNotNull(jobs.helperResponseDeadline),
    gte(jobs.helperResponseDeadline!, earliest),
    lte(jobs.helperResponseDeadline!, latest),
  ));

  let sent = 0;
  for (const j of candidates) {
    if (!j.assignedHelperId) continue;
    const helper = await storage.getUser(j.assignedHelperId);
    if (!helper) continue;
    if (isUserInQuietHours(helper)) continue;
    if (!(await claimReminder({ jobId: j.id, type: "helper_response_buffer" }))) continue;

    const title = "6h left to respond to the dispute";
    const body = `Add your side of the story for "${j.title}" before the response window closes.`;
    await storage.createNotification({
      userId: helper.id, title, body, type: "job", jobId: j.id,
    });
    sendPushToUser(helper.id, {
      title, body, url: `/jobs/${j.id}`, tag: `job-status-${j.id}`, priority: "high",
    }).catch(() => {});
    sent++;
  }
  return sent;
}

export function startCron() {
  cron.schedule("*/2 * * * *", async () => {
    try {
      const expired = await autoExpireCashDrops();
      if (expired > 0) console.log(`[cron] auto-expired ${expired} cash drop(s) past endTime`);

      const dropPings = await cashDropExpiringSweep();
      if (dropPings > 0) console.log(`[cron] sent ${dropPings} cash-drop expiring reminder(s)`);
    } catch (err) {
      console.error("[cron] error in 2-min sweep:", err);
    }
  });

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

      const prunedNonces = await pruneExpiredOAuthNonces();
      console.log(`[cron] pruned ${prunedNonces} expired OAuth nonce(s)`);

      // Phase 5 reminder sweeps — dedup-gated, quiet-hours-respecting.
      const preArrival = await preArrivalReminderSweep();
      if (preArrival > 0) console.log(`[cron] sent ${preArrival} pre-arrival reminder(s)`);

      const missingOtw = await missingOnTheWaySweep();
      if (missingOtw > 0) console.log(`[cron] sent ${missingOtw} missing-on-the-way reminder(s)`);

      const payoutPings = await payoutReleaseReminderSweep();
      if (payoutPings > 0) console.log(`[cron] sent ${payoutPings} payout-release reminder(s)`);

      // Task #317 — auto-confirm midpoint + helper response deadline buffer.
      const acMid = await autoConfirmMidpointSweep();
      if (acMid > 0) console.log(`[cron] sent ${acMid} auto-confirm midpoint reminder(s)`);

      const hrBuf = await helperResponseBufferSweep();
      if (hrBuf > 0) console.log(`[cron] sent ${hrBuf} helper-response buffer reminder(s)`);
    } catch (err) {
      console.error("[cron] error in cron job:", err);
    }
  });
  console.log("[cron] job expiration + stale boost + review timer + reminder sweeps cron started");
}
