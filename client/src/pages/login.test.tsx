// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Capacitor mocks (pulled in transitively by token-storage) ─────────────────
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/lib/biometric", () => ({
  getBiometricToken: vi.fn().mockResolvedValue(null),
  setBiometricToken: vi.fn().mockResolvedValue(undefined),
  clearBiometricToken: vi.fn().mockResolvedValue(undefined),
  isBiometricAvailable: vi.fn().mockResolvedValue(false),
}));

// ── Navigation mocks (wouter) ─────────────────────────────────────────────────
const mockSetLocation = vi.fn();
let mockSearch = "";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => ["/login", mockSetLocation],
  useSearch: () => mockSearch,
}));

// ── Auth context mock ─────────────────────────────────────────────────────────
const mockLogin = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// ── Toast mock ────────────────────────────────────────────────────────────────
const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ── QueryClient mock ─────────────────────────────────────────────────────────
vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    refetchQueries: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Heavy UI component mocks ──────────────────────────────────────────────────
vi.mock("@/components/guber-logo", () => ({
  GuberLogo: () => <div data-testid="guber-logo">GUBER</div>,
}));
vi.mock("@/components/in-app-browser-gate", () => ({
  InAppBrowserGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("lucide-react", () => ({
  Loader2: () => <span>Loading</span>,
  ArrowLeft: () => <span>←</span>,
  Eye: () => <span>👁</span>,
  EyeOff: () => <span>👁‍🗨</span>,
  Sparkles: () => <span>✨</span>,
  Building2: () => <span>🏢</span>,
}));

// ── Import the real Login component ───────────────────────────────────────────
import Login from "./login";

function renderLogin(search = "") {
  mockSearch = search;
  return render(<Login />);
}

describe("Login page — post-login returnTo redirect", () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
    mockLogin.mockReset();
    mockToast.mockReset();
    mockSearch = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("redirects to returnTo path after successful login when returnTo is a valid relative path", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin("?returnTo=%2Fmarketplace");

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("user@example.com", "Password1!");
      expect(mockSetLocation).toHaveBeenCalledWith("/marketplace");
    });
  });

  it("redirects to returnTo path that contains its own query string", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin(`?reason=session_expired&returnTo=${encodeURIComponent("/marketplace?tab=active")}`);

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/marketplace?tab=active");
    });
  });

  it("redirects to returnTo=/browse-jobs after session-expired scenario", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin(`?reason=session_expired&returnTo=${encodeURIComponent("/browse-jobs")}`);

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/browse-jobs");
    });
  });

  it("falls back to /dashboard for consumer accounts when no returnTo is present", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin("");

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("falls back to /biz/dashboard for business accounts when no returnTo is present", async () => {
    mockLogin.mockResolvedValue({ accountType: "business" });
    renderLogin("");

    await userEvent.type(screen.getByTestId("input-email"), "biz@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith("/biz/dashboard");
    });
  });

  it("rejects external returnTo URLs (open redirect protection) and falls back to /dashboard", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin(`?returnTo=${encodeURIComponent("https://evil.com")}`);

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).not.toHaveBeenCalledWith("https://evil.com");
      expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("rejects protocol-relative returnTo URLs (//evil.com) and falls back to /dashboard", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin(`?returnTo=${encodeURIComponent("//evil.com")}`);

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).not.toHaveBeenCalledWith("//evil.com");
      expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("rejects javascript: scheme returnTo URLs and falls back to /dashboard", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin(`?returnTo=${encodeURIComponent("javascript:alert(1)")}`);

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockSetLocation).not.toHaveBeenCalledWith("javascript:alert(1)");
      expect(mockSetLocation).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows a session expired toast when reason=session_expired is in the URL", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });
    renderLogin("?reason=session_expired&returnTo=%2Fdashboard");

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Session Expired" }),
      );
    });
  });

  /**
   * Full round-trip integration test
   *
   * Exercises the complete post-login redirect flow in a single scenario:
   *
   *   1. The app detects an expired session and calls handleExpiredSession()
   *      (tested separately in queryClient.test.ts) which redirects the browser to
   *      /login?reason=session_expired&returnTo=%2Fmarketplace.
   *
   *   2. The Login component receives that URL, shows a "Session Expired" toast,
   *      and reads the returnTo parameter.
   *
   *   3. The user completes sign-in.
   *
   *   4. The Login component navigates to /marketplace — the page the user was
   *      on before their session expired.
   *
   * This test covers the integration boundary between the two code paths:
   *   - handleExpiredSession() in client/src/lib/queryClient.ts (lines 9-17)
   *   - returnTo handling in client/src/pages/login.tsx (lines 56-70)
   */
  it("full round-trip: session-expired URL → toast shown → login → navigates back to original page", async () => {
    mockLogin.mockResolvedValue({ accountType: "consumer" });

    // URL produced by handleExpiredSession() when the user is on /marketplace
    renderLogin(`?reason=session_expired&returnTo=${encodeURIComponent("/marketplace")}`);

    // The "Session Expired" toast should appear immediately on page load
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Session Expired" }),
      );
    });

    // User sees the login form and signs in
    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "Password1!");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    // After login, the user is returned to /marketplace — not the default /dashboard
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("user@example.com", "Password1!");
      expect(mockSetLocation).toHaveBeenCalledWith("/marketplace");
      expect(mockSetLocation).not.toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows a login failed toast when credentials are invalid", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid credentials"));
    renderLogin("");

    await userEvent.type(screen.getByTestId("input-email"), "user@example.com");
    await userEvent.type(screen.getByTestId("input-password"), "wrongpass");
    fireEvent.click(screen.getByTestId("button-login-submit"));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Login Failed", variant: "destructive" }),
      );
      expect(mockSetLocation).not.toHaveBeenCalled();
    });
  });
});
