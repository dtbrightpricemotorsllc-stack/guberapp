---
name: Campaign onboarding continuity
description: Durable architecture for flyer and business-invitation entry, attribution, authentication, and JAC handoff.
---

Flyer and invitation links must create an opaque, expiring server-backed campaign session and open canonical JAC before routing to signup or a business form. The session preserves campaign type, source, referral or invitation code, original/current intent, safe resume path, guest context, and eventual owner.

**Why:** Browser-only referral state is lost across OAuth, native authentication, devices, and interrupted onboarding. A durable session keeps attribution and user intent together without trusting mutable query parameters after entry.

**How to apply:** Carry only the opaque session ID through JAC and authentication. Claim it server-side for the authenticated user/business, preserve the first intent, update the current intent and resume path, and use stable event keys so retries cannot inflate funnel metrics.

## Browser fixture constraint

Acceptance fixtures that mock API GETs must block service workers. Playwright page routes do not intercept requests handled by the app's service worker, which can otherwise send protected destination requests to the real server and turn the failure into a misleading login redirect.

**Why:** The app registers a network-first service worker during the public landing flow, before the post-auth destination mounts.

**How to apply:** Scope `serviceWorkers: "block"` to campaign continuity Playwright tests and require valid bearer/cookie credentials in every mocked authenticated response.