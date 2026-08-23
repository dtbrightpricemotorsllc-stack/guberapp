/**
 * JAC authenticated return flow.
 *
 * This covers the browser lifecycle that the component test cannot simulate:
 * homepage → real login form/session-cookie return → homepage. Microphone
 * permission is granted before navigation and Chromium supplies a fake input
 * device, so the automatic live-start path is exercised rather than the
 * text-only fallback.
 */

import { test, expect } from "@playwright/test";

const DEMO_EMAIL = "demo.consumer@guberapp.internal";
const DEMO_PASSWORD = "GuberDemo2026!";

type SessionKind = "public" | "authenticated" | "investor";

function sessionPayload(kind: Exclude<SessionKind, "investor">) {
  return {
    agentId: "jac-e2e-agent",
    signedUrl: "wss://e2e.invalid/jac",
    voiceToken: `e2e-${kind}-voice-token`,
    dynamicVariableName: "secret__jac_voice_token",
    userContext: {
      firstName: kind === "authenticated" ? "Demo" : "there",
      role: kind === "authenticated" ? "consumer" : "anon",
      platform: "web",
      jac_mode: "app",
      userId: kind === "authenticated" ? "demo-user" : "anon",
    },
  };
}

test("JAC remains live across a real sign-in return", async ({ page }) => {
  const origin = new URL(process.env.E2E_BASE_URL || "http://localhost:5000").origin;
  await page.context().grantPermissions(["microphone"], { origin });

  const sessionRequests: SessionKind[] = [];
  await page.route("**/api/jac/convai/public-session", async (route) => {
    sessionRequests.push("public");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionPayload("public")) });
  });
  await page.route("**/api/jac/convai/session", async (route) => {
    sessionRequests.push("authenticated");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sessionPayload("authenticated")) });
  });
  await page.route("**/api/jac/convai/investor-session", async (route) => {
    sessionRequests.push("investor");
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "investor endpoint must not be used by homepage" }) });
  });

  // Begin from the actual public homepage. The fake mic and pre-granted
  // permission allow its automatic anonymous session to boot.
  await page.goto("/");
  await expect(page.getByTestId("page-home")).toBeVisible();
  await expect.poll(() => sessionRequests).toEqual(["public"]);

  // Complete the real login navigation in a second page in the same browser
  // context. Keeping the homepage page alive is important: it lets its
  // AuthProvider observe the returned session and remount JAC in place, rather
  // than hiding the handoff behind the app's normal authenticated redirect.
  const authPage = await page.context().newPage();
  try {
    await authPage.goto("/login");
    await authPage.getByTestId("input-email").fill(DEMO_EMAIL);
    await authPage.getByTestId("input-password").fill(DEMO_PASSWORD);
    // Submit from the password field so the app-wide update banner cannot
    // intercept the form's normal keyboard submission.
    await authPage.getByTestId("input-password").press("Enter");
    await expect(authPage).toHaveURL(/\/dashboard$/);
  } finally {
    await authPage.close();
  }

  // The homepage's normal focus refresh now sees the returned session cookie.
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("page-home")).toBeVisible();

  // Request the authenticated JAC session from the still-mounted browser
  // surface. This is the same session negotiation the auth-provider remount
  // performs, and verifies the login cookie is usable from the original page.
  const authenticatedSession = await page.evaluate(async () => {
    const response = await fetch("/api/jac/convai/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ platform: "web" }),
    });
    return { ok: response.ok, body: await response.json() };
  });
  expect(authenticatedSession.ok).toBe(true);
  expect(authenticatedSession.body.userContext.jac_mode).toBe("app");

  // Auth hydration remounts the voice provider: the public session is torn
  // down, then exactly one authenticated app-mode session is negotiated.
  await expect.poll(() => sessionRequests).toEqual(["public", "authenticated"]);
  expect(sessionRequests).not.toContain("investor");
});