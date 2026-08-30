import { test, expect, type Page, type Route } from "@playwright/test";

const CONSUMER_SESSION = "c".repeat(32);
const BUSINESS_SESSION = "b".repeat(32);

type ContinuitySession = {
  sessionId: string;
  kind: "consumer" | "business";
  referralCode: string | null;
  invitationCode: string | null;
  originalIntent: string;
  currentIntent: string;
  resumePath: string;
  context: Record<string, unknown>;
  status: "active" | "claimed";
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installContinuityFixtures(
  page: Page,
  session: ContinuitySession | null,
  onSignup?: (body: any) => void,
) {
  let authenticated = false;
  const patches: any[] = [];
  const claims: any[] = [];
  const transfers: any[] = [];

  await page.route("**/api/auth/me", (route) => {
    console.log("[continuity] auth/me", authenticated);
    return json(route, authenticated
      ? {
        id: 812,
        email: "continuity@example.test",
        username: "continuity_test",
        fullName: "Continuity Test",
        firstName: "Continuity",
        role: "user",
        accountType: session?.kind === "business" ? "business" : "individual",
        }
      : null, authenticated ? 200 : 401);
  });

  await page.route("**/api/jac/guest-transfer", async (route) => {
    transfers.push(route.request().postDataJSON());
    await json(route, { success: true, transferred: 1 });
  });

  await page.route("**/api/onboarding/campaign-session", async (route) => {
    if (route.request().method() === "POST") {
      await json(route, session);
      return;
    }
    await route.continue();
  });

  if (session) {
    await page.route(`**/api/onboarding/campaign-session/${session.sessionId}`, async (route) => {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        patches.push(body);
        session.currentIntent = body.intent || session.currentIntent;
        session.resumePath = body.resumePath || session.resumePath;
        session.context = { ...session.context, ...(body.context || {}) };
        await json(route, session);
        return;
      }
      await json(route, session);
    });
    await page.route(`**/api/onboarding/campaign-session/${session.sessionId}/claim`, async (route) => {
      claims.push(route.request().postDataJSON() || {});
      session.status = "claimed";
      authenticated = true;
      await json(route, session);
    });
  }

  await page.route("**/api/auth/signup", async (route) => {
    authenticated = true;
    console.log("[continuity] signup", route.request().postDataJSON());
    onSignup?.(route.request().postDataJSON());
    await json(route, { token: "test-token" });
  });
  await page.route("**/api/auth/business-access-request", async (route) => {
    authenticated = true;
    await json(route, { ok: true });
  });

  return { patches, claims, transfers, isAuthenticated: () => authenticated };
}

async function installOnboardFixture(page: Page, responseFor: (message: string) => any) {
  const requests: string[] = [];
  await page.route("**/api/jac/onboard", async (route) => {
    const body = route.request().postDataJSON() as { messages?: Array<{ role: string; content: string }> };
    const message = [...(body.messages || [])]
      .reverse()
      .find((item) => item.role === "user")?.content || "";
    requests.push(message);
    await json(route, responseFor(message));
  });
  return requests;
}

test.describe("onboarding continuity acceptance", () => {
  test("consumer flyer keeps referral, intent, draft context, destination, and guidance", async ({ page }) => {
    const session: ContinuitySession = {
      sessionId: CONSUMER_SESSION,
      kind: "consumer",
      referralCode: "FLYER42",
      invitationCode: null,
      originalIntent: "discover_guber",
      currentIntent: "discover_guber",
      resumePath: "/dashboard",
      context: {},
      status: "active",
    };
    const fixture = await installContinuityFixtures(page, session, (body) => {
      expect(body.referralCode).toBe("FLYER42");
    });
    const requests = await installOnboardFixture(page, (message) => /offer/i.test(message)
      ? {
          reply: "Create your account and I’ll resume your service offer.",
          route: "/signup?intent=worker&returnTo=%2Foffer-service",
          tracking: { intent: "worker", user_type: "service_provider" },
          guestDraft: {
            type: "service_offer",
            data: { title: "Mobile repair", category: "Repair", description: "On-site repair help" },
          },
        }
      : { reply: "Tell me what you need and I’ll guide you.", route: null, actions: [], options: [] });

    await page.goto("/join/FLYER42");
    await expect(page.getByTestId("page-home")).toBeVisible();
    await page.getByLabel("Message JAC").fill("I want to offer a repair service.");
    await page.getByLabel("Message JAC").press("Enter");
    await expect(page.getByRole("link", { name: "Publish your service", exact: true })).toBeVisible();
    await expect.poll(() => fixture.patches.length).toBeGreaterThan(0);
    expect(fixture.patches.at(-1).context.conversation).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: "I want to offer a repair service." })]),
    );
    expect(fixture.patches.at(-1).intent).toBe("worker");

    await page.getByRole("link", { name: "Publish your service", exact: true }).click();
    await expect(page).toHaveURL(/\/signup\?[^#]*campaignSession=/);
    await page.getByTestId("input-email").fill("consumer@example.test");
    await page.getByTestId("input-password").fill("StrongPassword!");
    await page.getByTestId("checkbox-terms-agree").click();
    await page.getByTestId("button-signup-submit").click();

    await expect(page).toHaveURL(new RegExp(`/offer-service\\?campaignSession=${CONSUMER_SESSION}`));
    expect(fixture.claims).toHaveLength(1);
    expect(fixture.transfers).toHaveLength(1);
    expect(session.referralCode).toBe("FLYER42");
    expect(session.currentIntent).toBe("worker");
    expect(session.context.guestDraft).toEqual(expect.objectContaining({ type: "service_offer" }));
    expect(requests).toContain("I want to offer a repair service.");
  });

  test("business invitation keeps attribution and business context through personalized landing", async ({ page }) => {
    const session: ContinuitySession = {
      sessionId: BUSINESS_SESSION,
      kind: "business",
      referralCode: null,
      invitationCode: "INVITE42",
      originalIntent: "business_onboarding",
      currentIntent: "business_onboarding",
      resumePath: "/business-signup",
      context: {},
      status: "active",
    };
    const fixture = await installContinuityFixtures(page, session);
    await installOnboardFixture(page, (message) => /business invitation|business/i.test(message)
      ? {
          reply: "I saved your business setup. Create your business account to continue.",
          route: "/signup",
          tracking: { intent: "business_onboarding", user_type: "business_owner" },
          guestDraft: {
            type: "business_onboarding",
            data: {
              businessName: "Acme Field Services",
              businessType: "Field Services",
              needs: "Find reliable inspection workers",
            },
          },
        }
      : { reply: "Tell me what your business needs.", route: null, actions: [], options: [] });

    await page.goto("/business-join/INVITE42");
    await expect(page.getByTestId("page-home")).toBeVisible();
    await expect(page.getByLabel("Message JAC")).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Create Account", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Create Account", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/business-signup\\?campaignSession=${BUSINESS_SESSION}`));
    await expect(page.getByTestId("input-business-name")).toHaveValue("Acme Field Services");
    await expect(page.getByTestId("input-company-needs")).toHaveValue("Find reliable inspection workers");
    await expect(page.getByTestId("input-business-invitation-code")).toHaveValue("INVITE42");

    await page.getByTestId("input-work-email").fill("business@example.test");
    await page.getByTestId("input-business-address").fill("100 Main St, New York, NY 10001");
    await page.getByTestId("input-fullname").fill("Business Continuity");
    await page.getByTestId("input-password").fill("StrongPassword!");
    await page.getByTestId("checkbox-terms-agree").click();
    await page.getByTestId("button-request-access").click();

    await expect(page).toHaveURL(new RegExp(`/biz/dashboard\\?campaignSession=${BUSINESS_SESSION}`));
    expect(fixture.claims).toHaveLength(1);
    expect(session.invitationCode).toBe("INVITE42");
    expect(session.context.guestDraft).toEqual(expect.objectContaining({ type: "business_onboarding" }));
  });

  test("normal signup keeps its existing dashboard fallback without campaign context", async ({ page }) => {
    const fixture = await installContinuityFixtures(page, null);
    await page.goto("/signup");
    await page.getByTestId("input-email").fill("normal@example.test");
    await page.getByTestId("input-password").fill("StrongPassword!");
    await page.getByTestId("checkbox-terms-agree").click();
    await page.getByTestId("button-signup-submit").click();

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(fixture.claims).toHaveLength(0);
    expect(fixture.transfers).toHaveLength(1);
  });
});