import type { StudioModelPricing } from "@shared/schema";

// TTL is configurable via STUDIO_TOOLS_CACHE_TTL_MS (milliseconds).
// Default: 45 000 ms (45 s). Lower values reduce staleness after an admin
// price/tile update at the cost of more DB round-trips; higher values reduce
// DB load but extend the stale window. Set to 0 to disable caching entirely.
// Trade-off: any admin change (price, tile image) will be invisible to readers
// for up to TTL_MS unless the change goes through the admin PATCH endpoints,
// which call invalidateStudioToolsCache() automatically.
function parseTtlMs(): number {
  const DEFAULT = 45_000;
  const raw = process.env.STUDIO_TOOLS_CACHE_TTL_MS;
  if (raw === undefined || raw === "") return DEFAULT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(
      `[studio-tools-cache] Invalid STUDIO_TOOLS_CACHE_TTL_MS value "${raw}"; falling back to ${DEFAULT} ms`,
    );
    return DEFAULT;
  }
  return parsed;
}

const TTL_MS = parseTtlMs();

let cachedTools: StudioModelPricing[] | null = null;
let cachedAt = 0;

export function getStudioToolsCache(): StudioModelPricing[] | null {
  if (cachedTools && TTL_MS > 0 && Date.now() - cachedAt < TTL_MS) {
    return cachedTools;
  }
  return null;
}

export function setStudioToolsCache(tools: StudioModelPricing[]): void {
  cachedTools = tools;
  cachedAt = Date.now();
}

export function invalidateStudioToolsCache(): void {
  cachedTools = null;
  cachedAt = 0;
}
