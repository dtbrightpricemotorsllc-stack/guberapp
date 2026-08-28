---
name: Campaign onboarding continuity
description: Durable architecture for flyer and business-invitation entry, attribution, authentication, and JAC handoff.
---

Flyer and invitation links must create an opaque, expiring server-backed campaign session and open canonical JAC before routing to signup or a business form. The session preserves campaign type, source, referral or invitation code, original/current intent, safe resume path, guest context, and eventual owner.

**Why:** Browser-only referral state is lost across OAuth, native authentication, devices, and interrupted onboarding. A durable session keeps attribution and user intent together without trusting mutable query parameters after entry.

**How to apply:** Carry only the opaque session ID through JAC and authentication. Claim it server-side for the authenticated user/business, preserve the first intent, update the current intent and resume path, and use stable event keys so retries cannot inflate funnel metrics.