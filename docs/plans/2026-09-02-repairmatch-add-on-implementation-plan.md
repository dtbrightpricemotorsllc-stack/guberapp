# RepairMatch Multi-Company Add-On Implementation Plan

## Goal

Extend the existing GUBER RepairMatch module into a multi-tenant add-on that companies can place on their own websites through an embedded widget and a branded hosted page. Customers remain guest users of the company website, receive saved-result access through expiring email magic links, and see company branding with a small “Powered by GUBER” attribution.

Affordable Paint & Auto Body is a pilot tenant configured through normal enrollment. No Affordable-specific conditional or identifier is allowed.

## Constraints

- Do not interrupt homepage doors, JAC, authentication, dashboards, marketplace, jobs, subscriptions, or existing business navigation.
- Preserve the current signed-in GUBER RepairMatch experience during migration.
- Keep all customer, photo, AI, consent, shop, webhook, and audit data tenant-scoped.
- Preserve preliminary-estimate language and the original-AI-versus-reviewed-line provenance boundary.
- Keep contact masked until customer acceptance and release only to the accepted shop.
- Do not publish or activate a production tenant automatically.
- Use existing server-side secret and email infrastructure through the project’s approved environment-secrets/integration patterns.

## Dependency order

1. Tenant and access data model.
2. Server tenant resolution, guest sessions, and magic links.
3. Tenant-aware RepairMatch APIs and security tests.
4. Customer widget and hosted page.
5. Company enrollment/configuration and embed-code generation.
6. Optional webhooks and operational notifications.
7. Pilot configuration and full regression verification.

## Phase 1: Tenant foundation

### Data model

Add tables or equivalent records for:

- RepairMatch tenants and owning business account.
- Tenant branding and hosted-page settings.
- Approved website origins.
- Public embed identifier or site key.
- Guest customer sessions and estimate access ownership.
- Hashed email magic-link tokens and expiration/usage state.
- Tenant-scoped notification preferences.
- Signed webhook endpoints, delivery attempts, event IDs, and replay/idempotency state.

Keep existing estimate, opportunity, response, consent, and audit records compatible. Add tenant ownership and indexes required for every customer-facing and shop-facing lookup. Existing records should receive a deliberate migration association rather than a silent global default.

### Server provisioning

Update startup provisioning so development and production startup both create the required tables/indexes. Keep migrations idempotent and compatible with the project’s production deployment process.

### Tenant resolution

Create one server-side resolver used by every add-on route:

- Hosted page resolves an opaque tenant slug.
- Embed requests resolve a public tenant site key plus validated origin.
- Signed-in company/admin routes resolve the tenant from the authenticated business account.
- Shop routes resolve access from the participating-shop account and opportunity ownership.

Never trust tenant display names, company IDs, or branding values supplied by the browser.

## Phase 2: Guest access and security

### Guest sessions

Create a short-lived, tenant-bound guest session for widget and hosted-page visitors. Store only the minimum session state needed to continue a draft and associate uploaded photos and generated analysis.

Guest routes must support:

- Draft creation.
- Photo upload bookkeeping.
- Analysis generation and retry.
- Estimate detail access through the active session.
- Email magic-link request.
- Sharing approval and shop distribution.
- Response viewing and shop acceptance after magic-link re-entry.

Existing signed-in routes remain available for current GUBER users and company/shop administration.

### Email magic links

Implement:

- Opaque random tokens stored only as hashes.
- Short expiration and single-use/rotation behavior.
- Tenant and estimate/session binding.
- Per-email, per-IP, and per-session rate limits.
- Safe failure responses that do not reveal whether another record exists.
- Tenant-branded email copy with “Powered by GUBER.”
- Redirect into the tenant hosted page, not the general GUBER dashboard.

Do not place customer IDs, contact details, estimate contents, or sequential IDs in links.

### Authorization and isolation

Add tests and shared guards proving:

- Guest session A cannot read estimate B.
- Tenant A cannot read or mutate tenant B records.
- A shop can only access its own opportunities.
- An unapproved embed origin cannot initialize a tenant session.
- A non-accepted shop cannot retrieve customer contact.
- After acceptance, only the selected shop receives released contact data.

## Phase 3: Tenant-aware RepairMatch APIs

Refactor the current `server/repairmatch.ts` routes around tenant-aware access helpers rather than duplicating route logic.

### Customer endpoints

Add or adapt endpoints for:

- Resolve tenant configuration.
- Create/update a guest estimate.
- Upload/attach validated photos.
- Generate and retry analysis with idempotency.
- Request and consume an email magic link.
- Preview and approve sharing.
- Distribute to one shop or capped nearby shops.
- List and view customer-owned estimates.
- View shop responses.
- Accept one responding shop.

Return only tenant-branded configuration and the minimum data required by the current screen. Keep the existing disclosure text synchronized with server output.

### Company endpoints

Add authenticated business endpoints for:

- Enable/disable RepairMatch.
- Read/update branding.
- Read/update approved website origins.
- Configure hosted slug and notification recipient.
- Configure allowed request modes and service area.
- Generate/revoke embed site keys.
- Show embed code and hosted URL.
- Preview tenant branding.

Enforce business ownership and audit every configuration change.

### Shop endpoints

Keep shop opportunity and response APIs tenant-aware while allowing eligible participating shops to receive opportunities from multiple tenants. Ensure reviewed lines remain separate from original AI lines and that terminal opportunities cannot be edited.

## Phase 4: Customer widget and hosted page

### Shared customer application

Extract customer-facing RepairMatch UI into a shared entry that accepts tenant configuration and access state. Preserve the existing customer form and result behavior:

- Vehicle/incident details.
- 3–10 compressed photo upload.
- Preliminary assessment and disclosure.
- Body/refinish/mechanical/total labor and parts ranges.
- One-shop default and nearby-shop option.
- Explicit sharing consent.
- Shop responses and acceptance.
- Retryable failure state.

The shared application must not render GUBER consumer navigation, personal dashboard links, or unrelated platform prompts when in guest tenant mode.

### Embedded widget

Provide a small loader script that:

- Mounts a sandboxed or isolated iframe.
- Accepts a public tenant site key.
- Sends only approved configuration.
- Resizes via `postMessage`.
- Handles mobile photo capture.
- Provides a fallback hosted-page link.
- Displays the tenant branding and attribution.
- Rejects unauthorized parent origins.

Avoid exposing secret credentials or privileged API tokens in the snippet.

### Hosted page

Add a tenant slug route that:

- Loads the same shared customer application.
- Applies tenant branding from server configuration.
- Supports magic-link entry.
- Provides a stable URL for QR codes, email, and advertising.
- Shows the company support destination and “Powered by GUBER.”

## Phase 5: Company enrollment and pilot

Add a business setup section that explains the add-on plainly and provides:

- Enable/disable control.
- Branding form.
- Website-origin form.
- Hosted slug preview.
- Embed snippet copy control.
- Test-preview link.
- Customer notification settings.
- A clear privacy and preliminary-estimate explanation.

Use normal business enrollment and eligibility checks. Configure Affordable Paint & Auto Body as a tenant only through this UI or the same supported admin path used by other companies.

Pilot checklist:

1. Configure the pilot tenant and approved website origin.
2. Verify widget on the company website.
3. Verify hosted page from a clean browser.
4. Create a guest estimate and receive the magic link.
5. Complete analysis and shop request.
6. Confirm shop response and acceptance.
7. Confirm contact release only after acceptance.
8. Confirm a second tenant cannot see any pilot data.

## Phase 6: Notifications and optional webhooks

Implement email notifications needed for the initial experience first:

- Magic-link email.
- Assessment completed.
- Shop review requested.
- Shop response available.
- Accepted-shop handoff.

Add optional signed webhooks after the core flow is stable:

- `assessment.created`
- `assessment.completed`
- `review.requested`
- `shop.responded`
- `shop.accepted`
- `contact.handoff_completed`

Webhook delivery must include tenant ID, event ID, timestamp, signed payload, retry/backoff, replay protection, and idempotent processing guidance. Webhooks must not be required for the widget or hosted page.

## Phase 7: Verification and rollout gates

### Automated checks

- Tenant resolution and origin allowlist tests.
- Guest session ownership tests.
- Magic-link expiration, one-time-use, rate-limit, and tenant-binding tests.
- Widget/hosted configuration tests.
- Cross-tenant isolation tests.
- Existing RepairMatch photo, AI parsing, totals, idempotency, matching, provenance, and contact-release tests.
- Webhook signature and idempotency tests if webhooks are enabled.
- Existing project build and smoke checks.

### Browser checks

- Embed on a representative company page at desktop and mobile widths.
- Hosted page from a clean browser.
- Customer guest flow from creation through magic-link reopen.
- One-shop default and nearby-shop option.
- Company branding and attribution.
- Shop response editing and acceptance.
- Masked contact before acceptance and released contact afterward.
- Retryable AI failure without losing the draft or photos.

### Rollout gates

- Do not enable a tenant until its origin, branding, notification destination, and support path are configured.
- Start with one pilot tenant.
- Monitor errors, rate limits, failed uploads, failed magic links, provider failures, and webhook delivery.
- Expand only after tenant isolation and contact-release checks pass.
- Keep publishing and production activation manual.

## Files likely to change

- `server/repairmatch.ts`
- `server/index.ts`
- `server/routes.ts`
- `shared/schema.ts`
- `client/src/pages/repairmatch.tsx` or extracted customer/shop components
- `client/src/App.tsx`
- `client/src/components/biz-layout.tsx`
- Business settings/enrollment components
- Email/notification integration modules
- `server/tests/repairmatch*.test.ts`
- New widget/hosted-page tests and static embed-loader assets

## Completion criteria

The add-on is complete when a new eligible company can enroll without code changes, receive both customer entry points, use company branding with “Powered by GUBER,” accept guest customers through email magic links, complete the full RepairMatch flow, and remain isolated from every other tenant and from the broader GUBER customer experience.