// Studio orphan-asset janitor (task-542).
//
// Periodic Cloudinary sweep across every Studio folder. Anything not
// referenced by `studio_session_files.cloudinaryPublicId` (or by the
// `studio_featured_clips` admin curation table for the `guber-studio-templates`
// folder) is considered an orphan.
//
// Default: dry-run. Real destruction is gated by the platform_settings key
// `studio_orphan_sweep_destroy = "true"` (admin-editable from the existing
// `/api/admin/settings` UI). Each run writes a single `studio_orphan_sweep`
// audit log entry with the per-folder breakdown so admins can monitor the
// trend without opening the box.
//
// The original one-shot CLI (scripts/cleanup-orphan-commercial-assets.ts)
// continues to work — it now delegates to runStudioOrphanSweep() so behaviour
// stays in sync.

import { db } from "./db.js";
import { studioSessionFiles, studioFeaturedClips, auditLogs, platformSettings } from "../shared/schema.js";
import { sql, eq } from "drizzle-orm";

export type StudioSweepResourceType = "image" | "video";

export interface StudioSweepFolder {
  folder: string;
  resourceType: StudioSweepResourceType;
}

// Every Studio Cloudinary folder we currently upload into. Audio is uploaded
// with resource_type=video (see reHost calls in server/routes.ts), so the
// *-music / *-voice / -music folders are listed under "video".
export const STUDIO_SWEEP_FOLDERS: StudioSweepFolder[] = [
  { folder: "guber-studio-v2-commercial", resourceType: "video" },
  { folder: "guber-studio-v2-commercial-music", resourceType: "video" },
  { folder: "guber-studio-v2-commercial-voice", resourceType: "video" },
  { folder: "guber-studio-v2-uploads", resourceType: "image" },
  { folder: "guber-studio-v2-uploads", resourceType: "video" },
  { folder: "guber-studio-v2-motion", resourceType: "video" },
  { folder: "guber-studio-v2-wan", resourceType: "video" },
  { folder: "guber-studio-v2-quickpic", resourceType: "image" },
  { folder: "guber-studio-v2-music", resourceType: "video" },
  { folder: "guber-studio-v2-mirror", resourceType: "video" },
  { folder: "guber-studio-templates", resourceType: "image" },
  { folder: "guber-studio-templates", resourceType: "video" },
];

const MAX_PER_PAGE = 500;
// Don't touch anything younger than this — avoids racing in-flight uploads
// that haven't yet written their row into studio_session_files.
const MIN_ORPHAN_AGE_MS = 60 * 60 * 1000; // 1 hour
// Hard cap on destroys per run so a runaway bug can't wipe everything in one
// sweep. Anything beyond this is reported but left for the next run.
const MAX_DESTROY_PER_RUN = 500;

const LAST_RUN_SETTING_KEY = "studio_orphan_sweep_last_run_at";
const DESTROY_SETTING_KEY = "studio_orphan_sweep_destroy";
// Run at most once per this interval when invoked from the cron sweep.
const RUN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly

type CldResource = { public_id: string; bytes?: number; created_at?: string };

export interface FolderResult {
  folder: string;
  resourceType: StudioSweepResourceType;
  listed: number;
  orphans: number;
  orphanBytes: number;
  destroyed: number;
  destroyFailed: number;
  skippedTooNew: number;
  error?: string;
}

export interface SweepResult {
  mode: "dry-run" | "delete";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalListed: number;
  totalOrphans: number;
  totalOrphanBytes: number;
  totalDestroyed: number;
  totalDestroyFailed: number;
  totalSkippedTooNew: number;
  capped: boolean;
  perFolder: FolderResult[];
}

// Extract the Cloudinary public_id (folder/name, no extension) from a full
// delivery URL. Used for the `studio_featured_clips` table where we only
// store the URL, not the bare publicId.
//
// Cloudinary URL shape:
//   https://res.cloudinary.com/<cloud>/<resource>/<delivery>/[<transforms>/]*[v<version>/]<public_id>.<ext>
// Where <transforms> is one or more comma-separated `<key>_<value>` tokens
// (e.g. `c_fill,w_400`) and <version> is `v` followed by digits. We walk
// segments after `/upload/` (or `/fetch/`, `/private/`, …) and drop anything
// that looks like a transform or version segment.
export function extractPublicIdFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("cloudinary.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // delivery type lives at parts[2] (cloud/resource/delivery/…)
    const deliveryTypes = new Set(["upload", "fetch", "private", "authenticated", "sprite", "facebook", "twitter"]);
    const deliveryIdx = parts.findIndex((p) => deliveryTypes.has(p));
    if (deliveryIdx < 0 || deliveryIdx === parts.length - 1) return null;
    let rest = parts.slice(deliveryIdx + 1);

    const isVersion = (s: string) => /^v\d+$/.test(s);
    // A transform segment is composed of comma-separated tokens that each
    // start with `<one-or-two-letters>_` (e.g. `c_fill`, `w_400`, `fl_lossy`).
    const isTransform = (s: string) =>
      s.split(",").every((tok) => /^[a-z]{1,3}_/.test(tok));

    while (rest.length > 1 && (isVersion(rest[0]) || isTransform(rest[0]))) {
      rest = rest.slice(1);
    }
    if (!rest.length) return null;
    const joined = rest.join("/");
    return joined.replace(/\.[^./]+$/, "");
  } catch {
    return null;
  }
}

async function loadReferencedPublicIds(): Promise<Set<string>> {
  const referenced = new Set<string>();

  const rows = await db
    .select({ pid: studioSessionFiles.cloudinaryPublicId })
    .from(studioSessionFiles)
    .where(sql`${studioSessionFiles.cloudinaryPublicId} IS NOT NULL`);
  for (const r of rows) {
    if (r.pid) referenced.add(r.pid);
  }

  // Admin-curated trending clips live in guber-studio-templates and are
  // referenced by URL, not publicId — extract the publicId from each.
  const featured = await db
    .select({ video: studioFeaturedClips.videoUrl, poster: studioFeaturedClips.posterUrl })
    .from(studioFeaturedClips);
  for (const f of featured) {
    const v = extractPublicIdFromUrl(f.video || "");
    if (v) referenced.add(v);
    const p = extractPublicIdFromUrl(f.poster || "");
    if (p) referenced.add(p);
  }

  return referenced;
}

async function listFolder(
  cloudinary: any,
  folder: string,
  resourceType: StudioSweepResourceType,
): Promise<CldResource[]> {
  const all: CldResource[] = [];
  let nextCursor: string | undefined;
  do {
    const res: any = await cloudinary.api.resources({
      type: "upload",
      resource_type: resourceType,
      prefix: `${folder}/`,
      max_results: MAX_PER_PAGE,
      next_cursor: nextCursor,
    });
    for (const r of res.resources || []) {
      all.push({ public_id: r.public_id, bytes: r.bytes, created_at: r.created_at });
    }
    nextCursor = res.next_cursor;
  } while (nextCursor);
  return all;
}

async function destroyOne(
  cloudinary: any,
  publicId: string,
  resourceType: StudioSweepResourceType,
): Promise<boolean> {
  try {
    const res: any = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    return res?.result === "ok" || res?.result === "not found";
  } catch {
    return false;
  }
}

export interface RunOptions {
  // Force destroy regardless of platform setting (used by the admin "run now"
  // endpoint when explicit confirmation is supplied).
  forceDelete?: boolean;
  // Force dry-run regardless of platform setting.
  forceDryRun?: boolean;
  // Caller hint for the audit log details (e.g. "cron", "admin", "cli").
  trigger?: string;
  // Admin user id when triggered from the dashboard.
  triggeredByUserId?: number | null;
}

async function readDestroyEnabled(): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, DESTROY_SETTING_KEY))
      .limit(1);
    return rows.length > 0 && String(rows[0].value).toLowerCase() === "true";
  } catch {
    return false;
  }
}

async function writeLastRunStamp(): Promise<void> {
  const now = new Date().toISOString();
  try {
    await db
      .insert(platformSettings)
      .values({ key: LAST_RUN_SETTING_KEY, value: now, category: "studio", description: "Last orphan sweep run (ISO)" })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value: now, updatedAt: new Date() },
      });
  } catch {}
}

async function readLastRunStamp(): Promise<Date | null> {
  try {
    const rows = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, LAST_RUN_SETTING_KEY))
      .limit(1);
    if (!rows.length) return null;
    const t = Date.parse(String(rows[0].value));
    return Number.isFinite(t) ? new Date(t) : null;
  } catch {
    return null;
  }
}

export async function runStudioOrphanSweep(opts: RunOptions = {}): Promise<SweepResult> {
  const startedAt = new Date();
  const trigger = opts.trigger || "manual";

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    throw new Error("CLOUDINARY_CLOUD_NAME not set");
  }
  const cloudinary = (await import("./cloudinary.js")).default;

  const destroyEnabled = opts.forceDryRun
    ? false
    : opts.forceDelete
      ? true
      : await readDestroyEnabled();
  const mode: "dry-run" | "delete" = destroyEnabled ? "delete" : "dry-run";

  const referenced = await loadReferencedPublicIds();
  const ageCutoff = Date.now() - MIN_ORPHAN_AGE_MS;

  const perFolder: FolderResult[] = [];
  let totalListed = 0;
  let totalOrphans = 0;
  let totalOrphanBytes = 0;
  let totalDestroyed = 0;
  let totalDestroyFailed = 0;
  let totalSkippedTooNew = 0;
  let destroyBudget = MAX_DESTROY_PER_RUN;
  let capped = false;

  for (const { folder, resourceType } of STUDIO_SWEEP_FOLDERS) {
    const result: FolderResult = {
      folder,
      resourceType,
      listed: 0,
      orphans: 0,
      orphanBytes: 0,
      destroyed: 0,
      destroyFailed: 0,
      skippedTooNew: 0,
    };
    let resources: CldResource[];
    try {
      resources = await listFolder(cloudinary, folder, resourceType);
    } catch (err: any) {
      result.error = String(err?.message || err).slice(0, 300);
      perFolder.push(result);
      continue;
    }
    result.listed = resources.length;
    totalListed += resources.length;

    for (const r of resources) {
      if (referenced.has(r.public_id)) continue;
      const createdMs = r.created_at ? Date.parse(r.created_at) : 0;
      if (createdMs && createdMs > ageCutoff) {
        result.skippedTooNew++;
        totalSkippedTooNew++;
        continue;
      }
      result.orphans++;
      result.orphanBytes += r.bytes || 0;
      totalOrphans++;
      totalOrphanBytes += r.bytes || 0;
      if (destroyEnabled) {
        if (destroyBudget <= 0) {
          capped = true;
          continue;
        }
        destroyBudget--;
        const ok = await destroyOne(cloudinary, r.public_id, resourceType);
        if (ok) {
          result.destroyed++;
          totalDestroyed++;
        } else {
          result.destroyFailed++;
          totalDestroyFailed++;
        }
      }
    }
    perFolder.push(result);
  }

  const finishedAt = new Date();
  const summary: SweepResult = {
    mode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    totalListed,
    totalOrphans,
    totalOrphanBytes,
    totalDestroyed,
    totalDestroyFailed,
    totalSkippedTooNew,
    capped,
    perFolder,
  };

  await writeLastRunStamp();
  try {
    await db.insert(auditLogs).values({
      userId: opts.triggeredByUserId ?? null,
      action: "studio_orphan_sweep",
      details: JSON.stringify({ trigger, ...summary }).slice(0, 8000),
    });
  } catch {}

  console.log(
    `[studio-orphan-sweep] ${mode} trigger=${trigger} listed=${totalListed} orphans=${totalOrphans} ` +
      `bytes=${(totalOrphanBytes / 1024 / 1024).toFixed(2)}MB destroyed=${totalDestroyed} ` +
      `failed=${totalDestroyFailed} skipped_too_new=${totalSkippedTooNew}${capped ? " (capped)" : ""}`,
  );

  return summary;
}

// Cron entry-point: runs at most once per RUN_INTERVAL_MS. Returns null when
// it skipped (so the cron driver can stay quiet).
export async function maybeRunStudioOrphanSweep(): Promise<SweepResult | null> {
  if (!process.env.CLOUDINARY_CLOUD_NAME) return null;
  const last = await readLastRunStamp();
  if (last && Date.now() - last.getTime() < RUN_INTERVAL_MS) return null;
  try {
    return await runStudioOrphanSweep({ trigger: "cron" });
  } catch (err: any) {
    console.error("[studio-orphan-sweep] cron run failed:", err?.message || err);
    return null;
  }
}
