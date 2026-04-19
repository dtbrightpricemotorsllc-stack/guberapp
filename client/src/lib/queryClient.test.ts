import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockGetToken = vi.fn<[], Promise<string | null>>();
const mockClearToken = vi.fn<[], Promise<void>>();

vi.mock("./token-storage", () => ({
  getToken: () => mockGetToken(),
  setToken: vi.fn(),
  clearToken: () => mockClearToken(),
}));

let localStorageStore: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStore[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageStore[key];
  },
  clear: () => {
    localStorageStore = {};
  },
});

let capturedHref = "";
let currentPathname = "/dashboard";
let currentSearch = "";

function makeLocationMock() {
  const mock = {
    get pathname() { return currentPathname; },
    get search() { return currentSearch; },
    set href(val: string) { capturedHref = val; },
    get href() { return capturedHref; },
  };
  return mock;
}

vi.stubGlobal("window", {
  location: makeLocationMock(),
});

function make401(): Response {
  return {
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => "Unauthorized",
    json: async () => ({ message: "Unauthorized" }),
    headers: new Headers(),
  } as unknown as Response;
}

function make200(body: unknown = {}): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

describe("handleExpiredSession — triggered via apiRequest on 401", () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockClearToken.mockReset().mockResolvedValue(undefined);
    localStorageStore = {};
    capturedHref = "";
    currentPathname = "/dashboard";
    currentSearch = "";
    vi.resetModules();
  });

  it("redirects to /login with reason=session_expired and returnTo when a token exists", async () => {
    mockGetToken.mockResolvedValue("valid-jwt-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make401()));

    const { apiRequest } = await import("./queryClient");
    try { await apiRequest("GET", "/api/me"); } catch { /* expected */ }

    expect(capturedHref).toContain("/login");
    expect(capturedHref).toContain("reason=session_expired");
    expect(capturedHref).toContain("returnTo=");
    expect(capturedHref).toContain(encodeURIComponent("/dashboard"));
    expect(mockClearToken).toHaveBeenCalledOnce();
  });

  it("does NOT redirect when there is no token on a 401 response", async () => {
    mockGetToken.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make401()));

    const { apiRequest } = await import("./queryClient");
    try { await apiRequest("GET", "/api/me"); } catch { /* expected */ }

    expect(capturedHref).toBe("");
    expect(mockClearToken).not.toHaveBeenCalled();
  });

  it("omits returnTo when the current path is /", async () => {
    mockGetToken.mockResolvedValue("valid-jwt-token");
    currentPathname = "/";
    currentSearch = "";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make401()));

    const { apiRequest } = await import("./queryClient");
    try { await apiRequest("GET", "/api/me"); } catch { /* expected */ }

    expect(capturedHref).toContain("/login");
    expect(capturedHref).toContain("reason=session_expired");
    expect(capturedHref).not.toContain("returnTo");
  });

  it("encodes a path with search params in returnTo", async () => {
    mockGetToken.mockResolvedValue("valid-jwt-token");
    currentPathname = "/marketplace";
    currentSearch = "?tab=active";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make401()));

    const { apiRequest } = await import("./queryClient");
    try { await apiRequest("GET", "/api/listings"); } catch { /* expected */ }

    expect(capturedHref).toContain("reason=session_expired");
    expect(capturedHref).toContain(encodeURIComponent("/marketplace?tab=active"));
  });

  it("does not call handleExpiredSession for non-401 errors", async () => {
    mockGetToken.mockResolvedValue("valid-jwt-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Server Error",
      headers: new Headers(),
    } as unknown as Response));

    const { apiRequest } = await import("./queryClient");
    try { await apiRequest("GET", "/api/me"); } catch { /* expected */ }

    expect(capturedHref).toBe("");
    expect(mockClearToken).not.toHaveBeenCalled();
  });

  it("does not redirect for successful responses", async () => {
    mockGetToken.mockResolvedValue("valid-jwt-token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(make200({ id: 1 })));

    const { apiRequest } = await import("./queryClient");
    const res = await apiRequest("GET", "/api/me");

    expect(res.ok).toBe(true);
    expect(capturedHref).toBe("");
  });
});

