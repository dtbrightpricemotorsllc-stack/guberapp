// @vitest-environment jsdom
//
// Unit tests for MobileReturnBanner (task-572).
//
// Covers:
//   - Banner renders for a mobile UA when show=true
//   - Banner renders for a mobile UA when ?purchase=success is present in the URL
//   - Banner stays hidden for a desktop UA
//   - Clicking the dismiss (X) button hides the banner

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MobileReturnBanner } from "./mobile-return-banner";

// ── UA helpers ────────────────────────────────────────────────────────────────

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let uaSpy: ReturnType<typeof vi.spyOn>;

function setUserAgent(ua: string) {
  uaSpy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

// ─────────────────────────────────────────────────────────────────────────────

describe("MobileReturnBanner", () => {
  beforeEach(() => {
    // Default: desktop UA, no query string
    setUserAgent(DESKTOP_UA);
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    uaSpy.mockRestore();
    window.history.pushState({}, "", "/");
  });

  it("renders the banner on a mobile UA when show=true", () => {
    setUserAgent(MOBILE_UA);
    render(<MobileReturnBanner show={true} />);
    expect(screen.getByTestId("banner-mobile-return")).toBeTruthy();
  });

  it("renders the banner on a mobile UA when ?purchase=success is in the URL", () => {
    setUserAgent(MOBILE_UA);
    window.history.pushState({}, "", "/?purchase=success");
    render(<MobileReturnBanner show={false} />);
    expect(screen.getByTestId("banner-mobile-return")).toBeTruthy();
  });

  it("hides the banner on a desktop UA even when show=true", () => {
    setUserAgent(DESKTOP_UA);
    render(<MobileReturnBanner show={true} />);
    expect(screen.queryByTestId("banner-mobile-return")).toBeNull();
  });

  it("hides the banner on a desktop UA with ?purchase=success in the URL", () => {
    setUserAgent(DESKTOP_UA);
    window.history.pushState({}, "", "/?purchase=success");
    render(<MobileReturnBanner show={false} />);
    expect(screen.queryByTestId("banner-mobile-return")).toBeNull();
  });

  it("does not render when show=false and no purchase param (mobile UA)", () => {
    setUserAgent(MOBILE_UA);
    render(<MobileReturnBanner show={false} />);
    expect(screen.queryByTestId("banner-mobile-return")).toBeNull();
  });

  it("disappears after clicking the dismiss (X) button", () => {
    setUserAgent(MOBILE_UA);
    render(<MobileReturnBanner show={true} />);

    const banner = screen.getByTestId("banner-mobile-return");
    expect(banner).toBeTruthy();

    const dismissBtn = screen.getByTestId("button-dismiss-return-banner");
    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId("banner-mobile-return")).toBeNull();
  });

  it("renders the 'return to app' deep-link inside the banner", () => {
    setUserAgent(MOBILE_UA);
    render(<MobileReturnBanner show={true} />);

    const link = screen.getByTestId("link-return-to-app");
    expect(link.getAttribute("href")).toBe("guber://");
  });
});
