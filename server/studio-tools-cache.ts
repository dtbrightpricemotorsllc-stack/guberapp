import type { StudioModelPricing } from "@shared/schema";

const TTL_MS = 45_000;

let cachedTools: StudioModelPricing[] | null = null;
let cachedAt = 0;

export function getStudioToolsCache(): StudioModelPricing[] | null {
  if (cachedTools && Date.now() - cachedAt < TTL_MS) {
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
