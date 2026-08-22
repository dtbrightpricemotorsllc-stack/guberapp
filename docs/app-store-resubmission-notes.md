# App Store Resubmission Notes

The canonical, paste-ready reviewer notes are in
[the App Store listing package](app-store-listing-package.md#review-notes).

Use that version for App Store Connect and Resolution Center. It reflects the
review-safe commerce mode, the current Apple age-rating questionnaire, and
the fact that listing changes must be recorded only after they are uploaded.

## Final verification status — 2026-08-22

**Do not submit this build yet.** The code and automated/browser checks are
complete, but final TestFlight verification remains blocked until the newly
uploaded build has been run on a physical iPhone and iPad. The remaining
manual cases are Apple Sign-In, proof-photo capture, Change Photo, Wallet,
disposable-QA account deletion, `guber://` deep links, and the review-safe
digital-purchase lock. Record the results and any screenshots/screen recordings
in `docs/testflight-ios-payment-smoke-test.md` before pasting the reply below.

No physical-device screenshots or screen recordings were captured from this
Linux workspace.


## Required handoff before submission

1. Install the newly uploaded TestFlight build on one physical iPhone and one
   physical iPad.
2. Complete and record TC-18 through TC-24 in
   `docs/testflight-ios-payment-smoke-test.md`, including any screenshots or
   screen recordings of a remaining reviewer-facing issue.
3. Set the checklist's final physical-device status to **APPROVED**.
4. Only then copy the canonical reviewer notes from the App Store listing
   package into App Store Connect or Resolution Center.
