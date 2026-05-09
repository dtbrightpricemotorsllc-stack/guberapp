/**
 * One-shot janitor: find Cloudinary assets in the Commercial Builder
 * music/voice folders that are NOT referenced by any row in
 * `studio_session_files.cloudinary_public_id`, and destroy them.
 *
 * Background: until task-538, every failed Commercial Builder run that got
 * past the motion step left its music (and sometimes voice) asset behind on
 * Cloudinary. Those orphans live in:
 *   - guber-studio-v2-commercial-music
 *   - guber-studio-v2-commercial-voice
 * and quietly cost money every month. The motion video itself is uploaded
 * to `guber-studio-v2-commercial` and we sweep that too for completeness —
 * any properly-attached row in studio_session_files is preserved.
 *
 * Both folders store audio under resource_type=video (see reHost calls in
 * server/routes.ts), so the admin API is queried with resource_type=video.
 *
 * Usage:
 *   tsx scripts/cleanup-orphan-commercial-assets.ts            # dry-run
 *   tsx scripts/cleanup-orphan-commercial-assets.ts --delete   # actually destroy
 *
 * Requires CLOUDINARY_* env vars and DATABASE_URL.
 */
import cloudinary from "../server/cloudinary.js";
import { db } from "../server/db.js";
import { studioSessionFiles } from "../shared/schema.js";
import { sql } from "drizzle-orm";

const FOLDERS = [
  "guber-studio-v2-commercial",
  "guber-studio-v2-commercial-music",
  "guber-studio-v2-commercial-voice",
];

const RESOURCE_TYPE = "video"; // music/voice/video are all stored as video
const MAX_PER_PAGE = 500;

type CldResource = { public_id: string; bytes?: number; created_at?: string };

async function listFolder(folder: string): Promise<CldResource[]> {
  const all: CldResource[] = [];
  let nextCursor: string | undefined;
  do {
    const res: any = await cloudinary.api.resources({
      type: "upload",
      resource_type: RESOURCE_TYPE,
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

async function loadReferencedPublicIds(): Promise<Set<string>> {
  const rows = await db
    .select({ pid: studioSessionFiles.cloudinaryPublicId })
    .from(studioSessionFiles)
    .where(sql`${studioSessionFiles.cloudinaryPublicId} IS NOT NULL`);
  return new Set(rows.map((r) => r.pid as string));
}

async function destroyOne(publicId: string): Promise<boolean> {
  try {
    const res: any = await cloudinary.uploader.destroy(publicId, {
      resource_type: RESOURCE_TYPE,
      invalidate: true,
    });
    return res?.result === "ok" || res?.result === "not found";
  } catch (err: any) {
    console.error(`  destroy failed for ${publicId}: ${err?.message || err}`);
    return false;
  }
}

async function main() {
  const doDelete = process.argv.includes("--delete");
  const mode = doDelete ? "DELETE" : "DRY-RUN";
  console.log(`[orphan-sweep] mode=${mode}`);
  console.log(`[orphan-sweep] folders: ${FOLDERS.join(", ")}`);

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error("CLOUDINARY_CLOUD_NAME not set — aborting.");
    process.exit(1);
  }

  console.log(`[orphan-sweep] loading referenced publicIds from studio_session_files…`);
  const referenced = await loadReferencedPublicIds();
  console.log(`[orphan-sweep] ${referenced.size} referenced publicIds`);

  let totalListed = 0;
  let totalOrphans = 0;
  let totalBytes = 0;
  let totalDeleted = 0;
  let totalDeleteFailed = 0;

  for (const folder of FOLDERS) {
    console.log(`\n[orphan-sweep] scanning ${folder}…`);
    let resources: CldResource[];
    try {
      resources = await listFolder(folder);
    } catch (err: any) {
      console.error(`  list failed: ${err?.message || err}`);
      continue;
    }
    console.log(`  found ${resources.length} assets`);
    totalListed += resources.length;

    const orphans = resources.filter((r) => !referenced.has(r.public_id));
    console.log(`  ${orphans.length} orphan(s)`);
    for (const o of orphans) {
      totalOrphans++;
      totalBytes += o.bytes || 0;
      const sizeKb = ((o.bytes || 0) / 1024).toFixed(1);
      console.log(`    ${doDelete ? "destroy" : "would destroy"}: ${o.public_id} (${sizeKb} KB, created ${o.created_at})`);
      if (doDelete) {
        const ok = await destroyOne(o.public_id);
        if (ok) totalDeleted++;
        else totalDeleteFailed++;
      }
    }
  }

  console.log(`\n[orphan-sweep] summary`);
  console.log(`  listed       : ${totalListed}`);
  console.log(`  orphans      : ${totalOrphans}`);
  console.log(`  orphan bytes : ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  if (doDelete) {
    console.log(`  destroyed    : ${totalDeleted}`);
    console.log(`  failed       : ${totalDeleteFailed}`);
  } else {
    console.log(`  (dry-run — re-run with --delete to actually destroy)`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
