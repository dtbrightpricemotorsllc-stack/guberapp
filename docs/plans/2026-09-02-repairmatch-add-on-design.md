# RepairMatch Multi-Company Add-On Design

## Purpose

Turn GUBER RepairMatch into a reusable add-on that any automotive or body-repair company can place on its own website. The customer should experience the feature as part of the company website, while GUBER provides the secure RepairMatch service behind the scenes.

Affordable Paint & Auto Body is the first normal pilot tenant, not a hard-coded special case.

## Approved decisions

- Provide both an embedded website widget and a branded hosted page.
- Use company branding with a small “Powered by GUBER” attribution.
- Customers are guest users of the company website and do not need GUBER accounts.
- Customers reopen saved results with an expiring email magic link.
- Companies and participating shops use authorized accounts behind the scenes.
- Keep the existing GUBER platform screens and navigation separate from the customer-facing add-on.
- Keep one-shop selection as the default request path, with optional nearby-shop distribution.

## Product boundary

RepairMatch is a multi-tenant service surface, not a generic GUBER consumer page and not a separate deployment per company.

GUBER provides:

- Secure RepairMatch APIs and storage.
- Company tenant enrollment and configuration.
- Server-side image processing and vision analysis.
- Customer consent, shop matching, response, acceptance, and contact handoff.
- Authorized company and participating-shop management.
- Email magic-link delivery and operational audit history.

The company provides:

- A website location for the widget or link to the hosted page.
- Company identity, logo, colors, website domains, notification recipients, and service settings.
- Its own customer-facing relationship and any downstream scheduling or CRM process.

Customers should not be required to navigate GUBER consumer dashboards, marketplace pages, jobs, subscriptions, or JAC in order to use RepairMatch.

## Customer surfaces

### Embedded widget

Each enabled tenant receives an embed snippet that mounts an isolated RepairMatch iframe on an approved company origin. The iframe prevents RepairMatch CSS and JavaScript from conflicting with the host website.

The widget must support:

- Responsive desktop and mobile layouts.
- Native camera/photo selection where available.
- Automatic height updates to the host container.
- Tenant branding loaded from server configuration.
- A fallback link to the hosted page if the widget cannot load.
- No GUBER navigation or GUBER account requirement.
- A small “Powered by GUBER” attribution.

The embed must validate the requesting origin against the tenant’s allowlist. A tenant key identifies configuration but is not a customer authorization credential.

### Hosted page

Each tenant receives a branded hosted URL suitable for buttons, QR codes, email, social posts, and advertising. It uses the same customer flow, API, tenant configuration, guest session, magic-link access, and data policies as the widget.

The hosted page must preserve the tenant context throughout the flow and must never silently fall back to a generic GUBER consumer experience.

## Customer flow

1. Customer opens RepairMatch from the company website, widget, or hosted URL.
2. Customer enters year, make, model, optional VIN and mileage, incident description/date, visible damage areas, ZIP, drivability, and towing need.
3. Customer uploads 3–10 collision-damage photos.
4. The server creates a tenant-scoped draft and generates a preliminary visual assessment.
5. The customer reviews the result, including the permanent preliminary-assessment disclosure.
6. Customer selects one participating shop by default, or chooses “Let nearby repair shops come to you.”
7. Customer previews and explicitly approves the information being shared.
8. Eligible shops receive opportunities and submit service responses.
9. Customer reopens the result through an expiring email magic link, reviews responses, and accepts one shop.
10. Only the accepted shop receives the permitted customer contact details.

The customer can use the feature without creating an account. An optional future account upgrade may associate the guest record with a full account, but it is not part of the initial add-on requirement.

## Guest access and magic links

- Guest sessions are short-lived and bound to the tenant.
- A completed or saved record can request an email magic link.
- Magic-link tokens are stored hashed, expire, are single-use or rotate on use, and are rate-limited.
- URLs contain opaque, non-sequential access tokens and no customer ID or private data.
- Email copy uses the tenant’s company identity plus the small GUBER attribution.
- Access checks confirm token validity, expiration, tenant association, and record ownership.
- Failed, expired, or already-used links show a clear recovery path without revealing whether another record exists.

## Company enrollment and tenant configuration

1. Company signs up or is approved through GUBER.
2. Company enables RepairMatch from its business settings.
3. GUBER creates a tenant and gives the company a setup page.
4. Company configures name, logo, colors, approved domains, hosted-page slug, notification email, service area, and allowed request modes.
5. GUBER generates the embed snippet and hosted-page URL.
6. Company tests the widget in a preview mode before enabling production traffic.

Tenant identifiers must be opaque and non-guessable. Tenant configuration is never trusted from client-submitted display values; the server resolves it from the signed or validated tenant key.

## Shop flow

Participating shops enroll through the same RepairMatch participation process regardless of which company hosts the customer entry point.

Shop users can:

- Receive only opportunities that match their eligibility and the customer-approved scope.
- View the original AI findings as read-only.
- Edit a separate reviewed copy containing recommendation, labor ranges, parts allowance, inspection status, and notes.
- Submit availability, inspection needs, timing, warranty, towing, parts approach, capabilities, and customer-facing notes.
- Save a draft, decline, or send a reviewed response.

RepairMatch is not a lowest-price auction. Shop comparison emphasizes service fit, availability, timing, warranty, towing, capabilities, and communication. No tenant or shop may add cheapest badges, price ranking, or bidding language to the core experience.

## Data isolation and privacy

Every estimate, photo, magic link, opportunity, response, consent event, audit event, notification, and webhook is scoped to a company tenant.

- One tenant cannot query another tenant’s customer records.
- Customer photos and incident details are private until the customer approves sharing.
- Before acceptance, shops do not receive direct contact details or an exact address.
- Nearby matching uses only the minimum location precision needed for eligibility.
- Acceptance releases contact only to the chosen shop; other opportunities become not selected.
- Original AI values and shop-reviewed values remain separate and attributable.
- Audit events record tenant, actor, action, sharing scope, recipient, and contact handoff.

## Integration contract

The first integration is intentionally low effort for companies: add the widget snippet or link to the hosted page. A company does not need to duplicate RepairMatch logic in its own project.

The service should expose a tenant-scoped event contract for future CRM and scheduling integrations:

- `assessment.created`
- `assessment.completed`
- `review.requested`
- `shop.responded`
- `shop.accepted`
- `contact.handoff_completed`

Webhook delivery must use signed payloads, replay protection, tenant-specific endpoints, retries with backoff, and event IDs for idempotent processing. Webhooks are optional for the first customer launch and must not be required for the embedded widget to work.

## Branding

Tenant branding controls:

- Company display name.
- Logo.
- Primary and accent colors.
- Hosted-page title and description.
- Support/contact destination.

Branding must be validated for contrast and bounded in size/type. The UI must always retain readable disclosures, error messages, consent language, and the “Powered by GUBER” attribution.

## AI, uploads, and failure behavior

The existing RepairMatch safety contract remains in force:

- Vision credentials remain server-side.
- Use a configurable low-cost vision model with no silent expensive fallback.
- Compress and validate photos before analysis and enforce 3–10 photo limits.
- Validate structured output strictly and compute totals from validated lines.
- Describe output as preliminary, not a CCC ONE estimate, final estimate, diagnosis, insurer submission, or repair authorization.
- Preserve drafts and photos on upload/provider failure.
- Offer a visible retry path without duplicating estimates or shop opportunities.
- Apply per-tenant, per-user/session, per-IP, and per-email rate limits.
- Return explicit retry timing for throttled or temporarily unavailable operations.

## Rollout

1. Keep the current GUBER-native RepairMatch business tools available for administration.
2. Add the tenant configuration and guest-access layer without changing unrelated GUBER surfaces.
3. Enable an Affordable Paint & Auto Body tenant through normal enrollment.
4. Validate the widget and hosted page on that company’s website.
5. Expand tenant enrollment to other eligible companies.
6. Add optional signed webhooks after the core add-on flow is stable.

No automatic publishing or production activation is part of this design.

## Verification

The implementation is complete only when the following are verified:

- Widget loads on an approved company origin and is blocked on an unapproved origin.
- Hosted page and widget show the correct tenant branding and “Powered by GUBER.”
- Two tenants cannot read or mutate each other’s records.
- Guest customers can create, analyze, share, reopen, and accept without GUBER login.
- Magic links expire, are rate-limited, and do not expose private data.
- One-shop and nearby-shop flows preserve the approved sharing scope.
- Shops see read-only AI lines plus separate editable reviewed lines.
- Contact stays masked before acceptance and releases only to the accepted shop.
- AI failure preserves the draft and offers retry.
- Existing GUBER homepage, JAC, authentication, dashboards, marketplace, jobs, and subscription flows remain unchanged except for intentional add-on enrollment links.
- Build, focused server tests, widget/hosted-page browser tests, tenant-isolation tests, and the relevant existing smoke checks pass.