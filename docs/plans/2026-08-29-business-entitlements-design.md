# GUBER Business Entitlements Design

## Source of truth

The TEAM GUBER business handout defines four commercial states:

- **Free verified business:** listing/discovery, business profile, services/products, hours, and service area.
- **BUSINESS+ ($19.99/month):** Free plus bookings/requests, payments/deposits, and customer history.
- **BUSINESS PRO ($49.99/month):** BUSINESS+ plus enhanced storefront, priority promotion, and a lower GUBER platform fee.
- **Founding Local Business ($9.99/month):** a promotional BUSINESS+ offer for eligible early local businesses. It does not receive PRO benefits.

Verification is a trust/listing state, not a paid entitlement. Verification alone must never grant BUSINESS+ or PRO capabilities.

## Architecture

Create one server-side business entitlement resolver that combines business verification status with the effective plan and founding-offer key. The resolver exposes named capabilities for both API authorization and the business account response consumed by the UI.

The free tier is available only as a verified public business surface. Activity capabilities require an active/trialing BUSINESS+, BUSINESS PRO, or Founding Local Business plan. PRO-only capabilities require BUSINESS PRO. Ordinary jobs, marketplace listings, and existing transaction flows remain outside this resolver.

Business-account PATCH requests use an allowlist of user-editable fields and cannot mutate verification, plan, billing, or reward fields.

## Request and UI flow

Business APIs check the named entitlement before returning or mutating paid business data. A denied request returns a clear 403 with the required tier and a stable error code. The account endpoint returns the effective plan, plan status, founding-offer state, and resolved entitlements so UI state cannot infer paid access from verification alone.

The business dashboard and navigation show free listing/profile tools to verified businesses. Activity and PRO-only destinations remain visible as locked entries with web-only upgrade guidance, while native builds only display current access/limitations and never initiate billing.

Professional businesses follow the same rule: their verified listing is free, while consultation/appointment requests, bookings, deposits/payments, and customer-history tools require BUSINESS+ access.

## Enforcement boundaries

The following are protected by activity entitlement checks:

- Generic business customer requests and their business-side management.
- Configured booking services and bookings.
- Business customer-history data.
- Candidate unlocking and direct business offers, where those tools remain in the business product.

PRO-only checks apply to enhanced storefront, priority promotion, and lower platform fee calculations. Shared `/api/jobs`, ordinary marketplace listing, and ordinary GUBER transaction routes are not changed.

## Testing

Add unit tests for plan-to-entitlement resolution and focused route tests for:

- Verified free business access to listing/profile capabilities.
- Free business denial for requests, bookings, customer history, deposits/payments, and candidate outreach.
- BUSINESS+ and Founding Local Business access to activity capabilities.
- BUSINESS+ denial for PRO-only features.
- BUSINESS PRO access to all documented entitlements.
- Professional businesses receiving the same paid activity boundary.
- Attempts to PATCH protected account fields being rejected or ignored.
- Ordinary jobs and marketplace routes remaining governed by their existing rules.