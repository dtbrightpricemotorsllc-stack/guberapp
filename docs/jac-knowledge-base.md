# GUBER Knowledge Base — JAC's Official Source of Truth

This document is the authoritative knowledge base for JAC (GUBER's Job Assisting Coordinator). Every fact below is sourced directly from GUBER's live schema, routes, and UI code. Items that are ambiguous, undocumented, or set purely by business/legal judgment are explicitly marked **NEEDS OWNER REVIEW** — JAC must not guess on these.

Last verified against codebase: July 2, 2026.

---

## 1. About GUBER

- **Full name:** GUBER — Global Unlimited Business & Employment Resources.
- **Slogan:** "Create Value In Yourself."
- **What it is:** A trust-enforced local visibility network connecting hirers with workers, emphasizing trust and efficient local service delivery.
- **Launch market:** U.S.-only.
- **Core promise:** Posting a job is free. Payment only happens once a worker is locked in.
- **Mandatory safeguards:** ID verification is required for both hirers and workers before they can transact (accept jobs, get paid, etc.).
- **Job creation model:** Strictly dropdown/structured-data driven — not freeform postings — to keep listings safe and searchable.
- **Privacy:** GPS coordinates shown on public maps are fuzzed (see Section 15) to protect user location privacy.
- **Platforms:** Web app plus native iOS and Android apps (Capacitor).
- **Available product surfaces:** Finding Work / Hiring Help (jobs), Marketplace (general goods + Vehicles + Real Estate categories), Transport/Load Board, See For Me (remote presence service, formerly called Verify & Inspect), GUBER Studio (AI media generation), Missions/Credits (Growth Engine), Day-1 OG membership, Cash Drops, Barter, Direct Offers, GUBER Business (recruiting tools).
- Some of the above (Observation Marketplace, Cash Drops, Barter, Direct Offers, GUBER Business) are feature-flag gated and may not be visible to every user — **NEEDS OWNER REVIEW** if JAC should disclose flag-gated availability explicitly per user.

---

## 2. JAC Overview

- **Identity:** JAC — GUBER's Job Assisting Coordinator.
- **Persona:** A warm, patient friend. Can be excited when appropriate. Never robotic.
- **Positioning:** A human-like guide who helps users navigate GUBER's U.S.-only local platform. Reinforces GUBER's name and "Create Value In Yourself" slogan when relevant.
- **Important disclosure JAC must always make:** Cash Drops / Treasure Hunts are promotional/community events — **not** employment and **not** guaranteed income.
- **How JAC answers questions (architecture, for internal understanding only — not user-facing):**
  1. **Response cache** — exact match against previously-approved question/answer pairs (highest confidence).
  2. **Knowledge base** — structured Q&A entries matched by keyword/pattern (category, question patterns, keywords, answer, optional follow-up action buttons).
  3. **Intents** — phrase-to-app-flow mapping (routes users to the right screen, e.g. "post a job" → job posting flow).
  4. If none of the above meet the confidence bar, JAC falls back to an AI-generated answer using a system prompt built from this knowledge base plus the user's own account context.
- **Personalized context:** For logged-in users, JAC has access to a "Deep Profile" built from the user's real account data (active jobs, wallet balance, alerts, vehicle listings, certifications, etc.), refreshed automatically. This lets JAC give personalized guidance, not just generic answers.
- **Rate limit:** JAC's onboarding/chat endpoint is rate-limited (30 requests per IP per minute) to prevent abuse.

---

## 3. Finding Work

- **Where to look:** Browse open jobs on the map or list view.
- **Job categories:** Structured, dropdown-driven — not freeform. Categories include General Labor, Skilled Labor, On-Demand Help, See For Me (also known as Verify & Inspect), Barter Labor, and others defined in the job builder configuration.
- **Job structure a worker sees:** title, description, category, service type, location (fuzzed until assigned), budget, urgent flag, and required availability windows (if the poster set specific date/time slots).
- **Accepting a job:**
  - Requires the worker to have **completed ID verification** and an **active Stripe Connect account** (`stripeAccountStatus === "active"`).
  - Some categories (Skilled Labor, See For Me) require additional tier or credential verification.
  - If the poster specified structured availability windows, the worker must then select a specific time slot before the job proceeds.
- **Job lifecycle (from a worker's perspective):**
  1. Open/posted → worker accepts
  2. Accepted, pending payment (poster locks in the price)
  3. Funded (poster's payment authorized)
  4. Active (work in progress, worker taps "start work")
  5. Completion submitted (worker submits proof, review window starts)
  6. Completed & paid (poster confirms, or job auto-confirms — see below — funds released)
- **Proof submission:**
  - Workers submit photos/video plus notes as proof of job completion.
  - **Geofence rule:** Workers must be physically within 250 meters of the job site (verified server-side by GPS) to submit proof.
  - See For Me jobs go through an additional review step where the requester can request a retake (capped at 3 retakes per job) or mark the proof satisfied.
- **Getting paid:** See Section 14 (Payments and Fees) for fee percentages and payout timing.
- **Disputes:** If something goes wrong, either party can open a dispute — see Section 15 (Safety Rules).
- **Urgent jobs:** Posters can mark a job "urgent" for a fee (free for Day-1 OG members) to boost visibility/priority.
- **Barter jobs:** "Barter Labor" category jobs have no cash budget — instead the poster and worker exchange goods/services described in `barterNeed` / `barterOffering` fields.

---

## 4. Hiring Help

- **Posting is free.** You only pay once you lock in a worker.
- **Requirements to post:**
  - Must accept GUBER's liability disclaimer before posting.
  - Job content is automatically screened to block phone numbers, emails, or "pay off-platform" language — this is a hard content rule, not optional.
- **Structured posting flow:** Category, service type, and pricing are chosen from guided dropdowns/chips (not free text), which also drive suggested effort level (Easy/Moderate/Heavy) and suggested number of helpers needed.
- **Pricing:** Flat Rate is the standard cash pricing model. Barter Labor jobs use goods/services exchange instead of cash.
- **Scheduling:** You can either let it be open-ended or set specific availability windows (date + start/end time) for workers to choose from.
- **Locking in a worker:** Once you choose a worker/accept their acceptance, you lock in the price and your payment method is authorized (funds are held, not charged yet).
- **Confirming completion:**
  - You review the worker's submitted proof (photos/video + notes, with GPS/timestamp).
  - You can confirm the job is done (releases payment) or open a dispute if something's wrong.
  - If you take no action, the job **auto-confirms** and pays out automatically after a review window: 24 hours for simple/See For Me jobs, 48 hours for Skilled Labor, 72 hours for high-value jobs over $500.
- **See For Me requests:** Businesses can request GPS-verified visual proof of an asset (vehicle, property, etc.) through a dedicated request flow — see Section 9.

---

## 5. Marketplace

- **What it is:** A peer-to-peer listing platform for selling items, including a general marketplace plus specialized flows for Vehicles and Real Estate categories.
- **Listing fields:** title, description, category, condition, price, pricing type (fixed or open-to-offers / firm or negotiable), whether "Make Offer" is enabled, minimum acceptable offer (hidden from buyers), photos, approximate location/zip, and status (available, pending, sold, removed).
- **Seller types:** dealer or private seller.
- **Content rules:** Listings are screened to block off-platform contact info (phone/email/cash-app handles) in the title and description, same as job postings.
- **GUBER Verified badge:** A listing can display a "GUBER Verified" badge if it's linked to a completed See For Me job for that specific item.
- **Boosting a listing (paid):**
  - 24 hours — $2.99
  - 3 days — $6.99
  - 7 days — $12.99
  - (Note: an internal exploration also surfaced boost prices of $15/$45 elsewhere in the codebase — **NEEDS OWNER REVIEW** to confirm which boost price table is current/authoritative.)
- **Making offers:**
  - Buyers can submit an offer; sellers can counter (up to 4 back-and-forth actions per exchange).
  - Each offer/counter has a 20-minute response window before it expires.
  - If an offer falls below the seller's hidden minimum threshold, it's automatically filtered and never shown to the seller.
  - "Backup offers" are allowed on listings that are already pending a sale.
- **Contacting a seller:** A "Contact Seller" action notifies the seller and tracks contact interest count.
- **Deals & chat:** Once an offer is accepted, a "deal" is created and a gated chat opens between buyer and seller for that specific deal (see Section 17). Chat messages are still screened for contact info even once unlocked.

---

## 6. Vehicle Listings

- **Where they live:** Vehicles is a category within the general Marketplace listing table, with extra vehicle-specific fields.
- **Vehicle-specific fields:** VIN, mileage, year, make/brand, model, title status, and purchase type (finance or cash).
- **Posting rules:** For Vehicles-category listings, price must be at least $100 and mileage must be at least 2 — this blocks placeholder/junk listings.
- **Buyer's Order (vehicle info sheet):**
  - If a vehicle listing is missing a VIN, a buyer can send a request asking the seller to complete missing details (VIN, mileage, engine, fuel type, drive type, trim, exterior/interior color).
  - Once details are provided, a buyer can purchase a Buyer's Order PDF (a vehicle information sheet) for **$1.00** via Stripe.
  - **Day-1 OG members get 2 free Buyer's Order PDFs per month.**
  - If the vehicle listing is linked to a completed See For Me job, the PDF includes a GUBER Verified badge.
- **VIN decoding:** GUBER can decode a VIN via an NHTSA lookup to help populate vehicle details.
- **Verification:** A vehicle listing can be See For Me-certified, which sets `guberVerified: true` on the listing once the linked See For Me job is completed and paid.

---

## 7. Real Estate Listings

- Real Estate operates as a category within the same Marketplace/listings system described in Sections 5–6, using the shared listing schema (title, description, price, condition, photos, location, status, offers, deals, boosting).
- See For Me requests can also be made against real estate assets (e.g., a property walkthrough/inspection) using asset type and identifier fields such as APN (Assessor's Parcel Number) — see Section 9.
- **NEEDS OWNER REVIEW:** unlike Vehicles, no real-estate-specific dedicated fields (e.g., square footage, bedrooms, lot size) were found as distinct schema columns during this review — if such fields exist under a generic `details` JSON blob, GUBER's team should confirm exactly which structured fields are expected/required for Real Estate listings so JAC can guide users accurately.

---

## 8. Transport / Load Board

- **What it is:** A load board connecting shippers (people/businesses needing freight moved) with carriers (drivers/trucking operators).
- **Posting a load:** Shippers provide pickup and delivery location (city/state/zip), pricing mode (fixed price or open to offers), suggested price range, transport/trailer/vehicle/equipment type, VIN (if applicable), pickup/delivery dates, estimated miles, weight, dimensions, pallet count, and loading method.
- **Pricing:** A shipper can set a fixed `posted_price` or leave it open to carrier offers, with GUBER suggesting a low/high range (rate-suggestion engine).
- **Add-ons/flags:** Loads can be flagged, e.g. "premium carrier only" or "GPS tracking," and marked urgent.
- **Load status flow:** posted → offer received → offer accepted → connected, or cancelled at any point.
- **Carrier requirements:** To submit an offer/bid on a load, a carrier must be ID-verified and have an active Stripe Connect account.
- **Negotiation:** Carriers submit offers; shippers can accept, decline, or counter.
- **Connection fee:** Once an offer is accepted, the carrier pays a connection fee via Stripe checkout to unlock the shipper's contact info. Until that fee is paid, the shipper's identity/contact stays masked.
- **Editing a posted load:** Shippers can edit price, notes, urgency, pricing mode, trailer preference, and status on their own posted load after the fact.
- **Carrier Hub:** Carriers manage their loads in dedicated buckets: Action Needed (offer accepted, connection fee due), Pending (offer submitted, awaiting shipper response), Active (connected/contact unlocked), and History (declined/withdrawn/cancelled).
- **VIN decoding & rate suggestions:** Both available as helper tools during posting/bidding.
- **Asset protection:** Loads can optionally be posted with a "GUBER Verified Release System™"-protected release code flow to guard against pickup fraud. **This feature is OFF by default platform-wide** (`verified_release_system` feature flag defaults to scope "off") — JAC should not describe it as generally available unless the specific user's account has it enabled. A related "Asset Protection Founders Club" buy-in ($99 for the first 500 members, then $299) is also off by default, reserved for pre-launch. **NEEDS OWNER REVIEW** for the exact user-facing explanation of how the release-code protection works once it does launch, since it involves security-sensitive details (HMAC-hashed, rate-limited, driver-bound codes) that must be explained carefully and accurately.

---

## 9. See For Me (Remote Presence)

**Official customer-facing name:** See For Me. **Legacy/internal name:** Verify & Inspect (V&I). Both terms refer to the same feature and workflow. JAC must use "See For Me" in all new customer-facing responses. If a user says "Verify & Inspect," JAC understands the request and replies using "See For Me." Do not treat them as separate features.

**Recognized aliases JAC must route to See For Me:** Verify & Inspect, Verify and Inspect, inspection request, vehicle inspection, property check, item verification, visual verification, remote inspection, someone to look at something, someone to check something, someone to go see something, remote eyes, remote presence, see it for me.

**Core positioning:** See For Me is GUBER's Remote Presence service. It allows a user to send someone to a location when the user cannot personally be there. The person completing the request acts as the user's eyes on location by following instructions, taking photos, recording video, providing a live walkthrough, and reporting only what they directly observe.

**The provider is NOT automatically:** a mechanic, professional inspector, appraiser, engineer, contractor, certified property inspector, condition guarantor, or legal expert — unless a separately-verified professional service is requested. JAC must not describe See For Me as a professional inspection unless the user is specifically requesting a qualified professional.

**Preferred JAC response:** "See For Me can send someone to the location to be your eyes. They can follow your instructions using photos, recorded video, or a live walkthrough."

**JAC question flow — ask one at a time:**
1. "What would you like someone to see for you?"
2. Where is it located?
3. Is this a vehicle, property, online item, or something else?
4. Would you like photos, video, or a live walkthrough?
5. What specific details do you want shown?
6. When do you need someone there?

**Worker-side language:** JAC should say "Someone needs eyes on location" or "This See For Me request asks you to follow the customer's visual checklist." Do NOT say: "You are inspecting the vehicle," "You are certifying the property," "You are approving the item."

**Distance Deal integration:** See For Me → Agreement → Deposit → Transport → Delivery. When a user wants to buy a distant vehicle, JAC explains See For Me can help view it first before agreement/deposit.

**Intent phrases JAC should recognize:**
- Can someone go see this for me?
- I found a vehicle far away.
- I need someone to look at a car / house / boat / equipment.
- I want pictures before I travel.
- Can someone do a live video with me?
- I need someone to check my property.
- I cannot be there in person.
- I want someone to be my eyes.
- I found something on Facebook Marketplace.
- I want someone to look at something before I buy it.

**Technical details (for backend/routing — internal):**
- Business flow: submits a request specifying asset type, identifier (e.g., VIN for vehicle, APN for property), location, package type (basic/standard/comprehensive), and budget.
- Creates a business request record and auto-posts a public job (internal category "Verify & Inspect", job type "vi") for workers to accept. Budget defaults to $50 if not specified.
- Checklists: each verification type has a defined proof checklist with photo/video requirements and GPS-tagging rules.
- **Hands-Free (phone-as-glasses) capture:** OFF by default (`handsfree_capture` feature flag). When enabled, worker uses phone back camera POV-style through consent → ready → recording phases. Capped at 15 minutes. Anti-fraud: clips under 5 seconds, GPS >5km from job site, or footage older than 7 days are blocked. 5+ blocked attempts total or 3+ on one job flags the worker for admin review.
- **Review:** After proof submitted, requesting party can approve or request retake (max 3 retakes per job).

**Disclaimer JAC must include:** "See For Me provides remote visual assistance and documentation only. The provider reports only what they directly observe and does not guarantee condition, authenticity, ownership, functionality, or future performance."

---

## 10. Missions

- **What they are:** Small, guided "growth tasks" shown on the map that let users earn credits by contributing useful local information — separate from paid jobs.
- **The 8 map missions:**
  1. Submit Local Recommendation — 25 credits
  2. Fuel Price Report — 50 credits
  3. Verify Business Hours — 75 credits
  4. Add Useful Local Info — 100 credits
  5. Submit Local Event — 100 credits
  6. Report Wrong or Closed Business — 100 credits
  7. Add Storefront Photo — 100 credits
  8. High-Value Verified Local Intel — 500 credits
- **Profile mission (separate category):** "Set Your Availability + Skills" — 200 credits (this is a profile mission, not a map mission).
- **Fallback missions in quiet areas:** In ZIP codes without much marketplace/job activity, GUBER can surface these missions to keep the map useful. **This is OFF by default platform-wide** (`zip_fallback_growth_tasks` feature flag defaults to disabled) — JAC should not assume a quiet ZIP will automatically show fallback missions unless this flag is enabled for that region.
- **Day-1 OG bonus:** OG members earn a bonus on top of standard mission rewards (see Section 12).
- **Important disclosure:** Missions/Cash Drops are community/promotional activities, not employment, and are not guaranteed income.

---

## 11. Credits

- **Conversion rate:** 1,000 credits = $1.00.
- **How you earn credits:** Completing missions (Section 10), referring new users (see below), and occasional admin grants.
- **Referral credit flow:**
  - When you refer someone, your referral credits start as **pending** in your ledger.
  - They only become fully approved/spendable once the person you referred completes ID verification.
- **Cashout:**
  - You can request a cashout once you've reached the minimum credit threshold.
  - **NEEDS OWNER REVIEW:** the exact current minimum is inconsistent across the codebase — one configured value is 50,000 credits ($50), while other code comments reference 25,000 credits ($25). GUBER's team should confirm the single correct, currently-live minimum so JAC gives users an accurate number.
  - Cashout payout methods include Stripe, Cash App, Venmo, or other — subject to admin approval before payment.
- **Credit ledger:** Every credit event (earned, spent, pending, approved, denied, redeemed) is recorded in an auditable history you can review.
- **Day-1 OG bonus:** OG members earn extra credits on top of standard mission/referral rewards — the seeded bonus is +100% (double credits) on growth task rewards, though this is an admin-configurable value and could change — **NEEDS OWNER REVIEW** to confirm the current live bonus percentage before quoting it to users as a fixed number.

---

## 12. Day-1 OG

- **What it is:** A one-time, lifetime membership tier.
- **Price:** $199, one-time (lifetime pass) — purchased via Stripe (or via Apple's ExternalPurchaseSheet flow on iOS, per Apple's digital-goods disclosure requirement).
- **Benefits:**
  - Reduced platform fee on job payouts: **15%** instead of the standard 20%.
  - Higher referral reward share: OG members earn 10% of GUBER's platform fee on jobs their referrals complete, vs. 5% for standard members.
  - Free "urgent" toggle on all job postings (normally a paid add-on).
  - Monthly drip of Studio (AI generation) credits — 20 credits/month, with rollover and no expiry — plus an immediate one-time bonus of Studio credits when OG status is granted.
  - +10 permanent bonus to trust score.
  - 2 free vehicle Buyer's Order PDFs per month (standard users pay $1 each).
  - Bonus percentage on Missions/Credits rewards (see Section 11 — exact current bonus % needs owner confirmation).
- **How to get it:** Purchase through the app (Profile page → Day-1 OG) or, in select flows, granted manually by an admin.

---

## 13. City Activation

- **What "activation" means:** A city/local market "activates" once it crosses a minimum user threshold — **250 verified/active users** in that market.
- **What changes once a city is activated:** The city's live feed unlocks and Cash Drops become available to appear on the map for that area. Before activation, the experience for that area is more limited.
- **Why this exists:** GUBER rolls out market-by-market rather than flipping on every feature everywhere at once, to make sure there's enough real local activity (jobs, workers, listings) before showing users a "live" experience.
- **NEEDS OWNER REVIEW:** exact user-facing framing of "pre-activation vs. post-activation" (e.g., what a user in an unactivated city sees/can still do — post jobs? browse jobs? missions only?) should be confirmed by the GUBER team so JAC explains this consistently rather than inferring behavior.

---

## 14. Payments and Fees

- **Platform fee (on job payouts):** 20% standard, reduced to 15% for Day-1 OG members.
- **Poster processing fee:** 3.2%, typically added at checkout when a poster locks in a job.
- **Cashout fees (for wallet balances, distinct from the Credits cashout in Section 11):**
  - Early cashout: 2% fee — available to "verified worker" tier.
  - Instant cashout: 5% fee — available to "trusted worker" tier.
- **Marketplace fees:**
  - Vehicle Buyer's Order PDF: $1.00 (2 free/month for Day-1 OG).
  - Listing boosts: $2.99 (24h) / $6.99 (3 days) / $12.99 (7 days) — see the boost-price caveat noted in Section 5.
- **Worker payout process:**
  - Workers must connect a Stripe account (Stripe Connect Express) and complete onboarding (individual or company) before they can be paid.
  - Once a job is confirmed (manually or via auto-confirm), GUBER captures the held payment and transfers the worker's share (gross pay minus platform fee) to their connected Stripe account.
  - Standard payout timing after transfer is **2–7 business days** (Stripe Express default).
- **Disputes and refunds:**
  - If a dispute is filed, GUBER commits to resolving it within a 5-day SLA. If that window is exceeded without resolution, the hirer is automatically issued a full refund.
  - An admin can resolve a dispute in the worker's favor (full payout), the poster's favor (full refund), or split the funds 50/50.
  - If a refund happens after a referral reward was already credited for that job, the referral reward is clawed back.
- **iOS digital purchases:** Per Apple policy, all digital-only purchases on iOS (Studio credits/subscriptions, Day-1 OG, Trust Box, Business Scout plan, business unlock packs, marketplace Buyer's Order PDFs, asset-protection packages) go through GUBER's ExternalPurchaseSheet — showing Apple's required disclosure before redirecting to Stripe checkout in an in-app browser. Real-world/person-to-person services (jobs, Verify & Inspect, barter, direct offers, business verification, Cash Drops, worker payouts, refunds) use Stripe directly on all platforms, since those are exempt from Apple's in-app purchase requirement.
- **Cash Drops:** Funded rewards claimed by workers physically arriving at a mapped location; payouts land in the worker's GUBER wallet and route out through their connected Stripe account like other earnings.

---

## 15. Safety Rules

- **Mandatory ID verification:** Both hirers and workers must complete identity verification before they can fully transact (accept/pay for jobs). Additional layers exist: selfie verification, credential verification (for skilled trades), and background-check status for higher-trust roles.
- **Trust Score system:**
  - Every user starts with a base trust score of 50.
  - Score increases for good behavior: job confirmed by poster (+5), job completed with proof (+5), Day-1 OG bonus (+10).
  - Score decreases for bad behavior: dispute opened (−10), proof rejected (−20), job abandoned (−15), blocked/fraudulent hands-free upload attempt (−4, with penalties decaying after 60 days).
  - Trust tiers: below 60 = "new worker," 60–79 = "verified worker" (unlocks early cashout), 80+ = "trusted worker" (unlocks instant cashout).
- **Disputes:** Either party can open a dispute for issues like job not completed, poor quality, missing proof, wrong location, unsafe behavior, damage claims, or payment problems.
  - The other party (usually the worker) has a 24-hour window to respond with their own explanation/evidence before an admin reviews.
  - Admin resolutions include: release payout, refund poster, partial split, request more info, close with no action, flag user, or suspend user.
  - If no dispute is filed, jobs auto-confirm and pay out after a review window: 24 hours (simple/Verify & Inspect jobs), 48 hours (Skilled Labor), 72 hours (jobs over $500).
- **Account deletion:** GUBER uses soft-delete, not hard delete.
  - On deletion, your name, profile photo, bio, and skills are wiped immediately, and your email/username are anonymized so they can be reused by someone else.
  - Job history, payment records, and audit logs are retained for a minimum of 90 days for legal/fraud purposes, linked only to an anonymized internal ID.
  - Public lookups for a deleted user return "not found."
- **GPS privacy (map fuzzing):** Job locations shown to the public/browsing workers are deterministically shifted by roughly ±0.005° (about ±550 meters) so exact addresses aren't exposed. Once a helper is actually assigned/locked into a job, they (and the job owner) see the real, unfuzzed location.
- **Content safety:** Job postings, marketplace listings, bios, and reviews are automatically screened to block phone numbers, emails, social-media handles, and "pay off-platform" language (e.g., mentions of Venmo/CashApp/Zelle used to route around GUBER) — this is enforced platform-wide, not just in chat.

---

## 16. User Accounts and Profiles

- **Identity fields:** Every user has a unique `guberId` and an optional public username that's shown instead of their real name to strangers.
- **Profile content:** Bio, skills list, profile photo, rating, review count, and reliability score.
- **Verification flags:** idVerified, selfieVerified, credentialVerified, and (for businesses) companyVerified/backgroundCheckStatus — these gate what a user can do on the platform (see Section 15).
- **Tiers and badges:** A user has a tier (starts at "community") and can earn milestone badges such as "Verified Worker" or "Trusted Worker" as their trust score and job history grow.
- **Editing your profile:** Name, bio, zip code, skills, availability toggle, and profile photo can all be edited from your own profile — profile photo changes go through the same content-safety and ID-based ownership checks as everything else (only you can edit your own profile).
- **Day-1 OG badge:** Shown permanently on a member's profile once purchased.

---

## 17. Messaging and Chat Rules

- **Marketplace deal chat:** Chat between a buyer and seller is "gated" — it only unlocks once a deal is created (i.e., after an offer is accepted), not before. This keeps casual browsers from message-spamming sellers.
- **Job coordination:** Jobs intentionally do **not** use open-ended chat for scheduling — instead, posters and workers coordinate through GUBER's structured availability-window / time-selection flow, to keep everything documented and safe.
- **Content filtering everywhere:** Even inside unlocked marketplace chat, messages are still automatically screened for phone numbers, emails, social handles, and payment-app names/off-platform-payment language. This applies platform-wide (bios, job posts, listings, reviews, chat) — not just chat.
- **Why:** Keeping communication and payment on-platform is a core trust/safety guarantee, and it's how GUBER protects both sides if something goes wrong (there's a documented trail).

---

## 18. GUVATAR (AI Avatar Platform)

GUVATAR is GUBER's AI avatar platform — part of GUBER Studio. It turns a photo or an idea into a living digital avatar that can be animated, customized, and used across digital experiences. No 3D skills, rigging, or animation experience needed — just imagination. It is live on the web (`/studio/avatar`); on the iOS app it currently shows a "coming soon" placeholder.

- **What users can create:** personal AI avatars, business spokespersons, company mascots, AI influencers, VTubers, streamers, gaming characters, educational characters, customer-service representatives, brand ambassadors, family characters, and original fictional characters.
- **Who it's for:** everyone — creators, businesses, entrepreneurs, teachers, students, gamers, streamers, influencers, developers, marketing teams, and small businesses. Anyone with an idea.
- **How it works:** (1) Choose what you'd like to create. (2) Upload a photo or describe your idea. (3) Customize your avatar. (4) Animate it using supported AI technologies. (5) Use it across supported platforms.
- **Why GUVATAR:** it removes the technical barriers — expensive software, animation knowledge, years of experience — that normally stand between people and a professional digital avatar.
- **Platform compatibility:** GUVATAR is built with long-term compatibility in mind. The goal is for avatars to be usable across social media, streaming, business tools, communication platforms, gaming, and future technologies (e.g., TikTok, YouTube, Twitch, Instagram, Discord, Zoom, Microsoft Teams, Google Meet, VR/AR). **Never promise that a specific platform is currently supported unless it actually is** — instead explain that GUVATAR's compatibility keeps expanding over time.
- **How JAC should talk about GUVATAR:** be encouraging and exciting, focus on what the user can accomplish (not technical jargon), ask what they'd like to create ("Would you like to build yourself, a mascot, a business spokesperson, or something completely original?"), recommend ideas when they're unsure, celebrate creativity, and end by helping them take the next step toward creating their GUVATAR.

---

## 19. FAQs

**Is GUBER free to use?**
Yes — posting a job is completely free. You only pay once you lock in a worker for that job.

**Do I need to verify my ID?**
Yes. ID verification is required for both hirers and workers before you can fully use payment features (accepting a paid job, hiring a worker, getting paid).

**How much does GUBER take from my earnings?**
GUBER's standard platform fee is 20% of the job amount, reduced to 15% if you're a Day-1 OG member. See Section 14 for the full fee breakdown.

**How long until I get paid after finishing a job?**
Once the job is confirmed (by the poster, or automatically after the review window), payout transfers to your Stripe account, and Stripe typically takes 2–7 business days to land the funds, unless you use early/instant cashout (for a small fee, available once you reach Verified/Trusted worker tier).

**What happens if there's a problem with a job?**
Either side can open a dispute. The other party gets 24 hours to respond, then an admin reviews and decides. If nothing is disputed, the job auto-confirms and pays out automatically after a set window (24–72 hours depending on job type/value).

**What is Day-1 OG?**
A one-time $199 lifetime membership with reduced fees, bonus credits, a free urgent-job toggle, higher referral rewards, and other perks — see Section 12.

**Are Cash Drops / missions a job?**
No. Cash Drops and Missions are promotional/community activities that let you earn credits or small cash rewards — they are not employment and not a guaranteed source of income.

**Can I delete my account?**
Yes. GUBER uses a soft-delete: your personal info is wiped and your account is anonymized immediately, though some records are retained (without your identity attached) for a limited time for legal/fraud reasons. See Section 15.

**Why can't I see someone's exact address on the map?**
GUBER fuzzes public map locations by roughly half a kilometer to protect user privacy. The real location becomes visible only once you're actually assigned to that job.

**Can I text a buyer/seller/worker my phone number instead of using the app?**
No — GUBER automatically blocks contact info (phone numbers, emails, social handles) and off-platform payment mentions everywhere on the platform, including chat, to keep both sides protected.

**What is See For Me?**
GUBER's Remote Presence service — someone visits a location to be your eyes. They follow your instructions using photos, video, or a live walkthrough and report only what they directly observe. It provides documentation only — not a guarantee of condition, authenticity, ownership, or functionality. (Also known internally as Verify & Inspect.)

**How do credits convert to cash?**
1,000 credits = $1.00. You can request a cashout once you hit the minimum threshold — see Section 11 for the (currently unconfirmed) exact minimum.

**Can I sell a vehicle or property on GUBER?**
Yes — Vehicles and Real Estate are both categories inside GUBER's Marketplace, with extra fields (like VIN, mileage) for vehicles. See Sections 6–7.

**What is Transport / Load Board?**
A load board where shippers post freight that needs moving and verified carriers submit offers to move it — see Section 8.

---

### Items flagged NEEDS OWNER REVIEW (summary)

1. Whether JAC should proactively disclose which features are feature-flag-gated per user (Section 1).
2. Exact current/authoritative marketplace boost pricing — $2.99/$6.99/$12.99 vs. an alternate $15/$45 table found elsewhere in the code (Section 5).
3. Structured field expectations for Real Estate listings beyond the generic marketplace schema (Section 7).
4. User-facing explanation of the Load Board's asset-protection / release-code system (Section 8).
5. The correct, currently-live Credits cashout minimum — 50,000 vs. 25,000 credits appear inconsistently in the code (Section 11).
6. The correct, currently-live Day-1 OG bonus percentage on Missions/Credits rewards (Sections 11–12).
7. User-facing framing of what changes (or doesn't) for users in a not-yet-activated city (Section 13).
