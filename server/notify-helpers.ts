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
        }).catch(() => {});
      }
    }
  } catch (e: any) {
    console.error("[GUBER] notifyNearbyAvailableWorkers error:", e.message);
  }
}
