import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPreferencesGet = vi.fn();
const mockPreferencesSet = vi.fn();
const mockPreferencesRemove = vi.fn();
const mockIsNativePlatform = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNativePlatform(),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: (...args: unknown[]) => mockPreferencesGet(...args),
    set: (...args: unknown[]) => mockPreferencesSet(...args),
    remove: (...args: unknown[]) => mockPreferencesRemove(...args),
  },
}));

const TOKEN_KEY = "guber_token";

let localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { localStorageStore = {}; },
};

vi.stubGlobal("localStorage", localStorageMock);

describe("migrateToken", () => {
  beforeEach(() => {
    localStorageStore = {};
    mockPreferencesGet.mockReset();
    mockPreferencesSet.mockReset();
    mockPreferencesRemove.mockReset();
    mockIsNativePlatform.mockReset();
  });

  it("does nothing when native and no token exists in either store", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockPreferencesGet.mockResolvedValue({ value: null });

    const { migrateToken } = await import("./token-storage");
    await migrateToken();

    expect(mockPreferencesSet).not.toHaveBeenCalled();
    expect(mockPreferencesRemove).not.toHaveBeenCalled();
    expect(localStorageStore[TOKEN_KEY]).toBeUndefined();
  });

  it("does nothing when native and token already exists in Preferences", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockPreferencesGet.mockResolvedValue({ value: "existing-token" });

    const { migrateToken } = await import("./token-storage");
    await migrateToken();

    expect(mockPreferencesSet).not.toHaveBeenCalled();
    expect(mockPreferencesRemove).not.toHaveBeenCalled();
  });

  it("migrates token from localStorage to Preferences and clears localStorage when native", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockPreferencesGet.mockResolvedValue({ value: null });
    mockPreferencesSet.mockResolvedValue(undefined);
    localStorageStore[TOKEN_KEY] = "legacy-token";

    const { migrateToken } = await import("./token-storage");
    await migrateToken();

    expect(mockPreferencesSet).toHaveBeenCalledWith({
      key: TOKEN_KEY,
      value: "legacy-token",
    });
    expect(localStorageStore[TOKEN_KEY]).toBeUndefined();
  });

  it("does nothing when not on a native platform", async () => {
    mockIsNativePlatform.mockReturnValue(false);
    localStorageStore[TOKEN_KEY] = "some-token";

    const { migrateToken } = await import("./token-storage");
    await migrateToken();

    expect(mockPreferencesGet).not.toHaveBeenCalled();
    expect(mockPreferencesSet).not.toHaveBeenCalled();
    expect(localStorageStore[TOKEN_KEY]).toBe("some-token");
  });
});
