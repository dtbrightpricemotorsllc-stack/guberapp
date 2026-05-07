import cron from "node-cron";
import { db, pool } from "./db";
import { jobs, jobStatusLogs, users, walletTransactions, observations, guberDisputes, cashDrops, auditLogs } from "@shared/schema";
import { and, eq, lt, lte, gte, isNull, isNotNull, inArray, desc, notInArray, or, sql } from "drizzle-orm";
import { clearStaleHandsfreeReviewSweep } from "./handsfree-auto-clear";
import { storage } from "./storage";
import { notifyNearbyAvailableWorkers, notifyCashDropExpired, notifyHandsfreeAutoCleared } from "./notify-helpers";
import { sendPushToUser } from "./push";
import { claimReminder, isUserInQuietHours } from "./reminders";
import { TRUST_ADJUSTMENTS } from "./pricing";
import { getDemoUserIds } from "./demo-guard";
import { awardReferralRewardForJob, voidReferralRewardForJob } from "./referral-reward";
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

        // GUBER Performance Shares — award the referrer (if any) their cash
        // share of GUBER's platform fee on this completed-paid job.
        await awardReferralRewardForJob(job.id, capturedAmount);

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

          // GUBER Performance Shares — reverse any referral reward already
          // credited on this job (only matters if the dispute was opened
          // post-capture and the SLA expired without an explicit decision).
          if (refundSucceeded) {
            await voidReferralRewardForJob(dispute.jobId, "dispute_sla_auto_refund");
          }

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
    .select({
      id: cashDrops.id,
      title: cashDrops.title,
      endTime: cashDrops.endTime,
      winnersFound: cashDrops.winnersFound,
      winnerLimit: cashDrops.winnerLimit,
    })
    .from(cashDrops)
    .where(
      and(
        eq(cashDrops.status, "active"),
        isNotNull(cashDrops.endTime),
        lt(cashDrops.endTime!, now)
      )
    );

  const { recordCashDropEvent } = await import("./cash-drop-events.js");

  for (const drop of toExpire) {
    await db.update(cashDrops)
      .set({ status: "expired", closedAt: now })
      .where(eq(cashDrops.id, drop.id));

    // Persist a structured event so the Cash Drop Debugger can show exactly
    // why each drop expired. Reason code surfaces in admin UI.
    await recordCashDropEvent({
      cashDropId: drop.id,
      eventType: "expired",
      reasonCode: "endtime_passed_without_winner",
      source: "cron",
      payload: {
        endTime: drop.endTime ? new Date(drop.endTime).toISOString() : null,
        now: now.toISOString(),
        winnersFound: drop.winnersFound ?? 0,
        winnerLimit: drop.winnerLimit ?? 0,
        cronJob: "autoExpireCashDrops",
      },
    });

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

// Studio tier monthly credit drip safety net (task-452). The webhook
// (invoice.paid) is the primary granter — this cron only catches users
// whose webhook was missed/delayed. Gates on lastDripAt > 28 days ago and
// active subscription status. Idempotent within a 28-day window.
const STUDIO_TIER_MONTHLY_CREDITS: Record<string, number> = {
  creator: 30,
  business: 150,
};
async function studioMonthlyDrip(): Promise<number> {
  const cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const eligible = await db
    .select({
      id: users.id,
      tier: users.studioTier,
      lastDrip: users.studioCreditsLastDripAt,
      subId: users.studioSubscriptionId,
      subStatus: users.studioSubscriptionStatus,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.studioSubscriptionId),
        inArray(users.studioTier, ["creator", "business"]),
        inArray(users.studioSubscriptionStatus, ["active", "trialing"]),
        or(isNull(users.studioCreditsLastDripAt), lte(users.studioCreditsLastDripAt, cutoff)),
      ),
    );

  let dripped = 0;
  for (const u of eligible) {
    const credits = STUDIO_TIER_MONTHLY_CREDITS[u.tier || ""] || 0;
    if (credits <= 0) continue;
    const newBalance = await storage.incrementStudioCredits(u.id, credits);
    await db.update(users).set({ studioCreditsLastDripAt: new Date() }).where(eq(users.id, u.id));
    await storage.createAuditLog({
      userId: u.id,
      action: "studio_subscription_drip_cron",
      details: `[cron-safety-net] +${credits} ${u.tier} credits (last drip was ${u.lastDrip?.toISOString() || "never"}). Balance: ${newBalance}.`,
    });
    await storage.createNotification({
      userId: u.id,
      title: "Monthly Studio credits added",
      body: `+${credits} credits dropped into your Studio balance.`,
      type: "system",
    });
    dripped++;
  }
  return dripped;
}

// task-482: decay the hands-free fraud counter. A worker who hasn't tripped
// the preflight in 60 days gets their counter reset to 0 — a one-time bad
// upload from months ago shouldn't permanently haunt them.
//
// task-492: when the counter resets, also auto-lift `under_review` for
// users whose flag came from the hands-free auto-flag tripwire (anchored
// by a `handsfree_auto_flag_for_review` audit entry). Admin-set flags have
// no audit anchor and are deliberately left alone — only an admin can
// clear those. Each auto-clear writes a `handsfree_auto_flag_cleared`
// audit row with reason `counter_decayed` so the loop is closed in the
// log. Returns count of users decayed.
async function decayHandsfreeBlockedAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60_000);
  const decayed = await db.update(users)
    .set({ handsfreeBlockedAttempts: 0, handsfreeBlockedLastAt: null })
    .where(and(
      gte(users.handsfreeBlockedAttempts!, 1),
      isNotNull(users.handsfreeBlockedLastAt),
      lt(users.handsfreeBlockedLastAt!, cutoff),
    ))
    .returning({ id: users.id });

  // For every user whose counter was just zeroed, attempt to also lift
  // `under_review` if their flag was set by the auto-flag tripwire AND
  // no other review reason is currently active. Eligibility:
  //   * users.under_review = true
  //   * a handsfree_auto_flag_for_review audit row exists (admin-set
  //     flags don't write one and are deliberately left alone)
  //   * users.strikes30d < 3 — the cancellation tripwire in
  //     storage.maybeUnderReview() also flips under_review when a worker
  //     hits 3 cancellations in 30 days. If it's currently tripped,
  //     hands-free isn't the only reason and we must NOT auto-clear.
  for (const d of decayed) {
    try {
      const [anchor] = await db
        .select({ at: sql<Date | null>`max(${auditLogs.createdAt})` })
        .from(auditLogs)
        .where(and(
          eq(auditLogs.userId, d.id),
          eq(auditLogs.action, "handsfree_auto_flag_for_review"),
        ));
      if (!anchor?.at) continue;

      const cleared = await db.transaction(async (tx) => {
        // The strikes30d gate is enforced in the same UPDATE so it cannot
        // race with a cancellation tripwire that fires mid-sweep.
        const [updated] = await tx
          .update(users)
          .set({ underReview: false })
          .where(and(
            eq(users.id, d.id),
            eq(users.underReview, true),
            lt(users.strikes30d!, 3),
          ))
          .returning({ id: users.id });
        if (!updated) return false;
        await tx.insert(auditLogs).values({
          userId: d.id,
          action: "handsfree_auto_flag_cleared",
          details: JSON.stringify({
            reason: "counter_decayed",
            windowDays: 60,
            flaggedAt: anchor.at instanceof Date ? anchor.at.toISOString() : new Date(anchor.at).toISOString(),
          }),
        });
        return true;
      });
      // task-493: notify the worker their flag has been auto-lifted. The
      // UPDATE's WHERE-clause guarantees exactly one clear per user (the
      // next sweep won't pick them up because under_review is now false),
      // so this fires at most once per clear event.
      if (cleared) await notifyHandsfreeAutoCleared(d.id, "counter_decayed");
    } catch (err) {
      console.error(`[handsfree-decay] failed to clear under_review for user ${d.id}:`, err);
    }
  }

  return decayed.length;
}

// Exported for test coverage of the task-492 auto-clear-on-decay behavior.
export const __test__ = { decayHandsfreeBlockedAttempts };

// Day-1 OG monthly Studio credit drip — grants 2 free Studio credits per
// 30-day window to OG members. Gated on studioCreditsLastDripAt so re-running
// the cron multiple times within a window is a no-op. Returns count granted.
async function ogStudioCreditDripSweep(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const eligible = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.day1OG, true),
      or(
        isNull(users.studioCreditsLastDripAt),
        lt(users.studioCreditsLastDripAt!, cutoff),
      ),
    ));
  let granted = 0;
  for (const u of eligible) {
    // Conditional update so concurrent cron runs can't double-grant.
    const [row] = await db.update(users)
      .set({
        studioCredits: sql`COALESCE(${users.studioCredits}, 0) + 2`,
        studioCreditsLastDripAt: new Date(),
      })
      .where(and(
        eq(users.id, u.id),
        eq(users.day1OG, true),
        or(
          isNull(users.studioCreditsLastDripAt),
          lt(users.studioCreditsLastDripAt!, cutoff),
        ),
      ))
      .returning({ id: users.id });
    if (row) {
      granted++;
      await storage.createNotification({
        userId: u.id,
        title: "+2 Studio credits",
        body: "Your Day-1 OG monthly drip just landed. Make something.",
        type: "system",
      }).catch(() => {});
    }
  }
  return granted;
}

// ─── Task #494 — V&I auto-satisfy expired proof reviews ───────────────────
// Pending V&I proofs whose review_window_expires_at has elapsed get marked
// "auto_satisfied", and the job is handed to the existing
// autoConfirmReviewTimerJobs path (which captures the Stripe authorization
// and releases payout). Idempotent and safe to re-run.
export async function autoSatisfyExpiredProofReviews(): Promise<number> {
  const now = new Date();
  const expired = await storage.getPendingReviewProofs(now);
  let satisfied = 0;
  for (const proof of expired) {
    try {
      // Defend against races: re-fetch the job and abort if a dispute was
      // opened between the storage filter and now. We must NEVER mutate the
      // proof's reviewDecision once a dispute exists — the proof becomes
      // evidence and any auto-finalization is suppressed.
      const job = await storage.getJob(proof.jobId);
      if (!job) continue;
      if (job.disputeOpenedAt || (job.status as string) === "disputed") {
        continue;
      }
      await storage.updateProofSubmission(proof.id, {
        reviewDecision: "auto_satisfied",
        reviewedAt: now,
      });
      if (!["completed_paid", "cancelled", "disputed"].includes(job.status as string)) {
        await storage.updateJob(proof.jobId, {
          status: "completion_submitted",
          proofStatus: "approved",
          autoConfirmAt: now,
        });
        if (job.postedById) {
          await storage.createNotification({
            userId: job.postedById,
            title: "Review window elapsed",
            body: `"${job.title}" was auto-accepted because the review window passed without action. Payment was released.`,
            type: "job",
            jobId: job.id,
          }).catch(() => {});
        }
      }
      await storage.createAuditLog({
        userId: null,
        action: "vi.proof.auto_satisfied",
        details: JSON.stringify({ proofId: proof.id, jobId: proof.jobId }),
      });
      satisfied++;
    } catch (err) {
      console.error(`[cron] autoSatisfy proof ${proof.id} failed:`, err);
    }
  }
  return satisfied;
}

// ─── Task #494 — 30-day media retention purge ─────────────────────────────
// Per spec: 30 days *after job completion* on V&I jobs only, skipping any
// job in active dispute. Before purging the row's media we upsert a
// permanent task_history_summary so resumes/dashboards/admin pages can
// still surface "completed V&I — N retakes — auto-satisfied" forever.
// We then null all media-bearing fields (image_urls, video_url, notes,
// capture_meta, pov_summary) and stamp media_purged_at. Best-effort
// per-row — failures don't block other rows.
export async function purgeViProofMedia(): Promise<number> {
  const VI_MEDIA_RETENTION_DAYS = 30;
  const cutoff = new Date(Date.now() - VI_MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const candidates = await storage.getProofsToPurgeMedia(cutoff);
  if (candidates.length === 0) return 0;

  const { destroyAsset } = await import("./cloudinary.js");
  let purged = 0;

  // Group candidates by jobId so we upsert task_history_summary once per
  // job (using the LATEST proof's outcome), not once per proof row. This
  // keeps the persistent summary deterministic when a job has multiple
  // proof rows (e.g. retakes) — last-write-wins iteration ordering can
  // never silently overwrite the final outcome with an earlier one.
  const byJob = new Map<number, typeof candidates>();
  for (const p of candidates) {
    const arr = byJob.get(p.jobId) ?? [];
    arr.push(p);
    byJob.set(p.jobId, arr);
  }

  for (const [jobId, jobProofs] of byJob.entries()) {
    try {
      const job = await storage.getJob(jobId);
      // Storage already filtered V&I + completedAt + non-disputed +
      // disputeOpenedAt IS NULL. Defend against races: any dispute ever
      // opened on this job — even one already resolved — freezes media
      // purge so the evidence is retained.
      if (!job || job.category !== "Verify & Inspect") continue;
      if ((job.status as string) === "disputed") continue;
      if (job.disputeOpenedAt) continue;
      if (!job.completedAt || job.completedAt > cutoff) continue;

      // Destroy Cloudinary assets across every proof for this job.
      const aggDestroyed: string[] = [];
      const aggFailed: { url: string; reason?: string }[] = [];
      for (const proof of jobProofs) {
        const urls: string[] = [];
        if (proof.videoUrl) urls.push(proof.videoUrl);
        if (proof.imageUrls) {
          try {
            const parsed = typeof proof.imageUrls === "string" ? JSON.parse(proof.imageUrls) : proof.imageUrls;
            if (Array.isArray(parsed)) urls.push(...parsed.filter((u) => typeof u === "string"));
          } catch {
            urls.push(String(proof.imageUrls));
          }
        }
        for (const u of urls) {
          try {
            const r = await destroyAsset(u);
            if (r.ok) aggDestroyed.push(r.publicId || u);
            else aggFailed.push({ url: u, reason: r.publicId ? `not_destroyed:${r.publicId}` : "unknown" });
          } catch (e: any) {
            aggFailed.push({ url: u, reason: e?.message || "throw" });
          }
        }
      }

      // Pick the LATEST proof (by id desc — schema serial id is monotonic)
      // as the canonical outcome for this job's permanent summary. This is
      // deterministic regardless of iteration order of jobProofs.
      const allProofs = await storage.getProofsByJob(jobId);
      const latest = [...allProofs].sort((a, b) => (b.id as number) - (a.id as number))[0];
      const finalDecision = latest?.reviewDecision ?? "none";

      // Permanent summary BEFORE we drop the detail. Upserted ONCE per job.
      await storage.upsertTaskHistorySummary({
        jobId,
        posterId: job.postedById,
        helperId: job.assignedHelperId ?? null,
        category: job.category,
        viCategory: job.verifyInspectCategory ?? null,
        jobType: job.jobType ?? null,
        proofReviewDecision: finalDecision,
        retakeCount: job.viRetakeCount ?? 0,
        proofCount: allProofs.length,
        completionStatus: job.status ?? null,
        outcome: finalDecision === "auto_satisfied"
          ? "auto-satisfied (review window elapsed)"
          : finalDecision === "satisfied"
            ? "satisfied by hirer"
            : null,
        completedAt: job.completedAt,
        metadata: {
          retentionDays: VI_MEDIA_RETENTION_DAYS,
          destroyedAssets: aggDestroyed.length,
          failedAssets: aggFailed.length,
          ...(aggFailed.length > 0 ? { failedUrls: aggFailed } : {}),
        },
      });

      // Deadline-enforced 30d scrub: clear DB fields on EVERY proof row for
      // this job unconditionally; orphaned Cloudinary assets are tracked
      // separately for out-of-band retry. Checklist responses live inside
      // proof_submissions (one row per checklistItemId) so they are covered
      // by the same UPDATE; there is no separate checklist-results or
      // proof-messages table in this schema.
      const purgedAt = new Date();
      for (const proof of jobProofs) {
        await storage.updateProofSubmission(proof.id, {
          imageUrls: null,
          videoUrl: null,
          notes: null,
          notEncounteredReason: null,
          captureMeta: null,
          povSummary: null,
          mediaPurgedAt: purgedAt,
        });
        await storage.createAuditLog({
          userId: null,
          action: "vi.proof.media_purged",
          details: JSON.stringify({
            proofId: proof.id,
            jobId,
            retentionDays: VI_MEDIA_RETENTION_DAYS,
          }),
        });
        purged++;
      }

      if (aggFailed.length > 0) {
        // Out-of-band: orphaned Cloudinary assets that survived the scrub.
        // Retry job can read these from this audit entry.
        await storage.createAuditLog({
          userId: null,
          action: "vi.proof.cloudinary_orphan_pending",
          details: JSON.stringify({
            jobId,
            failedCount: aggFailed.length,
            failedUrls: aggFailed,
          }),
        });
      }
    } catch (err) {
      console.error(`[cron] purgeViProofMedia job ${jobId} failed:`, err);
    }
  }
  return purged;
}

// Public single-shot runner used by /api/internal/cron/run when this app is
// driven by a Replit Scheduled Deployment (DISABLE_BACKGROUND_JOBS=true).
// Runs the union of every periodic sweep that used to live inside the two
// node-cron schedules below. Idempotent and safe to call concurrently —
// each helper either updates rows by status or is dedup-gated.
export async function runAllScheduledSweeps(): Promise<void> {
  // 2-min cadence work
  try {
    const expired = await autoExpireCashDrops();
    if (expired > 0) console.log(`[cron] auto-expired ${expired} cash drop(s) past endTime`);

    const dropPings = await cashDropExpiringSweep();
    if (dropPings > 0) console.log(`[cron] sent ${dropPings} cash-drop expiring reminder(s)`);
  } catch (err) {
    console.error("[cron] error in 2-min sweep:", err);
  }

  // 5-min cadence work
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
    if (prunedNonces > 0) console.log(`[cron] pruned ${prunedNonces} expired OAuth nonce(s)`);

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

    const studioDrip = await studioMonthlyDrip();
    if (studioDrip > 0) console.log(`[cron] dripped studio credits to ${studioDrip} subscriber(s)`);

    const ogDrip = await ogStudioCreditDripSweep();
    if (ogDrip > 0) console.log(`[cron] granted ${ogDrip} OG monthly Studio drip(s)`);

    const decayedHf = await decayHandsfreeBlockedAttempts();
    if (decayedHf > 0) console.log(`[cron] decayed hands-free block counter for ${decayedHf} user(s)`);

    const clearedHf = await clearStaleHandsfreeReviewSweep();
    if (clearedHf > 0) console.log(`[cron] auto-cleared hands-free under_review for ${clearedHf} user(s)`);

    // Task #494 — V&I review window auto-satisfy + 30-day media retention purge.
    const autoSat = await autoSatisfyExpiredProofReviews();
    if (autoSat > 0) console.log(`[cron] auto-satisfied ${autoSat} V&I proof(s) past review window`);

    const purged = await purgeViProofMedia();
    if (purged > 0) console.log(`[cron] purged media on ${purged} V&I proof(s) past 30-day retention`);
  } catch (err) {
    console.error("[cron] error in 5-min sweep:", err);
  }
}

export function startCron() {
  // Cost guard: when DISABLE_BACKGROUND_JOBS=true (set on the production
  // Autoscale deployment), we skip wiring node-cron schedules entirely so
  // the process has no recurring timers and can be scaled to zero by
  // Replit Autoscale. The same sweeps still run — driven externally by a
  // Replit Scheduled Deployment hitting /api/internal/cron/run.
  if (process.env.DISABLE_BACKGROUND_JOBS === "true") {
    console.log("[cron] DISABLE_BACKGROUND_JOBS=true — in-process schedules skipped (use /api/internal/cron/run via Scheduled Deployment).");
    return;
  }

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

      const studioDrip = await studioMonthlyDrip();
      if (studioDrip > 0) console.log(`[cron] dripped studio credits to ${studioDrip} subscriber(s)`);

      const ogDrip = await ogStudioCreditDripSweep();
      if (ogDrip > 0) console.log(`[cron] granted ${ogDrip} OG monthly Studio drip(s)`);

      const decayedHf = await decayHandsfreeBlockedAttempts();
      if (decayedHf > 0) console.log(`[cron] decayed hands-free block counter for ${decayedHf} user(s)`);

      const clearedHf = await clearStaleHandsfreeReviewSweep();
      if (clearedHf > 0) console.log(`[cron] auto-cleared hands-free under_review for ${clearedHf} user(s)`);

      // Task #494 — V&I review window auto-satisfy + 30-day media retention purge.
      const autoSat = await autoSatisfyExpiredProofReviews();
      if (autoSat > 0) console.log(`[cron] auto-satisfied ${autoSat} V&I proof(s) past review window`);

      const purged = await purgeViProofMedia();
      if (purged > 0) console.log(`[cron] purged media on ${purged} V&I proof(s) past 30-day retention`);
    } catch (err) {
      console.error("[cron] error in cron job:", err);
    }
  });
  console.log("[cron] job expiration + stale boost + review timer + reminder sweeps cron started");
}
