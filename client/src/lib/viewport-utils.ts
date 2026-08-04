/**
 * Utility for map-viewport filtering used by the dashboard badge.
 *
 * Extracted so it can be unit-tested independently of the full React
 * component tree.  dashboard.tsx imports and calls these directly.
 */

import type { MapBounds } from "@/components/google-map";

/**
 * Returns true when (lat, lng) falls within the supplied map bounds
 * (inclusive on all four edges).  Returns false when bounds is null
 * (i.e. the map has not yet fired its first idle event), ensuring badge
 * counts stay at 0 rather than showing every pin in the database.
 */
export function inViewport(
  lat: number,
  lng: number,
  mapBounds: MapBounds | null,
): boolean {
  if (!mapBounds) return false;
  return (
    lat >= mapBounds.south &&
    lat <= mapBounds.north &&
    lng >= mapBounds.west &&
    lng <= mapBounds.east
  );
}
