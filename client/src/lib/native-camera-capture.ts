import { Capacitor } from "@capacitor/core";
import type { RefObject } from "react";

export const isNativeCameraPlatform = (() => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
})();

function dataUrlToFile(dataUrl: string, fileName?: string): Promise<File> {
  return fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => {
      const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
      return new File([blob], fileName || `proof-${Date.now()}.${ext}`, { type: blob.type || "image/jpeg" });
    });
}

/**
 * Launches the LIVE camera for a real-time proof photo.
 *
 * On native iOS/Android (Capacitor), this uses the @capacitor/camera plugin
 * directly — a plain HTML `<input capture="environment">` is NOT reliably
 * honored by WKWebView and was the confirmed root cause of an App Store
 * rejection ("no photo options shown when tapped to submit proof photo",
 * see docs/app-store-rejection-2026-07.md). Any surface that requires a
 * live, camera-only proof photo should call this instead of relying on the
 * `capture` attribute alone.
 *
 * On web (or if the native plugin throws for a non-cancel reason), it falls
 * back to clicking the given hidden file input, which should still carry
 * `capture="environment"` for mobile browsers.
 */
export async function triggerLiveCameraCapture(
  fileInputRef: RefObject<HTMLInputElement>,
  onFile: (file: File) => void,
  opts?: { fileName?: string }
): Promise<void> {
  if (isNativeCameraPlatform) {
    try {
      const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        allowEditing: false,
        saveToGallery: false,
      });
      if (photo.dataUrl) {
        const file = await dataUrlToFile(photo.dataUrl, opts?.fileName);
        onFile(file);
      }
      return;
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (msg.includes("cancel")) return;
      // Any other native failure — fall back to the file-input capture
      // sheet rather than leaving the user with no way to submit proof.
    }
  }
  fileInputRef.current?.click();
}
