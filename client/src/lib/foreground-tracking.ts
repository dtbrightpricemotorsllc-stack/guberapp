import { Capacitor, registerPlugin } from "@capacitor/core";

// JS interface for the native Android foreground-tracking plugin. Implemented
// in android/app/src/main/java/com/guber/app/ForegroundTrackingPlugin.java.
export interface ForegroundTrackingPlugin {
  start(options: { title?: string; text?: string }): Promise<void>;
  stop(): Promise<void>;
}

const ForegroundTracking = registerPlugin<ForegroundTrackingPlugin>("ForegroundTracking");

// The plugin only exists in the native Android build. On iOS/web these calls
// are no-ops (iOS keeps the GPS watch alive via its own foreground handling).
const isAndroidNative = (() => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
})();

/** Show the persistent tracking notification (Android only). Best-effort. */
export async function startForegroundTracking(opts?: { title?: string; text?: string }): Promise<void> {
  if (!isAndroidNative) return;
  try {
    await ForegroundTracking.start({
      title: opts?.title ?? "GUBER — task in progress",
      text: opts?.text ?? "Sharing your live location for an active task.",
    });
  } catch {
    // Non-fatal: in-app tracking still works; the notification is best-effort.
  }
}

/** Dismiss the persistent tracking notification (Android only). Best-effort. */
export async function stopForegroundTracking(): Promise<void> {
  if (!isAndroidNative) return;
  try {
    await ForegroundTracking.stop();
  } catch {
    // ignore
  }
}
