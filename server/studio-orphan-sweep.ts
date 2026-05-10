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
import { studioSessionFiles, studioFeaturedClips, auditLogs, platformSettings, users, notifications } from "../shared/schema.js";
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

// Admin-alert tunables (task-546). All editable via platform_settings.
const ALERT_THRESHOLD_ORPHANS_KEY = "studio_orphan_sweep_alert_threshold_orphans";
const ALERT_THRESHOLD_BYTES_KEY = "studio_orphan_sweep_alert_threshold_bytes";
const ALERT_THROTTLE_HOURS_KEY = "studio_orphan_sweep_alert_throttle_hours";
const ALERT_LAST_AT_KEY = "studio_orphan_sweep_last_alert_at";
const ALERT_LAST_ORPHANS_KEY = "studio_orphan_sweep_last_alert_orphans";
const ALERT_LAST_BYTES_KEY = "studio_orphan_sweep_last_alert_bytes";
const DEFAULT_ALERT_THRESHOLD_ORPHANS = 100;
const DEFAULT_ALERT_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB
const DEFAULT_ALERT_THROTTLE_HOURS = 168; // weekly
// If new waste exceeds last-alerted by more than this fraction, re-alert
// even within the throttle window — the spill is actively growing.
const ALERT_GROWTH_FACTOR = 1.25;
// Hard ceiling on throttle: always re-alert after this regardless of growth.
const ALERT_HARD_REMINDER_MS = 30 * 24 * 60 * 60 * 1000;

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

async function readSetting(key: string): Promise<string | null> {
  try {
    const rows = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
    return rows.length ? String(rows[0].value) : null;
  } catch {
    return null;
  }
}

async function writeSetting(key: string, value: string, description: string): Promise<void> {
  try {
    await db
      .insert(platformSettings)
      .values({ key, value, category: "studio", description })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedAt: new Date() },
      });
  } catch {}
}

function readNumberSetting(raw: string | null, fallback: number): number {
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface AlertDecision {
  send: boolean;
  reason: "below_threshold" | "throttled" | "growth" | "hard_reminder" | "first_alert";
  thresholdOrphans: number;
  thresholdBytes: number;
  throttleHours: number;
}

export interface AlertEvaluationInput {
  totalOrphans: number;
  totalOrphanBytes: number;
  thresholdOrphans: number;
  thresholdBytes: number;
  throttleHours: number;
  lastAlertAt: Date | null;
  lastAlertOrphans: number;
  lastAlertBytes: number;
  now?: Date;
}

// Pure decision function — exported for tests. Takes everything by value so
// the call sites and tests can exercise every code path without DB IO.
export function evaluateAlertNeed(input: AlertEvaluationInput): AlertDecision {
  const base = {
    thresholdOrphans: input.thresholdOrphans,
    thresholdBytes: input.thresholdBytes,
    throttleHours: input.throttleHours,
  };
  const overOrphans = input.totalOrphans > input.thresholdOrphans;
  const overBytes = input.totalOrphanBytes > input.thresholdBytes;
  if (!overOrphans && !overBytes) return { send: false, reason: "below_threshold", ...base };
  if (!input.lastAlertAt) return { send: true, reason: "first_alert", ...base };

  const now = input.now ?? new Date();
  const ageMs = now.getTime() - input.lastAlertAt.getTime();
  if (ageMs >= ALERT_HARD_REMINDER_MS) return { send: true, reason: "hard_reminder", ...base };
  if (ageMs >= input.throttleHours * 60 * 60 * 1000) return { send: true, reason: "first_alert", ...base };

  const grewOrphans = input.totalOrphans > Math.max(input.thresholdOrphans, input.lastAlertOrphans * ALERT_GROWTH_FACTOR);
  const grewBytes = input.totalOrphanBytes > Math.max(input.thresholdBytes, input.lastAlertBytes * ALERT_GROWTH_FACTOR);
  if (grewOrphans || grewBytes) return { send: true, reason: "growth", ...base };

  return { send: false, reason: "throttled", ...base };
}

async function decideAlert(summary: SweepResult): Promise<AlertDecision> {
  const thresholdOrphans = readNumberSetting(
    await readSetting(ALERT_THRESHOLD_ORPHANS_KEY),
    DEFAULT_ALERT_THRESHOLD_ORPHANS,
  );
  const thresholdBytes = readNumberSetting(
    await readSetting(ALERT_THRESHOLD_BYTES_KEY),
    DEFAULT_ALERT_THRESHOLD_BYTES,
  );
  const throttleHours = readNumberSetting(
    await readSetting(ALERT_THROTTLE_HOURS_KEY),
    DEFAULT_ALERT_THROTTLE_HOURS,
  );
  const lastAtRaw = await readSetting(ALERT_LAST_AT_KEY);
  const lastAtMs = lastAtRaw ? Date.parse(lastAtRaw) : NaN;
  const lastAlertAt = Number.isFinite(lastAtMs) ? new Date(lastAtMs) : null;
  const lastAlertOrphans = readNumberSetting(await readSetting(ALERT_LAST_ORPHANS_KEY), 0);
  const lastAlertBytes = readNumberSetting(await readSetting(ALERT_LAST_BYTES_KEY), 0);

  return evaluateAlertNeed({
    totalOrphans: summary.totalOrphans,
    totalOrphanBytes: summary.totalOrphanBytes,
    thresholdOrphans,
    thresholdBytes,
    throttleHours,
    lastAlertAt,
    lastAlertOrphans,
    lastAlertBytes,
  });
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function buildAlertSubject(summary: SweepResult, decision: AlertDecision): string {
  const tag = decision.reason === "growth" ? " (growing)" : decision.reason === "hard_reminder" ? " (still standing)" : "";
  return `[GUBER] Studio orphan sweep: ${summary.totalOrphans} orphans / ${formatBytes(summary.totalOrphanBytes)}${tag}`;
}

function buildAlertBody(summary: SweepResult, decision: AlertDecision): { text: string; html: string } {
  const lines: string[] = [];
  lines.push(`Mode: ${summary.mode}`);
  lines.push(`Finished: ${summary.finishedAt}`);
  lines.push(`Total orphans: ${summary.totalOrphans} (threshold ${decision.thresholdOrphans})`);
  lines.push(`Total orphan bytes: ${formatBytes(summary.totalOrphanBytes)} (threshold ${formatBytes(decision.thresholdBytes)})`);
  lines.push(`Destroyed: ${summary.totalDestroyed} | Failed: ${summary.totalDestroyFailed} | Skipped (too new): ${summary.totalSkippedTooNew}`);
  if (summary.capped) lines.push(`⚠ Destroy cap hit — more orphans remain for the next run.`);
  lines.push("");
  lines.push("Per-folder:");
  for (const f of summary.perFolder) {
    if (!f.orphans && !f.error) continue;
    const err = f.error ? ` ERROR: ${f.error}` : "";
    lines.push(`  • ${f.folder} (${f.resourceType}): ${f.orphans} orphans, ${formatBytes(f.orphanBytes)}, listed=${f.listed}, destroyed=${f.destroyed}${err}`);
  }
  const text = lines.join("\n");

  const rows = summary.perFolder
    .filter((f) => f.orphans || f.error)
    .map(
      (f) =>
        `<tr><td style="padding:4px 10px;border-bottom:1px solid #222;">${f.folder} <span style="color:#888;">(${f.resourceType})</span></td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #222;text-align:right;">${f.orphans}</td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #222;text-align:right;">${formatBytes(f.orphanBytes)}</td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #222;text-align:right;">${f.destroyed}</td>` +
        `<td style="padding:4px 10px;border-bottom:1px solid #222;color:${f.error ? "#f87171" : "#888"};">${f.error || ""}</td></tr>`,
    )
    .join("");
  const html = `
    <div style="font-family:Inter,sans-serif;max-width:640px;margin:0 auto;background:#0a0a0a;color:#fff;padding:32px;border-radius:14px;">
      <h1 style="font-size:22px;font-weight:800;color:#22c55e;margin:0 0 4px;">GUBER Studio Orphan Sweep Alert</h1>
      <p style="font-size:11px;color:#888;letter-spacing:0.18em;text-transform:uppercase;margin:0 0 20px;">${decision.reason.replace(/_/g, " ")}</p>
      <p style="color:#ccc;line-height:1.5;margin:0 0 16px;">
        The orphan sweep found <strong style="color:#fff;">${summary.totalOrphans}</strong> unreferenced Cloudinary asset(s)
        totalling <strong style="color:#fff;">${formatBytes(summary.totalOrphanBytes)}</strong>.
        Mode: <code style="color:#22c55e;">${summary.mode}</code>.
      </p>
      <p style="color:#888;font-size:13px;margin:0 0 16px;">
        Thresholds: ${decision.thresholdOrphans} orphans / ${formatBytes(decision.thresholdBytes)}.
        Destroyed this run: ${summary.totalDestroyed} (failed ${summary.totalDestroyFailed}, skipped too new ${summary.totalSkippedTooNew}).${summary.capped ? ' <span style="color:#fbbf24;">Destroy cap hit.</span>' : ""}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#ccc;margin-top:8px;">
        <thead><tr style="color:#888;text-transform:uppercase;font-size:11px;letter-spacing:0.1em;">
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #333;">Folder</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid #333;">Orphans</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid #333;">Bytes</th>
          <th style="text-align:right;padding:6px 10px;border-bottom:1px solid #333;">Destroyed</th>
          <th style="text-align:left;padding:6px 10px;border-bottom:1px solid #333;">Error</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="padding:8px 10px;color:#666;">No per-folder breakdown.</td></tr>'}</tbody>
      </table>
      <p style="color:#666;font-size:12px;margin:20px 0 0;">
        Tune thresholds via <code>platform_settings</code>:
        <code>${ALERT_THRESHOLD_ORPHANS_KEY}</code>,
        <code>${ALERT_THRESHOLD_BYTES_KEY}</code>,
        <code>${ALERT_THROTTLE_HOURS_KEY}</code>.
      </p>
    </div>`;
  return { text, html };
}

async function sendOrphanSweepAlert(summary: SweepResult, decision: AlertDecision): Promise<{ notified: number; emailed: boolean; emailError?: string }> {
  const subject = buildAlertSubject(summary, decision);
  const { text, html } = buildAlertBody(summary, decision);

  // 1) In-app notifications for every admin.
  let notified = 0;
  try {
    const admins = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "admin"));
    if (admins.length) {
      await db.insert(notifications).values(
        admins.map((a) => ({
          userId: a.id,
          type: "admin_alert",
          title: subject.replace(/^\[GUBER\]\s*/, ""),
          body: `${summary.totalOrphans} orphans · ${formatBytes(summary.totalOrphanBytes)} (${decision.reason.replace(/_/g, " ")}). Open /admin/qa → Orphan Sweep.`,
          ctaUrl: "/admin/qa",
          ctaLabel: "Open QA dashboard",
        })),
      );
      notified = admins.length;

      // 2) Email via Resend if configured.
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        const recipients = admins.map((a) => a.email).filter((e): e is string => !!e);
        if (recipients.length) {
          try {
            const { Resend } = await import("resend");
            const resend = new Resend(resendKey);
            const fromDomain = process.env.RESEND_FROM_DOMAIN || "guberapp.app";
            const { error } = await resend.emails.send({
              from: `GUBER <noreply@${fromDomain}>`,
              to: recipients,
              subject,
              text,
              html,
            });
            if (error) return { notified, emailed: false, emailError: String(error.message || error).slice(0, 300) };
            return { notified, emailed: true };
          } catch (e: any) {
            return { notified, emailed: false, emailError: String(e?.message || e).slice(0, 300) };
          }
        }
      }
    }
  } catch (e: any) {
    return { notified, emailed: false, emailError: String(e?.message || e).slice(0, 300) };
  }
  return { notified, emailed: false };
}

export async function maybeAlertOnSweepResult(summary: SweepResult): Promise<{
  sent: boolean;
  reason: AlertDecision["reason"];
  notified?: number;
  emailed?: boolean;
  emailError?: string;
}> {
  const decision = await decideAlert(summary);
  if (!decision.send) return { sent: false, reason: decision.reason };
  const dispatch = await sendOrphanSweepAlert(summary, decision);
  await writeSetting(ALERT_LAST_AT_KEY, new Date().toISOString(), "Last orphan-sweep alert dispatched (ISO)");
  await writeSetting(ALERT_LAST_ORPHANS_KEY, String(summary.totalOrphans), "Orphan count at last alert");
  await writeSetting(ALERT_LAST_BYTES_KEY, String(summary.totalOrphanBytes), "Orphan bytes at last alert");
  try {
    await db.insert(auditLogs).values({
      userId: null,
      action: "studio_orphan_sweep_alert",
      details: JSON.stringify({
        reason: decision.reason,
        totalOrphans: summary.totalOrphans,
        totalOrphanBytes: summary.totalOrphanBytes,
        thresholdOrphans: decision.thresholdOrphans,
        thresholdBytes: decision.thresholdBytes,
        notified: dispatch.notified,
        emailed: dispatch.emailed,
        emailError: dispatch.emailError,
      }).slice(0, 4000),
    });
  } catch {}
  console.log(
    `[studio-orphan-sweep] alert sent reason=${decision.reason} notified=${dispatch.notified} emailed=${dispatch.emailed}${dispatch.emailError ? ` emailError=${dispatch.emailError}` : ""}`,
  );
  return { sent: true, reason: decision.reason, ...dispatch };
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

  // Fire admin alerts (task-546). Non-blocking on the result; never throws.
  try {
    await maybeAlertOnSweepResult(summary);
  } catch (err: any) {
    console.error("[studio-orphan-sweep] alert dispatch failed:", err?.message || err);
  }

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
