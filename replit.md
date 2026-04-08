# GUBER - Trust-Enforced Local Visibility Network

## Overview
GUBER is a local visibility network connecting individuals needing assistance with those who can provide it, emphasizing trust and efficient local service delivery. It features a post-first job flow, where job posting is free, and payment occurs only upon worker lock-in via Stripe. A core security measure is mandatory ID verification for both job posters and workers. The project aims to capture a significant market share in the local service economy by offering a streamlined, secure, and user-friendly experience, including a platform for passive income through real-world observations and a business-to-business talent scouting platform.

## User Preferences
I prefer a concise and direct communication style. I value iterative development and clear explanations of the changes made. Please ask for confirmation before implementing major architectural changes or introducing new external dependencies. For code, I appreciate well-structured and readable solutions.

## System Architecture
GUBER employs a modern full-stack architecture with a focus on security, user experience, and scalability.

**UI/UX Decisions:**
- **Theme & Branding:** Dark theme with neon green/purple accents, rainbow gradient separators, and custom shadcn/ui components.
- **Navigation:** Bottom tab navigation for core functionalities.
- **Job Creation:** Strictly dropdown-driven input to ensure structured data and dynamic form fields based on service categories.
- **Map Integration:** Google Maps displaying category-colored pins, fuzzed coordinates for privacy, and specific markers for user and worker locations.
- **Business/Enterprise Mode:** A distinct dark theme for business users with specialized dashboards and navigation for talent scouting and bulk job posting.

**Technical Implementations:**
- **Core Stack:** React, TypeScript, Vite, TailwindCSS, Express.js, PostgreSQL with Drizzle ORM.
- **Authentication:** Session-based authentication using `express-session` and `scrypt` for password hashing.
- **State Management:** TanStack Query for efficient data fetching and synchronization.
- **Payments:** Two-account Stripe setup (`stripeMain` for subscriptions/boosts, `stripe` for Connect operations like destination charges and payouts) with distinct webhooks.
- **Advanced Job Features:**
    - **V&I Smart Forms:** Multi-layer dropdowns (up to 6 layers) for dynamic job title and description generation.
    - **Time-Based Pricing:** Scales pricing suggestions based on estimated job durations.
    - **Barter Listings:** Structured format for barter jobs.
    - **Milestone System:** Tracks job progress with GPS snapshots for "On My Way" and "Arrived."
    - **Proof Engine:** "Worker Clipboard" for photo/video proof with geo-locking.
    - **Auto Pay Increase:** Optional feature for job posters to automatically increase job payouts over time.
- **Trust & Reliability:** A system tracking helper reliability (completion/cancellation rates) influencing badge tiers and job eligibility, along with a dynamic trust score.
- **Admin Panel:** Role-based access for managing users, jobs, catalog, disputes, and proof templates.
- **Direct Offer System:** Private hirer-to-worker offers with structured counters (+5%/+10%/+15%, max 2 per side, $2 minimum increase), 60-minute expiration, privacy before acceptance (worker sees rating/trust only, not hirer identity), payment required after worker accepts to unlock full details.
- **Worker Clock-In System:** Workers must clock in (`isAvailable` + `clockedInAt`) to appear on maps and receive direct offers. Clock out removes from map and blocks new offers.
- **Map Mode Separation:** Dashboard Hire mode shows only workers, Work mode shows only jobs. Full map page defaults to Jobs Only with Jobs/Workers toggle.
- **Money Ledger & Compliance:** Full payment tracking with `guber_payments`, `money_ledger`, `guber_disputes`, `cancellation_log`, and `fund_claims_or_holds` tables. Every dollar has source, owner, purpose, timestamps, and linked records.
- **Privacy Features:** Contact information filtering, fuzzed location coordinates, and audit logging.
- **Observation Marketplace:** A passive income system for workers to submit real-world observations (photos + GPS + notes) for purchase by companies, with automated expiry and conversion to draft jobs.
- **GUBER Resume:** A private, auto-tracking worker work record system with denormalized data and qualification management.
- **Cash Drop System:** An alternative payment system for marketing/promotional expenses, not tied to Stripe, with external payout methods and a GUBER Credit option.
- **Platform Settings:** Database-driven key-value store for configurable platform parameters, accessible via an admin UI.
- **GUBER Business:** A platform for companies to scout talent, manage offers, and verify workers, with tiered access, subscription plans, and background check eligibility tracking.
- **Capacitor Integration:** Mobile app support using Capacitor for native functionality, including native OAuth flows and deep linking.
- **Google Play Compliance (Store Build Gating):** Runtime platform detection via `client/src/lib/platform.ts` using Capacitor's `getPlatform()`. Digital purchase UI (Day-1 OG, Trust Box, Marketplace Boost, Biz Verification fee) is hidden in Android/iOS store builds (`isStoreBuild`). Real-world service payments (job posting, V&I) and Stripe Connect onboarding are left untouched. AI or Not iframe gets `hideCheckout=1` query param in store builds and the postMessage checkout handler is blocked. Entitlements sync from backend via `/api/auth/me` regardless of platform.

## External Dependencies
- **Stripe Connect:** For handling all payment processing, including destination charges, connected accounts, and manual payouts.
- **Google Maps JS API:** Provides interactive mapping capabilities for job and worker locations.
- **PostgreSQL:** The primary relational database for persistent data storage.
- **AI or Not Service:** An external AI service integrated via an iframe for specific features.