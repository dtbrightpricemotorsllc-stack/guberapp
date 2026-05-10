/**
 * One-shot janitor: find Cloudinary assets in Studio folders that are NOT
 * referenced by any row in `studio_session_files.cloudinaryPublicId` (or by
 * `studio_featured_clips` for the templates folder), and destroy them.
 *
 * As of task-542 the actual sweep logic lives in
 * `server/studio-orphan-sweep.ts` and runs weekly from cron — this script
 * stays around for ad-hoc CLI use and just delegates.
 *
 * Usage:
 *   tsx scripts/cleanup-orphan-commercial-assets.ts            # dry-run
 *   tsx scripts/cleanup-orphan-commercial-assets.ts --delete   # actually destroy
 *
 * Requires CLOUDINARY_* env vars and DATABASE_URL.
 */
import { runStudioOrphanSweep } from "../server/studio-orphan-sweep.js";

async function main() {
  const doDelete = process.argv.includes("--delete");
  console.log(`[orphan-sweep] mode=${doDelete ? "DELETE" : "DRY-RUN"}`);

  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error("CLOUDINARY_CLOUD_NAME not set — aborting.");
    process.exit(1);
  }

  const result = await runStudioOrphanSweep({
    forceDelete: doDelete,
    forceDryRun: !doDelete,
    trigger: "cli",
  });

  console.log(`\n[orphan-sweep] summary`);
  console.log(`  listed       : ${result.totalListed}`);
  console.log(`  orphans      : ${result.totalOrphans}`);
  console.log(`  orphan bytes : ${(result.totalOrphanBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  skipped(new) : ${result.totalSkippedTooNew}`);
  if (doDelete) {
    console.log(`  destroyed    : ${result.totalDestroyed}`);
    console.log(`  failed       : ${result.totalDestroyFailed}`);
    if (result.capped) console.log(`  (hit per-run destroy cap — re-run to continue)`);
  } else {
    console.log(`  (dry-run — re-run with --delete to actually destroy)`);
  }
  console.log(`\n[orphan-sweep] per-folder:`);
  for (const f of result.perFolder) {
    console.log(
      `  ${f.folder} (${f.resourceType}): listed=${f.listed} orphans=${f.orphans} ` +
        `bytes=${((f.orphanBytes || 0) / 1024).toFixed(1)}KB destroyed=${f.destroyed}` +
        (f.error ? ` ERROR=${f.error}` : ""),
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
