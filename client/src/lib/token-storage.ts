import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { getBiometricEnabled, ensureBiometricUnlocked } from "./biometric";

const TOKEN_KEY = "guber_token";

export async function getToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const enabled = await getBiometricEnabled();
    if (enabled) {
      const unlocked = await ensureBiometricUnlocked();
      if (!unlocked) return null;
    }
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export async function clearToken(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: TOKEN_KEY });
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function migrateToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { value: existing } = await Preferences.get({ key: TOKEN_KEY });
  if (existing !== null) return;

  const legacy = localStorage.getItem(TOKEN_KEY);
  if (!legacy) return;

  await Preferences.set({ key: TOKEN_KEY, value: legacy });
  localStorage.removeItem(TOKEN_KEY);
}

