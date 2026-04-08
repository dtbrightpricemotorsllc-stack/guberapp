import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { DEMO_CONSUMER_EMAIL, DEMO_BUSINESS_EMAIL } from "./seed-demo";

const DEMO_EMAILS = new Set<string>([DEMO_CONSUMER_EMAIL, DEMO_BUSINESS_EMAIL]);

let _demoIds: Set<number> | null = null;

export async function getDemoUserIds(): Promise<Set<number>> {
  if (_demoIds) return _demoIds;
  const ids = new Set<number>();
  for (const email of DEMO_EMAILS) {
    const u = await storage.getUserByEmail(email);
    if (u) ids.add(u.id);
  }
  _demoIds = ids;
  return ids;
}

export function invalidateDemoIdCache() {
  _demoIds = null;
}

/**
 * Express middleware: blocks demo accounts from mutating real-user data.
 * Demo-to-demo interactions ARE allowed so the demo can be used as a full walkthrough.
 * For job routes, checks if the target job belongs to a demo user.
 * For non-job routes, blocks all mutations.
 */
export async function demoGuard(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return next();
  const demoIds = await getDemoUserIds();
  if (!demoIds.has(userId)) return next();

  const jobId = parseInt(req.params?.id);
  if (!isNaN(jobId)) {
    const job = await storage.getJob(jobId);
    if (job && demoIds.has(job.postedById)) {
      return next();
    }
  }

  return res.status(403).json({ message: "Demo account — this action is not available in demo mode." });
}

export async function isDemoUser(userId: number): Promise<boolean> {
  const demoIds = await getDemoUserIds();
  return demoIds.has(userId);
}
