# GUBER App Store Listing Package

Prepared 2026-08-22 for the iOS resubmission of `com.guber.app`.

## Package status

The copy, screenshot selection, rating answers, and reviewer notes below are
prepared for App Store Connect. Before they are entered, deploy the updated
privacy policy and verify that it distinguishes foreground-only iOS location
access from Android’s limited active-job background tracking, matching each
shipping binary. The repository does not have an App Store Connect connector
or an account-level upload session, so this document does **not** claim that
Apple received the metadata or screenshots. The existing GitHub Actions
workflow uploads the signed binary only; it does not upload store listing
metadata or screenshots.

## Listing details

| Field | Final value | Limit/check |
| --- | --- | --- |
| App name | `GUBER` | 5/30 characters |
| Subtitle | `Find Work. Hire Help. Verify.` | 29/30 characters |
| Promotional text | `Find work, hire help, and build a trusted record with your local network.` | 73/170 characters |
| Keywords | `jobs,hire help,task marketplace,property inspection,photo proof,freelance,earn money,load board` | 95/100 bytes |
| Support URL | `https://guberapp.app/terms` | Public terms page includes the GUBER support email in its Contact section |
| Privacy policy URL | `https://guberapp.app/privacy` | Verified HTTP 200 on 2026-08-22 |

### Description

```text
GUBER turns local needs into visible opportunities. Find paid tasks, hire help, verify a property or item with photo proof, and connect through one real-world network.

FIND WORK
Browse nearby jobs and choose opportunities that fit your time, skills, and location. Apply to tasks, accept work, check in when needed, submit proof, and build a record of completed work.

HIRE HELP
Post a task for local help. Review responses, use in-app job details and messaging, and keep the work and payment flow organized in one place.

SEE FOR ME
Need eyes on a property, vehicle, online listing, or other item? Request independent local photo or video proof. Helpers document what they see; they do not certify, diagnose, appraise, or make the decision for you.

LOAD BOARD
Post or find vehicle, boat, RV, equipment, and freight transportation opportunities with pickup and delivery details.

MARKETPLACE
Buy, sell, rent, or offer services locally. Listings, job posts, and proof stay connected to the people creating them.

AI OR NOT?
Play a visual challenge that asks you to spot the real image. It is a quick way to test your eye and explore another part of GUBER.

JAC, YOUR IN-APP GUIDE
JAC helps you understand GUBER, find the right feature, and move from an idea to an action inside the app.

GUBER is built for adults 18 and older. Users can create profiles, listings, job posts, messages, and proof submissions. GUBER provides tools to document activity; it is not an employer, does not conduct inspections, does not background-check workers on behalf of hirers, and does not guarantee an outcome. Availability varies by location. Some features may involve payment; prices and terms are shown before purchase.
```

## Screenshot selection

### Selected set

Use the four files in `attached_assets/appstore/final/`, in this order:

| Order | File | Story | Dimensions |
| --- | --- | --- | --- |
| 1 | `01_dashboard.png` | Your Local Trust Network | 1242 × 2688 |
| 2 | `02_map.png` | Find Help. See Jobs. Live Map. | 1242 × 2688 |
| 3 | `03_verify_inspect.png` | Verify & Inspect. Proof You Can Trust. | 1242 × 2688 |
| 4 | `04_ai_or_not.png` | AI Or Not? Spot the Real Thing. | 1242 × 2688 |

These are the clean promotional compositions: each shows the GUBER product
inside a phone frame, has no third-party brand, personal contact detail, price
claim, or review-only/debug UI, and is already the correct portrait size for
the 6.5-inch iPhone screenshot slot.

The following variants are intentionally not selected:

- `attached_assets/appstore/real/` duplicates raw in-app captures that are less
  legible as listing art.
- `attached_assets/appstore/real_final/` is a separate raw-capture variant;
  its files are not the selected listing art and include permission/loading
  surfaces that are poor first impressions.
- `attached_assets/appstore/*.png` is 768 × 1408 and is not the final upload
  size.

### Device-size readiness

| App Store Connect slot | Local status | Action |
| --- | --- | --- |
| iPhone 6.5-inch | Ready | Upload the four selected `final/` files; this is the required iPhone set when a 6.9-inch set is not supplied |
| iPhone 6.9-inch | Optional | Apple accepts the 6.5-inch set as the required iPhone set when no 6.9-inch set is supplied; do not stretch artwork manually |
| iPad 13-inch | Needs native iPad capture | The Xcode target includes device family `1,2`, so capture the same four flows on iPad before final submission |

The repository contains no native iPad captures. The 6.5-inch files should
not be presented as iPad screenshots. A real iPad capture is the remaining
asset gap for a universal binary.

## Age-rating and parental-controls questionnaire

Use the closest current App Store Connect labels shown in the questionnaire.
These answers are based on the product flows and the shipping iOS permission
declarations; they are intentionally more transparent than the previous
metadata submission.

| Questionnaire area | Answer | Product evidence / explanation |
| --- | --- | --- |
| Calculated rating | Let App Store Connect calculate it from the answers below | Messaging/chat and sponsored promotions are product capabilities that must be declared |
| Age-category override | **Override to higher age rating: 18+** | The Terms and Privacy Policy restrict GUBER to adults 18 and older; Apple's current questionnaire requires an override when a product's minimum-age requirement exceeds its calculated rating |
| Made for Kids | **No** | The privacy policy says the app is for users 18+ and does not solicit minors |
| Parental controls | **No** | The product has no parent/guardian controls that monitor, manage, or restrict a child's use |
| Age assurance | **No** | A policy statement and optional identity verification are not an account-creation age gate; do not claim an age-assurance mechanism until one is actually enforced |
| User-generated content | **Yes** | Users create job posts, marketplace listings, profiles, photos, videos, and proof submissions |
| Messaging / chat | **Yes** | The product includes user-to-user communications and the JAC in-app assistant |
| Social media | **No** | GUBER distributes marketplace and job content but does not provide a social graph, reposting, commenting, or an in-app user social feed |
| Contests | **Yes — infrequent or mild** | Cash Drops are timed promotional community reward events; they are not wagering or casino games |
| Advertising | **Yes — sponsored promotions may appear** | Sponsored Cash Drop/event promotions can appear in the product; there is no claim that these are an external ad network |
| Unrestricted web access | **No** | GUBER links to specific web and payment flows; it does not provide a general-purpose browser |
| Gambling | **No** | No wagering, betting, casino play, or chance-based purchase is required |
| Simulated gambling | **No** | AI Or Not is an image-recognition challenge, not a casino or betting simulation |
| Sexual content / nudity | **None** | No product feature is intended to provide this content |
| Profanity / crude humor | **None as a product feature** | No official product flow is built around profanity or crude humor; user content remains subject to moderation and reporting |
| Cartoon / fantasy violence | **None** | No violence-based game or feature |
| Realistic violence / graphic violence | **None** | No violence-based feature |
| Horror / fear | **None** | No horror content |
| Alcohol, tobacco, or drugs | **None** | No such product feature or promotion |
| Mature / suggestive themes | **None as a product feature** | Real-world work and marketplace tasks are not presented as mature entertainment |
| Medical / treatment information | **None** | See For Me documentation is not medical advice or diagnosis |

Use App Store Connect’s **Override to Higher Age Rating** option to select
18+. Do not mark the app as child-directed or claim that parental controls or
age assurance are available. This is more accurate than trying to use an
obsolete 17+ label.

## Review notes

Paste the following into the version review notes / “What to test” field:

```text
Thank you for the detailed feedback. We've addressed every issue raised:

Guideline 5.1.1(v) — Account Deletion
In-app account deletion is available under Profile → Account Settings →
Danger Zone. It requires a two-step confirmation, then permanently
anonymizes and deletes the account.

Guideline 2.1.1(a) — App Completeness
1. Sign in with Apple now uses Apple's AuthenticationServices framework
through a first-party native plugin and the working native authentication
route.
2. All proof-photo surfaces use the native Camera plugin on iOS, with a safe
file-input fallback if the native camera is unavailable. This includes mission
proof, job bounty photos, Cash Drop proof, general proof, observation photos,
and ID verification.
3. Photo replacement was reviewed and retested; the current account-settings
flow includes a working change-photo input.
4. Wallet loading, empty, and error states are handled. A signed-in reviewer
can open Profile → Wallet to exercise the flow.

Guideline 2.5.4 — iOS Background Location
The iOS build does not request background location. The unused iOS Always
Allow permission, location background-mode declaration, legacy background
watcher, and in-app Always prompt were removed. Location is requested on iOS
only in the foreground when relevant to an active job or transportation
session. The public privacy policy distinguishes this iOS behavior from
Android’s separate, active-job background tracking.

Guideline 3.1.1 — Payments
The review-safe build defaults to earned credits only, so paid digital benefits
and external checkout are unavailable to reviewers unless the administrator
explicitly enables the commerce mode. Real-world job, marketplace, and
worker-payout flows remain available. Where a purchase is enabled, the price
and terms are shown before the user commits, and the required iOS disclosure
appears before the payment flow.

Guideline 2.3.6 — Accurate Metadata
The App Store Connect age-rating questionnaire has been reviewed against the
actual product: GUBER is intended for adults 18+, contains user-generated
profiles/listings/photos/videos, supports messaging, and includes infrequent
promotional Cash Drop events. It does not contain gambling, simulated
gambling, sexual content, violence, horror, drug/alcohol content, or
unrestricted web browsing. The app is not directed to children, does not
provide parental controls or age assurance, and is overridden to the higher
18+ age rating to honor its adult-only terms.

Please test with the supplied review account. To exercise account deletion,
open Profile → Account Settings → Danger Zone. To exercise camera capture,
open an eligible proof-photo task. To exercise Wallet, open Profile → Wallet.
On iOS, the app requests location only when a location-relevant foreground
flow starts.
```

## Final submission checklist

### Local package

- [x] Final name, subtitle, promotional text, keywords, description, support
  URL, and privacy URL are recorded above.
- [x] The clean `final/` screenshot set is selected and ordered.
- [x] Screenshot dimensions and excluded variants are recorded.
- [x] Age-rating and parental-control answers are mapped to actual product
  behavior.
- [x] Reviewer notes explain the previous rejection fixes without promising
  unsupported behavior.
- [x] Local privacy-policy copies distinguish iOS foreground-only location
  access from Android’s active-job background tracking.

### App Store Connect / physical-device work

- [ ] Upload the four selected iPhone screenshots.
- [ ] Capture and upload native iPad screenshots for the universal target.
- [ ] Enter the listing fields and questionnaire exactly as above.
- [ ] Deploy the updated privacy policy, then confirm
  `https://guberapp.app/privacy` accurately states iOS foreground-only
  location access and Android’s limited active-job background tracking.
- [ ] Confirm `https://guberapp.app/terms` and
  `https://guberapp.app/privacy` load publicly in Safari.
- [ ] Run the physical-device TestFlight checks from the readiness plan:
  Apple Sign-In, camera/photo capture, Wallet, account deletion, deep links,
  and the review-safe purchase lock.
- [ ] Confirm the newly uploaded build number in App Store Connect before
  selecting it for review.
- [ ] Submit the version for review.

### Upload evidence

No App Store Connect upload evidence is recorded in this repository as of
2026-08-22. The missing evidence is an account-level action, not a local
asset or metadata failure.

## Verification sources

- Apple, [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/):
  1242 × 2688 is an accepted 6.5-inch iPhone portrait size; 13-inch iPad
  screenshots are required when the app runs on iPad.
- Apple, [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/):
  use the current questionnaire and override to a higher rating when an app's
  terms require a higher minimum age than Apple's calculated rating.