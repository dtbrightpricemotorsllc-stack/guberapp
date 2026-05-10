// task-541: Shared safety net for orphan Cloudinary assets in Studio
// generators. Every Studio generate path follows the same pattern:
//   1. provider call → (2) re-host on Cloudinary → (3) write studio_session_files row
// If step 3 (or any bookkeeping after the re-host) throws, the asset we just
// uploaded to paid Cloudinary storage is orphaned. This tracker lets each
// generator declare ownership of the assets it created and best-effort
// destroy them on any abort path.
//
// Lifted out of the commercial builder (task-538) so wan_motion /
// kling_motion_control / minimax_music / mirror_motion get the same
// guarantee — see runStudioGeneration() in server/routes.ts.

export type CloudinaryResourceType = "video" | "image" | "raw";

export interface CloudinaryUploaderLike {
  uploader: {
    destroy: (publicId: string, opts: { resource_type: CloudinaryResourceType }) => Promise<unknown>;
  };
}

export interface CloudinaryCleanup {
  track(publicId: string | null | undefined, resourceType: CloudinaryResourceType): void;
  cleanup(label: string): Promise<void>;
  clear(): void;
  readonly size: number;
}

export function createCloudinaryCleanup(cloudinary: CloudinaryUploaderLike | null | undefined): CloudinaryCleanup {
  const assets: { publicId: string; resourceType: CloudinaryResourceType }[] = [];
  return {
    track(publicId, resourceType) {
      if (publicId) assets.push({ publicId, resourceType });
    },
    async cleanup(label: string) {
      if (!cloudinary || assets.length === 0) return;
      for (const a of assets) {
        try {
          await cloudinary.uploader.destroy(a.publicId, { resource_type: a.resourceType });
        } catch (err: any) {
          console.warn(
            `[GUBER][studio][${label}] cloudinary cleanup failed for ${a.publicId} (${a.resourceType}): ${err?.message || err}`
          );
        }
      }
      assets.length = 0;
    },
    clear() {
      assets.length = 0;
    },
    get size() {
      return assets.length;
    },
  };
}
