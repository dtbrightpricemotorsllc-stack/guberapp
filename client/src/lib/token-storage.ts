import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { getBiometricEnabled, ensureBiometricUnlocked, lockBiometricSession } from "./biometric";

const TOKEN_KEY = "guber_token";

let _cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const enabled = await getBiometricEnabled();
    if (enabled) {
      const unlocked = await ensureBiometricUnlocked();
      if (!unlocked) return null;
    }
    if (_cachedToken !== null) return _cachedToken;
    try {
      const { value } = await Preferences.get({ key: TOKEN_KEY });
      _cachedToken = value;
      return _cachedToken;
    } catch {
      // Preferences unavailable — fall back to localStorage
      _cachedToken = localStorage.getItem(TOKEN_KEY);
      return _cachedToken;
    }
  }

  if (_cachedToken !== null) return _cachedToken;
  _cachedToken = localStorage.getItem(TOKEN_KEY);
  return _cachedToken;
}

export async function setToken(token: string): Promise<void> {
  _cachedToken = token;
  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } catch {
      localStorage.setItem(TOKEN_KEY, token);
    }
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export async function clearToken(): Promise<void> {
  _cachedToken = null;
  lockBiometricSession();
  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.remove({ key: TOKEN_KEY });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    }
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function migrateToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { value: existing } = await Preferences.get({ key: TOKEN_KEY });
    if (existing !== null) return;

    const legacy = localStorage.getItem(TOKEN_KEY);
    if (!legacy) return;

    await Preferences.set({ key: TOKEN_KEY, value: legacy });
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Preferences unavailable — token stays in localStorage
  }
}
