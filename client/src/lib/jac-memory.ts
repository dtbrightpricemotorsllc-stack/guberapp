import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type MemoryCategory = "personal" | "work" | "marketplace" | "vi" | "load_board" | "preferences";
export type MemorySource = "user_said" | "extracted" | "system";

export interface JacMemoryEntry {
  id: number;
  category: MemoryCategory;
  key: string;
  value: unknown;
  source: MemorySource;
  updated_at: string;
}

// ── React hook ────────────────────────────────────────────────────────────────
export function useJacMemory() {
  return useQuery<JacMemoryEntry[]>({
    queryKey: ["/api/jac/memory"],
    staleTime: 60_000,
  });
}

// ── Save a memory entry (returns a mutation) ──────────────────────────────────
export function useSaveJacMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ category, key, value, source = "user_said" }: {
      category: MemoryCategory;
      key: string;
      value: unknown;
      source?: MemorySource;
    }) => apiRequest("POST", "/api/jac/memory", { category, key, value, source }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/jac/memory"] }),
  });
}

// ── Fire-and-forget helper (no hook needed, just calls the API directly) ──────
export async function saveJacMemory(
  category: MemoryCategory,
  key: string,
  value: unknown,
  source: MemorySource = "user_said"
): Promise<void> {
  try {
    await fetch("/api/jac/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, key, value, source }),
      credentials: "include",
    });
  } catch {
    // fire-and-forget: silently ignore errors
  }
}

// ── Extract and save memories from conversation text ─────────────────────────
// Called after each AI turn for logged-in users; regex-based, no extra AI call
const ZIP_RE = /\b(\d{5})\b/;
const WORK_RADIUS_RE = /\b(\d{1,3})\s*miles?\b/i;
const NAME_RE = /(?:call me|my name is|i(?:'m| am)) ([A-Z][a-z]{1,19})\b/i;
const TOWING_RE = /\b(tow|towing|hauling|transport)\b/i;
const VEHICLE_SELL_RE = /\b(sell|selling|selling my|list my)\b.{0,40}\b(car|truck|vehicle|motorcycle|suv|van|boat|rv|trailer)\b/i;
const VI_RE = /\b(inspect|inspection|verify|v&i|dealer)\b/i;
const DOT_RE = /\bDOT\b/;
const TRAILER_RE = /\b(flatbed|step deck|dry van|reefer|lowboy|hotshot|trailer)\b/i;

export function extractAndSaveMemory(userText: string, _assistantText: string): void {
  // Run async — caller does not await
  (async () => {
    const entries: Array<{ category: MemoryCategory; key: string; value: unknown }> = [];

    const zip = ZIP_RE.exec(userText)?.[1];
    if (zip) entries.push({ category: "personal", key: "home_zip", value: zip });

    const radius = WORK_RADIUS_RE.exec(userText)?.[1];
    if (radius) entries.push({ category: "preferences", key: "work_radius_miles", value: parseInt(radius) });

    const name = NAME_RE.exec(userText)?.[1];
    if (name) entries.push({ category: "personal", key: "preferred_name", value: name });

    if (TOWING_RE.test(userText)) entries.push({ category: "work", key: "typical_job_type", value: "towing" });
    if (VEHICLE_SELL_RE.test(userText)) entries.push({ category: "marketplace", key: "frequent_category", value: "vehicles" });
    if (VI_RE.test(userText)) entries.push({ category: "vi", key: "frequent_inspection_type", value: "vehicle" });
    if (DOT_RE.test(userText)) entries.push({ category: "load_board", key: "has_dot", value: true });
    const trailer = TRAILER_RE.exec(userText)?.[1];
    if (trailer) entries.push({ category: "load_board", key: "trailer_type", value: trailer.toLowerCase() });

    for (const e of entries) {
      await saveJacMemory(e.category, e.key, e.value, "extracted");
    }
  })();
}
