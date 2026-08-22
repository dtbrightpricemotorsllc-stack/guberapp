/**
 * Background location permission flow for Android.
 *
 * Google Play requires an in-app disclosure explaining WHY background location
 * is needed before the Android OS permission dialog fires.
 *
 * This module uses the same event-driven pattern as gps.ts / GpsDisclaimerModal:
 * ensureBackgroundLocation() fires a window event → BackgroundLocationModal
 * shows → user acts → resolves the promise.
 *
 * Tracking always proceeds even if permission is denied — foreground tracking
 * (app open) works with ACCESS_FINE_LOCATION / WhenInUse alone.
 */

import { Capacitor } from "@capacitor/core";
import { ForegroundTracking } from "@/lib/foreground-tracking";

const STORAGE_KEY = "guber_bg_location_requested";

type Resolver = (granted: boolean) => void;
const pending: Resolver[] = [];
let disclosurePending = false;

export function isBackgroundLocationDisclosurePending(): boolean {
  return disclosurePending;
}

/** Called by the modal when the user dismisses without enabling. */
export function dismissBackgroundLocationDisclosure(): void {
  disclosurePending = false;
  const cbs = pending.splice(0);
  cbs.forEach((cb) => cb(false));
  try { window.dispatchEvent(new Event("guber:bg-location-resolved")); } catch {}
}

/** Called by the modal after the OS request completes. */
export function resolveBackgroundLocationDisclosure(granted: boolean): void {
  disclosurePending = false;
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  const cbs = pending.splice(0);
  cbs.forEach((cb) => cb(granted));
  try { window.dispatchEvent(new Event("guber:bg-location-resolved")); } catch {}
}

/** Whether we have already gone through the disclosure at least once. */
export function hasRequestedBackgroundLocation(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}

/**
 * Check the current background location permission without prompting.
 * Returns "granted", "denied", or "prompt".
 * Always returns "granted" on non-Android-native platforms.
 */
export async function checkBackgroundLocationPermission(): Promise<"granted" | "denied" | "prompt"> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return "granted";
  try {
    const result = await ForegroundTracking.checkBackgroundLocation();
    const s = result.status;
    if (s === "granted") return "granted";
    if (s === "denied") return "denied";
    return "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * Perform the actual OS permission request (called from inside the modal after
 * the user acknowledges the in-app disclosure).
 */
export async function requestBackgroundLocationFromOS(): Promise<"granted" | "denied"> {
  try {
    const result = await ForegroundTracking.requestBackgroundLocation();
    return result.status === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * Ensure background location permission, showing the in-app disclosure if
 * needed. Always resolves — never rejects. Returns true if granted/acknowledged.
 *
 * - Web: no-op (returns true immediately).
 * - Android: shows disclosure + requests ACCESS_BACKGROUND_LOCATION from OS.
 *
 * If we already asked once and they denied, shows the disclosure again only if
 * forceReprompt is set — otherwise silently resolves false.
 */
export function ensureBackgroundLocation(
  context: "job" | "load_board" | "asset_protection",
  opts?: { forceReprompt?: boolean },
): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return Promise.resolve(true);
  }

  // Android — check OS permission state then show disclosure if needed
  return checkBackgroundLocationPermission().then((status) => {
    if (status === "granted") return true;

    if (status === "denied" && hasRequestedBackgroundLocation() && !opts?.forceReprompt) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      pending.push(resolve);
      disclosurePending = true;
      try {
        window.dispatchEvent(
          new CustomEvent("guber:show-bg-location-disclosure", { detail: { context, platform: "android" } }),
        );
      } catch {
        pending.splice(pending.indexOf(resolve), 1);
        resolve(false);
      }
    });
  });
}
