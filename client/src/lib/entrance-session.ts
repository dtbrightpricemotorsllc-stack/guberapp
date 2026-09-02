// This is deliberately tab-scoped: a newly opened tab gets one public entry
// experience, while route changes and refreshes in that tab do not replay it.
const ENTRANCE_SEEN_KEY = "guber_entrance_seen";

let storageUnavailableSeen = false;

export function claimSignedOutEntrance(): boolean {
  try {
    if (sessionStorage.getItem(ENTRANCE_SEEN_KEY) === "1") return false;
    sessionStorage.setItem(ENTRANCE_SEEN_KEY, "1");
    return true;
  } catch {
    if (storageUnavailableSeen) return false;
    storageUnavailableSeen = true;
    return true;
  }
}

export function resetSignedOutEntrance(): void {
  storageUnavailableSeen = false;
  try {
    sessionStorage.removeItem(ENTRANCE_SEEN_KEY);
  } catch {
    // The in-memory fallback above provides the same lifecycle when storage
    // is unavailable (for example, in a privacy-restricted web view).
  }
}