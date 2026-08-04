# Team GUBER Brand Transition Plan

**Date:** July 22, 2026  
**Status:** Implementation in progress

---

## Summary

GUBER is transitioning its community identity, onboarding experience, and public-facing language to **Team GUBER** positioning. The product name (GUBER) and all technical identifiers remain unchanged.

**New primary tagline:** More hands. More reach. More opportunities.  
**Core concept:** GUBER turns one person into a team.  
**JAC greeting:** Welcome to Team GUBER.

---

## Files Changing

### Phase 1 — Landing, Onboarding, JAC, Home Screen

| File | Change Type | Old | New | Risk |
|------|------------|-----|-----|------|
| `client/src/pages/get-started.tsx` | Branding only | "Welcome to GUBER" / "I'm JAC. Ask me anything." | "Welcome to Team GUBER" / "More hands. More reach. More opportunities." | Low |
| `client/src/pages/get-started.tsx` | Branding only | JAC greeting: "Hi, I'm JAC — your Job Assisting Coordinator…" | "Welcome to Team GUBER. I'm JAC…" | Low |
| `client/src/components/jac-homepage.tsx` | Branding only | "Welcome to GUBER — the land of opportunities…" | "Welcome to Team GUBER. I'm JAC…" | Low |
| `client/src/components/jac-homepage.tsx` | Branding only | Section eyebrow: "GUBER — THE LAND OF OPPORTUNITIES" | "TEAM GUBER · YOUR REAL-WORLD TEAM" | Low |
| `client/src/components/jac-homepage.tsx` | Branding only | "Your Job Assisting Coordinator. She'll guide you to work, income, or anything GUBER has to offer" | "Your Team GUBER coordinator. She helps you earn, get help, move things, explore opportunities, and handle life" | Low |
| `client/src/components/guber-assistant.tsx` | Branding only | DD_GREETING: "Welcome to GUBER — the land of opportunities…" | "Welcome to Team GUBER. I'm JAC…" | Low |
| `client/src/components/guber-assistant.tsx` | Branding only | Footer: "Jac · Job Assistance Coordinator" | "Jac · Team GUBER Coordinator" | Low |
| `client/src/pages/home.tsx` | Branding only | Gate modal: "READY TO EARN?" | "JOIN TEAM GUBER" | Low |
| `client/src/pages/home.tsx` | Branding only | Gate modal p: "Create a free account or sign in to accept jobs on the GUBER app." | "Create a free account or sign in. Get more hands, more reach, and more opportunities." | Low |
| `client/src/pages/home.tsx` | Branding only | Final CTA h2: "READY TO START EARNING?" | "JOIN TEAM GUBER" | Low |
| `client/src/pages/home.tsx` | Branding only | Final CTA p: "Join thousands…turning their neighborhood into a paycheck." | "More hands. More reach. More opportunities. Join Team GUBER — where one person becomes a team." | Low |
| `client/src/pages/home.tsx` | Branding only | Referral p: "Invite friends and earn GUBER Credits…" | "Invite someone who can help, earn, sell, move, inspect, or solve…" | Low |
| `docs/jac-knowledge-base.md` | Branding only | Slogan + positioning description | Team GUBER positioning | Low |

### Phase 2 — Profiles, Notifications, Empty States

| File | Change Type | Notes | Risk |
|------|------------|-------|------|
| `client/src/components/guber-assistant.tsx` | Branding only | Subtitle "Job Assisting Coordinator" in sheet header | Low |
| `client/src/components/jac-homepage.tsx` | Branding only | "Your Job Assisting Coordinator." in intro card | Low |

### Phase 3 — Pitch Deck

| File | Change Type | Old | New | Risk |
|------|------------|-----|-----|------|
| `client/src/pages/pitch-deck.tsx` | Branding only | Cover tagline: "You Name It. GUBER Gets It Done." | "More hands. More reach. More opportunities." | Low |
| `client/src/pages/pitch-deck.tsx` | Branding only | Cover sub: "Action marketplace for real-world work…" | Team GUBER positioning | Low |
| `client/src/pages/pitch-deck.tsx` | Branding only | Solution slide: "GUBER turns needs into action." | "Team GUBER connects overlooked needs with overlooked value." | Low |
| `client/src/lib/investor-config.ts` | Branding only | hero tagline: "Create Value In Yourself." | "More hands. More reach. More opportunities." | Low |
| `client/src/lib/investor-config.ts` | Branding only | hero subtitle: ["Find Work.", "Hire Help.", "Verify Things."] | Team GUBER headlines | Low |

---

## Not Changing

- Database table names, API routes, package identifiers
- Legal entity name (GUBER Global LLC)
- App bundle ID (com.guber.app)
- Domain (guberapp.com / guberapp.app)
- Authentication, payments, navigation logic
- Job flows, inspection flows, transport flows
- Feature flags, schema, route handlers
- Logo asset files (will layer "TEAM GUBER" as text, not replace)
- "Create Value In Yourself" slogan (retained as secondary; Team GUBER becomes primary)

---

## Risk Assessment

All changes are user-facing copy only. Zero logic changes. Zero schema changes. Zero API changes.  
Highest risk: JAC greeting text flows into the AI prompt context. Verified by reading `jac-knowledge-base.md` — the KB update covers this.
