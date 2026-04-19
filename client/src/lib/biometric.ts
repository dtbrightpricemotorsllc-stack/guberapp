import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
} from "@aparajita/capacitor-biometric-auth";

const BIOMETRIC_PREF_KEY = "guber_biometric_enabled";

let _sessionUnlocked = false;
let _promptInProgress = false;

export function isBiometricSessionUnlocked(): boolean {
  return _sessionUnlocked;
}

export function lockBiometricSession(): void {
  _sessionUnlocked = false;
}

export async function isBiometricSupported(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable;
  } catch {
    return false;
  }
}

export async function getBiometricEnabled(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { value } = await Preferences.get({ key: BIOMETRIC_PREF_KEY });
    return value === "true";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!enabled) {
    _sessionUnlocked = false;
  }
  await Preferences.set({ key: BIOMETRIC_PREF_KEY, value: String(enabled) });
}

const HARD_ERROR_TYPES = new Set([
  BiometryErrorType.biometryNotAvailable,
  BiometryErrorType.biometryNotEnrolled,
  BiometryErrorType.biometryLockout,
  BiometryErrorType.passcodeNotSet,
  BiometryErrorType.noDeviceCredential,
]);

export async function ensureBiometricUnlocked(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  if (_sessionUnlocked) return true;

  if (_promptInProgress) {
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        if (!_promptInProgress) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
    return _sessionUnlocked;
  }

  _promptInProgress = true;
  try {
    await BiometricAuth.authenticate({
      reason: "Verify your identity to access GUBER",
      cancelTitle: "Cancel",
      allowDeviceCredential: false,
    });
    _sessionUnlocked = true;
    return true;
  } catch (err) {
    _sessionUnlocked = false;
    if (err instanceof BiometryError && HARD_ERROR_TYPES.has(err.code)) {
      await setBiometricEnabled(false);
    }
    return false;
  } finally {
    _promptInProgress = false;
  }
}
