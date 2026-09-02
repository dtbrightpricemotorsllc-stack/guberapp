# GUBER RepairMatch Design

## Purpose

GUBER RepairMatch lets a signed-in customer upload collision-damage photos once, receive a preliminary AI visual damage estimate, and request review from participating body shops. The default path sends the opportunity to one selected shop. An optional multi-shop path lets several eligible nearby repair shops come to the customer.

RepairMatch is not a lowest-price bidding auction. GUBER keeps customer contact information private until the customer chooses a shop.

## Product boundaries

- Add RepairMatch entry points to Automotive/Services and relevant signed-in dashboards.
- Keep homepage doors, JAC, onboarding, subscriptions, marketplace, jobs, and existing routing unchanged apart from additive links.
- Do not hard-code Affordable Paint & Auto Body. Enroll it through the same participating-shop configuration used for every body shop.
- Never describe AI output as an official CCC ONE estimate, final repair authorization, diagnosis, insurer submission, or guaranteed price.
- Do not publish automatically.

## Customer flow

1. Enter year, make, model, optional VIN and mileage, incident details, visible damage, drivable status, location, and towing need.
2. Upload 3–10 guided damage photos.
3. Receive a structured preliminary visual damage estimate.
4. Save the estimate to the customer’s GUBER account.
5. Preview and approve the information that will be shared.
6. Send the opportunity to one selected participating shop by default, or choose “Let nearby repair shops come to you” to reach a capped set of eligible shops.
7. Review shop responses and accept a shop.
8. Release appropriate contact information only after customer acceptance.

## Shop flow

Participating body shops receive RepairMatch opportunities through the existing business experience. Each opportunity includes customer-approved vehicle and incident information, photos, and the original preliminary AI estimate.

Shops can:

- Review and revise estimate lines without overwriting the original AI values.
- Provide availability, an inspection request, expected repair timing, warranty information, towing availability, parts approach, capabilities, and a customer-facing note.
- Save a draft, decline, or send a reviewed response.
- Track new, viewed, responded, accepted, declined, and expired opportunities.

Customer comparison emphasizes fit, timing, service, warranty, towing, capabilities, and communication. RepairMatch does not rank shops by lowest price.

## Architecture

RepairMatch is a dedicated module integrated with existing authentication, business profiles, uploads, notifications, audit logs, and dashboards.

Core records:

- **Estimate:** customer ownership, vehicle and incident details, photos, status, model/version, structured AI result, preliminary totals, disclosures, and timestamps.
- **Estimate lines:** component or panel, repair/replace/R&I/blend/inspect recommendation, labor-hour ranges, optional parts allowance, confidence, and inspection requirements.
- **Shop opportunities:** one record per invited shop, with delivery and lifecycle status.
- **Shop responses:** service details, reviewed line revisions, inspection request, and response status.
- **Consent and handoff events:** approved sharing scope, recipients, and contact-release history.
- **Audit events:** generation, regeneration, sharing, review, edits, response, acceptance, and handoff.

Original AI values and shop-reviewed values remain separate and attributable.

## AI analysis

The server uses Replit-managed, server-side OpenAI credentials and a configurable low-cost vision-capable model. Credentials never reach the client.

The analysis accepts at most 10 bounded image inputs and returns validated structured JSON containing:

- Visible damaged panels and components.
- Repair, replace, R&I, blend, and inspect recommendations.
- Estimated body, refinish, and mechanical labor-hour ranges.
- Approximate parts allowances only where reasonably inferable.
- Severity, confidence, inspection-required items, summary, and preliminary totals.

Unknown or non-visible findings remain explicitly unknown or inspection-required. The model must not invent hidden damage, exact parts prices, OEM procedures, diagnostics, or calibration requirements.

The UI permanently discloses that results are preliminary and subject to physical inspection, teardown, actual parts pricing, OEM procedures, taxes and fees, and shop approval.

## Uploads, cost controls, and abuse protection

- Compress and resize oversized photos before upload; validate MIME type, size, and dimensions again on the server.
- Require 3–10 images and cap transformed dimensions, request size, output tokens, estimate lines, and generation retries.
- Apply per-user and per-IP limits to uploads, AI generations, retries, and shop distribution.
- Use idempotency to prevent duplicate analysis jobs and duplicate shop opportunities.
- Do not silently fall back to a more expensive model.
- Audit suspicious request bursts and return explicit retry timing.

## Privacy and matching

- Estimates and photos are private by default.
- Customers preview the sharing payload before submission.
- Nearby matching uses minimum necessary location precision.
- Before acceptance, shops do not receive the customer’s exact address or direct contact details.
- Multi-shop distribution is capped and limited to active participating collision/body shops by service area, capabilities, eligibility, and response quality.
- Shop response ordering does not promote the lowest price.

## Failure handling

- Preserve drafts and uploaded photos when an upload or AI call fails.
- Identify individual failed photos and allow retry.
- Reject malformed AI output rather than persisting partial or invented data.
- Provide a truthful retryable state for provider timeout or outage.
- If no nearby shops qualify, offer the single-shop selection path.
- Preserve expired and declined opportunities in history.
- Reject unauthorized or stale actions without leaking customer or shop data.

## Verification

- Server tests cover schema validation, ownership, privacy, rate limits, idempotency, AI parsing and failure, matching eligibility, contact handoff, and edit provenance.
- Client tests cover photo limits, disclosures, save/retry, one-shop default, multi-shop explanation, masked contact, and shop editing.
- One focused end-to-end journey covers customer estimate, shop response, and customer acceptance.
- Verify production build and relevant existing smoke checks.
- Check customer and shop screens in running mobile and desktop previews.
- Confirm homepage doors, JAC entry, authentication routing, personal dashboard, and business dashboard continue loading normally aside from additive RepairMatch links.