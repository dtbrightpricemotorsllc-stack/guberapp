import { db } from "./db";
import { storage } from "./storage";
import { sql } from "drizzle-orm";
import { sendPushToUser } from "./push";

const TWENTY_MILES_METERS = 32187;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function notifyNearbyAvailableWorkers(
  job: { id: number; title: string; category?: string | null; lat?: number | null; lng?: number | null; postedById: number },
  options?: { titleOverride?: string; bodyOverride?: string }
) {
  try {
    if (!job.lat || !job.lng) return;
    const rows = await db.execute(sql`SELECT id, full_name, lat, lng FROM users WHERE is_available = true AND lat IS NOT NULL AND lng IS NOT NULL AND id != ${job.postedById}`);
    for (const u of rows.rows as { id: number; full_name: string; lat: number; lng: number }[]) {
      const dist = haversineMeters(job.lat, job.lng, u.lat, u.lng);
      if (dist <= TWENTY_MILES_METERS) {
        const title = options?.titleOverride || "New Job Near You! 📍";
        const body = options?.bodyOverride || `A new ${job.category || "job"} was posted within 20 miles of you: "${job.title}"`;
        // In-app notification
        await storage.createNotification({
          userId: u.id,
          title,
          body,
          type: "job",
          jobId: job.id,
        });
        // Background push — fire and forget
        sendPushToUser(u.id, {
          title,
          body,
          url: `/jobs/${job.id}`,
          tag: `pay-increase-${job.id}`,
          sound: "guber_nearby.wav",
        }).catch(() => {});
      }
    }
  } catch (e: any) {
    console.error("[GUBER] notifyNearbyAvailableWorkers error:", e.message);
  }
}

// task-493: tell a worker their auto-imposed hands-free fraud flag has
// been auto-lifted (one of: counter_decayed, clean_streak, stale_no_blocks).
// In-app notification + best-effort push. Errors are swallowed so the
// auto-clear transaction is never affected by a notification failure.
export async function notifyHandsfreeAutoCleared(
  userId: number,
  reason: "counter_decayed" | "clean_streak" | "stale_no_blocks",
) {
  try {
    const title = "Account back in good standing";
    const body =
      reason === "clean_streak"
        ? "Thanks for the clean uploads — your account is back in good standing and your hands-free hold has been lifted."
        : reason === "counter_decayed"
        ? "Your hands-free hold has been lifted automatically. Welcome back to good standing."
        : "It's been a while since any issues — your hands-free hold has been lifted. Welcome back to good standing.";
    await storage.createNotification({
      userId,
      title,
      body,
      type: "system",
      ctaUrl: "/account-settings",
      ctaLabel: "View account",
    });
    sendPushToUser(userId, {
      title,
      body,
      url: "/account-settings",
      tag: `handsfree-cleared-${userId}`,
    }).catch(() => {});
  } catch (e: any) {
    console.error("[GUBER] notifyHandsfreeAutoCleared error:", e?.message);
  }
}

export async function notifyCashDropExpired(dropId: number, dropTitle: string) {
  try {
    const allAttempts = await storage.getCashDropAttempts(dropId);
    const notifyUserIds = [...new Set(
      allAttempts
        .filter((a) => a.status !== "confirmed" && a.status !== "won")
        .map((a) => a.userId)
    )];
    const notifTitle = "Cash Drop Expired";
    const notifBody = `"${dropTitle}" passed its end time without being fully claimed.`;
    for (const uid of notifyUserIds) {
      await storage.createNotification({ userId: uid, title: notifTitle, body: notifBody, type: "cash_drop", cashDropId: dropId, jobId: null });
      sendPushToUser(uid, { title: notifTitle, body: notifBody, url: `/cash-drops`, tag: `cashdrop-expired-${dropId}`, sound: "guber_closed.wav" }).catch(() => {});
    }
    console.log(`[GUBER] Notified ${notifyUserIds.length} participants that Cash Drop #${dropId} expired`);
  } catch (e: any) {
    console.error("[GUBER] notifyCashDropExpired error:", e.message);
  }
}
