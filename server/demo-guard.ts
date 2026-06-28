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
 * For load board routes, checks if the target listing belongs to a demo user.
 * For non-job routes, blocks all mutations.
 */
export async function demoGuard(req: Request, res: Response, next: NextFunction) {
  const userId = req.session?.userId;
  if (!userId) return next();
  const demoIds = await getDemoUserIds();
  if (!demoIds.has(userId)) return next();

  const resourceId = parseInt(req.params?.id);
  if (!isNaN(resourceId)) {
    // Check jobs
    const job = await storage.getJob(resourceId);
    if (job && demoIds.has(job.postedById)) return next();

    // Check load board listings (poster is demo user → allow demo carrier to interact)
    const listing = await storage.getLoadBoardListing(resourceId);
    if (listing && demoIds.has(listing.posterId)) return next();
  }

  return res.status(403).json({ message: "Demo account — this action is not available in demo mode." });
}

export async function isDemoUser(userId: number): Promise<boolean> {
  const demoIds = await getDemoUserIds();
  return demoIds.has(userId);
}

/**
 * Shared visibility predicate for jobs across read endpoints (/api/jobs,
 * /api/jobs/:id, /api/map-jobs, /api/map-jobs/by-zip). Keeps demo and real
 * data partitioned in BOTH directions so a real user never sees fake demo
 * jobs and a demo user never sees real-user jobs they cannot accept.
 *
 * Admins see everything. Job owner and assigned helper always see their
 * own job regardless of partition.
 */
export function viewerCanSeeJobSync(
  job: { postedById: number; assignedHelperId?: number | null },
  viewerId: number | undefined,
  isAdmin: boolean,
  demoIds: Set<number>,
): boolean {
  if (isAdmin) return true;
  if (viewerId == null) {
    // Anonymous viewers only see real (non-demo) jobs.
    return !demoIds.has(job.postedById);
  }
  if (viewerId === job.postedById) return true;
  if (job.assignedHelperId != null && viewerId === job.assignedHelperId) return true;
  const viewerIsDemo = demoIds.has(viewerId);
  const jobIsDemo = demoIds.has(job.postedById);
  return viewerIsDemo === jobIsDemo;
}
