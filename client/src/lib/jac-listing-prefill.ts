const KEY = "jac_listing_prefill";

export type ListingPrefillType = "vehicle" | "item" | "house" | "load" | "vi" | "service_offer";

export interface ListingPrefill {
  type: ListingPrefillType;
  collected: Record<string, any>;
  route: string;
  savedAt: number;
}

export function saveListingPrefill(data: Omit<ListingPrefill, "savedAt">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {}
}

export function saveServiceOfferPrefill(collected: Record<string, any>) {
  saveListingPrefill({
    type: "service_offer",
    collected,
    route: "/offer-service",
  });
}

export function readListingPrefill(): ListingPrefill | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ListingPrefill;
    if (Date.now() - p.savedAt > 30 * 60 * 1000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function clearListingPrefill() {
  try { localStorage.removeItem(KEY); } catch {}
}
