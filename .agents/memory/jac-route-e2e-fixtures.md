---
name: JAC route E2E fixtures
description: Durable constraints for browser coverage of JAC's ambiguous service-routing conversations.
---

JAC's authenticated assistant has a separate listing-builder intent detector. Ambiguous service-routing tests must use wording that does not match listing creation (for example, guidance-seeking language), or the test will exercise the wrong endpoint.

**Why:** The assistant intentionally diverts job, hiring, and provider-offer phrases into the listing workflow. Fresh authenticated browser sessions can also show GPS and notification overlays that intercept the assistant trigger.

**How to apply:** Stub the AI/listing response at the browser API boundary, assert the first response has no route, and dismiss both onboarding overlays before interacting with the authenticated assistant.

For voice acceptance, do not depend on host microphone availability. Use a development-only provider-event harness while preserving the real session-endpoint request and UI callback lifecycle. Persist it across same-tab login navigation, cancel in-flight boots on unmount, and block unsafe publish/financial routes before testing a demo-account action.

**Why:** Browser fake-media flags and granted permission do not guarantee microphone access in hosted CI. A provider seam avoids external flakiness, while active route blocking protects shared demo data.

**How to apply:** Keep production builds unable to activate the harness. In browser tests, assert public/authenticated endpoint selection, explicitly inject provider lifecycle events, and make unsafe route guards fail the test if reached.

Public-home tests that exercise the canonical JAC surface after the first-visit experience should explicitly seed the returning-visitor door marker. Dedicated door tests must start with a cleared marker so they cover the real gate.

**Why:** The Team GUBER door intentionally prevents the canonical surface from mounting on a fresh browser context; downstream assistant tests otherwise fail before reaching the behavior they are meant to verify.

**How to apply:** Set `guberDoorSplashSeen` to `"1"` in the test init script for canonical-home consumers, and reserve cleared-marker contexts for first-visit, forced-door, and campaign-join door coverage.