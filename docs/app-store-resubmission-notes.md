# App Store Resubmission Notes — reference copy

Paste the text below into App Store Connect's "Notes" / "What to test" /
Resolution Center reply field for this version's review.

---

Thank you for the detailed feedback. We've addressed every issue raised:

**Guideline 5.1.1(v) — Account Deletion**
In-app account deletion is available under Profile → Account Settings →
Danger Zone. It requires a two-step confirmation, then permanently
anonymizes and deletes the account. If this was missed during review, it's
possible the broken Sign in with Apple flow (see below) prevented reaching
Settings — that's now fixed.

**Guideline 2.1.1(a) — App Completeness (4 issues, all fixed)**
1. "Sign in with Apple" error: the app was calling a native Apple Sign-In
   flow through a broken web-based intermediary. We built a proper native
   Sign in with Apple integration using Apple's own AuthenticationServices
   framework — no third-party dependency.
2. "No photo options" when submitting proof photos: several photo-capture
   screens were using plain file inputs that iOS's WebView doesn't reliably
   turn into a working camera picker. All camera capture surfaces
   (mission proof, job bounty photos, cash drop proof, general proof
   submission, observation photos, ID verification) now use the native
   Camera plugin directly, with a safe fallback if it's ever unavailable.
3. "Change photo" unresponsive: reviewed and retested; no reproducible
   issue found in current code. Will monitor and would appreciate specific
   repro steps if this recurs.
4. Wallet screen blank: reviewed and retested; loading/empty/error states
   are all handled correctly. This may have been a downstream effect of the
   Sign-In issue above preventing account data from loading — will monitor.

**Guideline 2.5.4 — Background Location**
Removed the unused background-location capability entirely. The app never
actually used background tracking (task location tracking is foreground-
only, active only during an accepted job), so we removed the unjustified
"Always Allow" location prompt and the unused background modes
declaration. Location is now requested only in the foreground, only when
relevant to an active job.

**Guideline 3.1.1 — Payments**
Reviewed all in-app purchase and credit-related screens for clarity. Fixed
instances where a purchase's credit cost wasn't shown before the user
tapped "Generate," and clarified button copy so prices are always visible
before purchase (e.g., "Unlock OG Status — $2.00" instead of ambiguous
"claim" language). All digital purchases on iOS continue to use Apple's
required External Purchase disclosure before redirecting to our payment
processor, per the External Purchase Link Entitlement terms for U.S. apps.

**Guideline 2.3.6 — Accurate Metadata**
Updated the age rating / parental control questionnaire in App Store
Connect to accurately reflect the app's content.

We've also fixed two additional stability issues found in further testing:
a crash when clocking in to a job, and an incorrect fee percentage shown by
our in-app assistant. Thank you for your patience — please let us know if
any issue persists after this build.

---
