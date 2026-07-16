/**
 * Background location permission flow (Android + iOS).
 *
 * Both Google Play and Apple App Store (guideline 5.1.c) require an in-app
 * disclosure explaining WHY background location is needed BEFORE the OS
 * permission dialog fires.
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
 * Perform the iOS background-location disclosure modal and resolve.
 * On iOS we show the disclosure but don't call ForegroundTracking — the native
 * plugin's requestPermissions:true in bgStartWatch() handles the actual OS ask.
 */
function showIOSDisclosure(
  context: "job" | "load_board" | "asset_protection",
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    pending.push(resolve);
    disclosurePending = true;
    try {
      window.dispatchEvent(
        new CustomEvent("guber:show-bg-location-disclosure", { detail: { context, platform: "ios" } }),
      );
    } catch {
      pending.splice(pending.indexOf(resolve), 1);
      resolve(false);
    }
  });
}

/**
 * Ensure background location permission, showing the in-app disclosure if
 * needed. Always resolves — never rejects. Returns true if granted/acknowledged.
 *
 * - Web: no-op (returns true immediately).
 * - iOS native: shows in-app disclosure per App Store guideline 5.1(c); the
 *   actual OS permission is requested by the native plugin when bgStartWatch fires.
 * - Android: shows disclosure + requests ACCESS_BACKGROUND_LOCATION from OS.
 *
 * If we already asked once and they denied, shows the disclosure again only if
 * forceReprompt is set — otherwise silently resolves false.
 */
export function ensureBackgroundLocation(
  context: "job" | "load_board" | "asset_protection",
  opts?: { forceReprompt?: boolean },
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(true);

  const platform = Capacitor.getPlatform();

  // iOS — show our in-app disclosure first; native plugin handles OS permission
  if (platform === "ios") {
    if (hasRequestedBackgroundLocation() && !opts?.forceReprompt) {
      return Promise.resolve(true); // Already acknowledged once
    }
    return showIOSDisclosure(context);
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
