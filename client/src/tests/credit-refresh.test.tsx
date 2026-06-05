// @vitest-environment jsdom
//
// Verifies that credits are refreshed immediately after a purchase via both paths:
//   1. NativeDeepLinkHandler (App.tsx) — guber://purchase-complete fast path
//   2. ExternalPurchaseSheet — browserFinished 3-second fallback

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, screen, fireEvent } from "@testing-library/react";

// ── Capture stores (vi.hoisted runs before all imports) ───────────────────────

const appUrlOpenCallbacks = vi.hoisted(() => [] as Array<(e: { url: string }) => void>);
const browserFinishedCallbacks = vi.hoisted(() => [] as Array<() => void>);
const invalidateQueriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const browserCloseSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const browserOpenSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// ── Capacitor ─────────────────────────────────────────────────────────────────

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", isPluginAvailable: () => true },
  registerPlugin: () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn((event: string, cb: any) => {
      if (event === "appUrlOpen") appUrlOpenCallbacks.push(cb);
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: {
    close: browserCloseSpy,
    open: browserOpenSpy,
    addListener: vi.fn((event: string, cb: any) => {
      if (event === "browserFinished") browserFinishedCallbacks.push(cb);
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));

// ── queryClient / apiRequest ──────────────────────────────────────────────────

vi.mock("@/lib/queryClient", () => ({
  queryClient: { invalidateQueries: invalidateQueriesSpy },
  apiRequest: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ url: "https://checkout.stripe.com/test-session" }),
  }),
  getQueryFn: vi.fn(() => async () => null),
}));

// ── Platform / auth / router / biometric ─────────────────────────────────────

vi.mock("@/lib/platform", () => ({ isIOS: true, isStoreBuild: false }));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useSearch: () => "",
  Switch: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Route: () => null,
  Redirect: () => null,
  Link: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ logout: vi.fn(), isLoading: false, user: null }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/biometric", () => ({
  lockBiometricSession: vi.fn(),
  getBiometricEnabled: vi.fn().mockResolvedValue(false),
  ensureBiometricUnlocked: vi.fn().mockResolvedValue(true),
  isBiometricSessionUnlocked: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/theme-context", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/notification-sound", () => ({ playGuberPing: vi.fn() }));

// ── Component stubs imported eagerly by App.tsx ───────────────────────────────

vi.mock("@/components/loading-splash", () => ({ LoadingSplash: () => null }));
vi.mock("@/components/install-prompt", () => ({ default: () => null }));
vi.mock("@/components/google-auth-overlay", () => ({ GoogleAuthOverlay: () => null }));
vi.mock("@/components/announcement-popup", () => ({ default: () => null }));

// ── Page stubs (eagerly imported by App.tsx) ──────────────────────────────────

vi.mock("@/pages/not-found", () => ({ default: () => null }));
vi.mock("@/pages/home", () => ({ default: () => null }));
vi.mock("@/pages/login", () => ({ default: () => null }));
vi.mock("@/pages/signup", () => ({ default: () => null }));
vi.mock("@/pages/forgot-password", () => ({ default: () => null }));
vi.mock("@/pages/reset-password", () => ({ default: () => null }));
vi.mock("@/pages/auth-success", () => ({ default: () => null }));
vi.mock("@/pages/terms", () => ({ default: () => null }));
vi.mock("@/pages/privacy", () => ({ default: () => null }));
vi.mock("@/pages/acceptable-use", () => ({ default: () => null }));
vi.mock("@/pages/delete-account", () => ({ default: () => null }));
vi.mock("@/pages/join", () => ({ default: () => null }));
vi.mock("@/pages/loading-demo", () => ({ default: () => null }));

// ── Production imports (after all mocks are registered) ───────────────────────

import { NativeDeepLinkHandler } from "@/App";
import { ExternalPurchaseSheet } from "@/components/external-purchase-sheet";

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — NativeDeepLinkHandler purchase-complete branch (App.tsx)
//
// Renders the real exported component, captures the appUrlOpen listener that
// Capacitor.App.addListener registers, then fires it with various URLs and
// asserts on Browser.close + queryClient.invalidateQueries.
// ─────────────────────────────────────────────────────────────────────────────

describe("NativeDeepLinkHandler – purchase-complete branch", () => {
  beforeEach(() => {
    appUrlOpenCallbacks.length = 0;
    browserCloseSpy.mockClear();
    invalidateQueriesSpy.mockClear();
  });

  afterEach(cleanup);

  async function renderAndFlush() {
    await act(async () => { render(<NativeDeepLinkHandler />); });
    // Allow addListener .then() callbacks to resolve
    await act(async () => {});
  }

  it("registers an appUrlOpen listener on mount", async () => {
    await renderAndFlush();
    expect(appUrlOpenCallbacks.length).toBeGreaterThanOrEqual(1);
  });

  it("calls Browser.close and immediately invalidates /api/auth/me on guber://purchase-complete", async () => {
    await renderAndFlush();

    act(() => { appUrlOpenCallbacks[0]({ url: "guber://purchase-complete" }); });

    expect(browserCloseSpy).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["/api/auth/me"] });
  });

  it("does NOT invalidate /api/auth/me for guber://auth-success", async () => {
    await renderAndFlush();

    act(() => { appUrlOpenCallbacks[0]({ url: "guber://auth-success?token=abc" }); });

    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it("does NOT invalidate for https:// universal links that contain 'purchase-complete'", async () => {
    await renderAndFlush();

    act(() => { appUrlOpenCallbacks[0]({ url: "https://guberapp.app/purchase-complete" }); });

    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it("does not throw on a malformed URL", async () => {
    await renderAndFlush();

    expect(() => {
      act(() => { appUrlOpenCallbacks[0]({ url: "not-a-valid-url" }); });
    }).not.toThrow();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — ExternalPurchaseSheet browserFinished fallback
//
// When SFSafariViewController closes without the deep-link firing the component
// registers a Capacitor browserFinished listener and queues a 3-second delayed
// queryClient.invalidateQueries so credits catch up after the webhook lands.
// ─────────────────────────────────────────────────────────────────────────────

describe("ExternalPurchaseSheet – browserFinished fallback", () => {
  beforeEach(() => {
    browserFinishedCallbacks.length = 0;
    invalidateQueriesSpy.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function openCheckoutPopover() {
    await act(async () => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("button-disclosure-continue"));
    });
    // Allow Browser.addListener .then() to resolve
    await act(async () => {});
  }

  it("registers a browserFinished listener when the checkout popover is opened", async () => {
    const { Browser } = await import("@capacitor/browser");
    const addListenerSpy = Browser.addListener as ReturnType<typeof vi.fn>;
    addListenerSpy.mockClear();

    render(
      <ExternalPurchaseSheet product="studio_credits">
        {({ onPress }) => (
          <button data-testid="trigger" onClick={onPress}>Buy</button>
        )}
      </ExternalPurchaseSheet>,
    );

    await openCheckoutPopover();

    const browserFinishedCalls = addListenerSpy.mock.calls.filter(
      (call: [string, ...unknown[]]) => call[0] === "browserFinished",
    );
    expect(browserFinishedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("invalidates /api/auth/me 3 seconds after browserFinished fires", async () => {
    render(
      <ExternalPurchaseSheet product="studio_credits">
        {({ onPress }) => (
          <button data-testid="trigger" onClick={onPress}>Buy</button>
        )}
      </ExternalPurchaseSheet>,
    );

    await openCheckoutPopover();
    expect(browserFinishedCallbacks.length).toBeGreaterThanOrEqual(1);

    act(() => { browserFinishedCallbacks.forEach((cb) => cb()); });

    // Not yet — still within the 3-second window
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(3000); });

    expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ["/api/auth/me"] });
  });

  it("does NOT invalidate before 3 seconds elapse after browserFinished", async () => {
    render(
      <ExternalPurchaseSheet product="studio_credits">
        {({ onPress }) => (
          <button data-testid="trigger" onClick={onPress}>Buy</button>
        )}
      </ExternalPurchaseSheet>,
    );

    await openCheckoutPopover();

    act(() => { browserFinishedCallbacks.forEach((cb) => cb()); });
    act(() => { vi.advanceTimersByTime(2999); });

    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });

  it("does NOT invalidate when the user cancels the Apple disclosure", async () => {
    render(
      <ExternalPurchaseSheet product="studio_credits">
        {({ onPress }) => (
          <button data-testid="trigger" onClick={onPress}>Buy</button>
        )}
      </ExternalPurchaseSheet>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("trigger"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("button-disclosure-cancel"));
    });

    act(() => { vi.advanceTimersByTime(5000); });

    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  });
});
