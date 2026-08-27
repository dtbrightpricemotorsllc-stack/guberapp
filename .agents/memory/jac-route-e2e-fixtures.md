---
name: JAC route E2E fixtures
description: Durable constraints for browser coverage of JAC's ambiguous service-routing conversations.
---

JAC's authenticated assistant has a separate listing-builder intent detector. Ambiguous service-routing tests must use wording that does not match listing creation (for example, guidance-seeking language), or the test will exercise the wrong endpoint.

**Why:** The assistant intentionally diverts job, hiring, and provider-offer phrases into the listing workflow. Fresh authenticated browser sessions can also show GPS and notification overlays that intercept the assistant trigger.

**How to apply:** Stub the AI/listing response at the browser API boundary, assert the first response has no route, and dismiss both onboarding overlays before interacting with the authenticated assistant.