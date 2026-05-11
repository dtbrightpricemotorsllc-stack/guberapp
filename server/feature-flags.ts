import { db } from "./db";
import { featureFlags, type FeatureFlag } from "@shared/schema";
import { FEATURE_FLAGS, type FeatureFlagKey } from "@shared/feature-flags";
import { eq } from "drizzle-orm";

export interface FlagViewer {
  id?: number | null;
  role?: string | null;
}

let cache: Map<string, FeatureFlag> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000;

async function loadCache(): Promise<Map<string, FeatureFlag>> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const rows = await db.select().from(featureFlags);
  const map = new Map<string, FeatureFlag>();
  for (const r of rows) map.set(r.key, r);
  cache = map;
  cacheLoadedAt = Date.now();
  return map;
}

export function invalidateFlagCache() {
  cache = null;
  cacheLoadedAt = 0;
}

/** Ensure a row exists for every registered flag using the registry defaults. */
export async function ensureFlagsSeeded(): Promise<void> {
  const map = await loadCache();
  for (const def of FEATURE_FLAGS) {
    if (!map.has(def.key)) {
      try {
        await db.insert(featureFlags).values({
          key: def.key,
          enabled: def.defaultEnabled,
          rolloutScope: def.defaultScope,
          allowedRoles: [],
          allowedUserIds: [],
          note: "auto-seeded from registry",
        }).onConflictDoNothing();
      } catch {}
    }
  }
  // One-time migration: studio_v2 was originally seeded with "role" scope.
  // Lift to "global" so all authenticated users (including Apple reviewers)
  // can access Studio without needing a specific role assignment.
  const studioV2 = map.get("studio_v2");
  if (studioV2 && studioV2.rolloutScope === "role" && (!studioV2.allowedRoles || studioV2.allowedRoles.length === 0)) {
    try {
      await db.update(featureFlags)
        .set({ rolloutScope: "global" })
        .where(eq(featureFlags.key, "studio_v2"));
    } catch {}
  }
  invalidateFlagCache();
}

export async function isFeatureEnabledFor(key: FeatureFlagKey, viewer: FlagViewer | null | undefined): Promise<boolean> {
  const map = await loadCache();
  const row = map.get(key);
  if (!row) {
    const def = FEATURE_FLAGS.find((d) => d.key === key);
    return def?.defaultEnabled ?? false;
  }
  if (!row.enabled) return false;
  switch (row.rolloutScope) {
    case "off":
      return false;
    case "global":
      return true;
    case "role": {
      const roles = row.allowedRoles ?? [];
      const role = viewer?.role ?? null;
      // Admin always passes role-scoped flags so admins can preview gated UI.
      if (role === "admin") return true;
      return !!role && roles.includes(role);
    }
    case "allowlist": {
      const ids = row.allowedUserIds ?? [];
      if (viewer?.role === "admin") return true;
      return !!viewer?.id && ids.includes(viewer.id);
    }
    default:
      return row.enabled;
  }
}

export async function listAllFlags(): Promise<FeatureFlag[]> {
  await ensureFlagsSeeded();
  invalidateFlagCache();
  const map = await loadCache();
  return FEATURE_FLAGS.map((def) => map.get(def.key)).filter(Boolean) as FeatureFlag[];
}

export async function updateFlag(
  key: FeatureFlagKey,
  patch: Partial<Pick<FeatureFlag, "enabled" | "rolloutScope" | "allowedRoles" | "allowedUserIds" | "note">>,
  updatedBy: number,
): Promise<FeatureFlag> {
  await ensureFlagsSeeded();
  const [row] = await db
    .update(featureFlags)
    .set({ ...patch, updatedBy, updatedAt: new Date() })
    .where(eq(featureFlags.key, key))
    .returning();
  invalidateFlagCache();
  return row;
}
