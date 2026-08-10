import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Detect browser IANA timezone once at module load — e.g. "America/New_York".
const BROWSER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
})();

/**
 * Silently syncs the user's IANA browser timezone to their server profile
 * whenever they log in or if the stored timezone doesn't match the current
 * browser timezone. The stored value is used server-side for availability-
 * window validation so cross-timezone scenarios (worker in NY, job in CA)
 * never get rejected by UTC calendar-day boundary checks.
 *
 * Errors are swallowed — a failed sync never surfaces to the user.
 */
export function useTimezoneSync() {
  const { data: me } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  useEffect(() => {
    if (!me?.id || !BROWSER_TZ) return;
    if (me.timezone === BROWSER_TZ) return; // already up to date

    apiRequest("PATCH", `/api/users/${me.id}`, { timezone: BROWSER_TZ })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }))
      .catch(() => {}); // best-effort; never block the user
  }, [me?.id, me?.timezone]);
}

/** Returns the IANA timezone for the current browser session. */
export function getBrowserTimezone(): string {
  return BROWSER_TZ ?? "America/New_York";
}
