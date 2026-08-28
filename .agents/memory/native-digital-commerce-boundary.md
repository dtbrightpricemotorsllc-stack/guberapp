---
name: Native digital commerce boundary
description: Product rule separating web billing ownership from entitlement-only native app behavior.
---

All digital subscriptions, upgrades, cancellations, founding offers, invoices, payment methods, and account-management actions belong on guberapp.com. Native store builds may display current entitlements and enforce their limits, but must not initiate or deep-link digital billing actions.

**Why:** Keeping one web-owned commerce surface prevents native policy drift, duplicate purchase rails, and inconsistent subscription state.

**How to apply:** Every new digital-commerce mutation and CTA needs an explicit store-build guard. Native UI should show entitlement status and neutral “managed on guberapp.com” copy without prices, checkout links, subscribe/upgrade buttons, cancellation controls, or billing portals.