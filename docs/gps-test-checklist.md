# GUBER GPS Stabilization — Test Checklist

Generated: 2026-06-28  
Version: GPS Sprint v1

---

## Platform Key
- 🤖 Android native AAB (installed via ADB / Play Store internal track)
- 🍎 iOS native IPA (TestFlight or direct device)
- 🌐 PWA — Chrome on Android / Samsung Browser / Safari on iOS

---

## 1. Permission Flow

| Step | 🤖 Android | 🍎 iOS | 🌐 PWA |
|------|-----------|-------|-------|
| First launch — no permissions granted | OS dialog: "Allow only while using" | OS dialog: "Allow While Using App" | Browser permission prompt |
| Tap "Allow while using" | Foreground location works | Foreground + bg-geo active | Foreground only |
| Tap "Deny" | Toast: "GUBER needs location permission. Go to Settings → Apps → GUBER..." | Same | Same |
| Accept job after denying location | On My Way: "Getting GPS…" → error toast with Settings path | Same | Same |
| Re-enable in device Settings | On My Way works after re-open | Same | Reload page |

---

## 2. On My Way Workflow

| Step | Expected | 🤖 | 🍎 | 🌐 |
|------|----------|----|----|-----|
| Tap "I'M ON MY WAY" | Safety confirmation modal opens | ☐ | ☐ | ☐ |
| Tap "I'M READY — START" | Button becomes "Getting GPS…" (spinner) | ☐ | ☐ | ☐ |
| While GPS acquiring | Button disabled, shows "Getting GPS…" for up to 15 s | ☐ | ☐ | ☐ |
| GPS fix acquired | Button changes to "Sending…" (spinner) | ☐ | ☐ | ☐ |
| Milestone sent successfully | Toast "On The Way!" — nav sheet opens | ☐ | ☐ | ☐ |
| GPS times out (indoors) | Toast: "Couldn't get your GPS fix in time. Step outside…" | ☐ | ☐ | ☐ |
| GPS permission denied | Toast: "GUBER needs location permission. Go to Settings…" | ☐ | ☐ | ☐ |
| SAFETY_CONFIRM_REQUIRED from server | Confirmation modal re-opens (NOT raw error string) | ☐ | ☐ | ☐ |

---

## 3. Arrived Workflow

| Step | Expected | 🤖 | 🍎 | 🌐 |
|------|----------|----|----|-----|
| Tap "I'VE ARRIVED" | Button shows "Getting GPS…" | ☐ | ☐ | ☐ |
| GPS fix acquired | Button changes to "Sending…" | ☐ | ☐ | ☐ |
| Milestone sent | Toast "Arrival Logged" | ☐ | ☐ | ☐ |

---

## 4. Live Tracking (GPS Active)

| Step | Expected | 🤖 | 🍎 | 🌐 |
|------|----------|----|----|-----|
| After "On My Way" — is GUBER tracking active? | Yes — watch started | ☐ | ☐ | ☐ |
| Android: persistent notification visible | "GUBER GPS Active / Tracking your location for an active job. Tap to return to GUBER." | ☐ | N/A | N/A |
| iOS: in-app banner visible | "🟢 Live GPS Tracking Active / Tracking for your active GUBER job." | N/A | ☐ | N/A |
| iOS: system location pill (top-right) | Blue location indicator visible in status bar | N/A | ☐ | N/A |
| PWA: in-app banner visible | "📍 GPS Active — keep this tab open / For full background tracking, use the GUBER app" | N/A | N/A | ☐ |
| Hirer sees worker moving on map | Position updates flowing to server | ☐ | ☐ | ☐ |

---

## 5. Background / Minimize Behavior

| Step | Expected | 🤖 | 🍎 | 🌐 |
|------|----------|----|----|-----|
| Background the app (home button) | Android notification stays; iOS system location stays | ☐ | ☐ | N/A |
| Lock the screen | Tracking continues (Android fg service / iOS bg-geo) | ☐ | ☐ | N/A |
| Re-open the app | Still shows active job, banner still visible | ☐ | ☐ | ☐ |
| Swipe away / force-quit the app | Android: tracking may stop (service may be killed by OS) | ☐ | ☐ | N/A |
| Reinstall app (Android) | Previous permission denial clears — OS prompts again | ☐ | N/A | N/A |
| PWA: switch to another tab | Tracking pauses (browser suspends watchPosition) | N/A | N/A | ☐ |
| PWA: close the tab | Tracking stops entirely | N/A | N/A | ☐ |

---

## 6. Job Completion / Tracking Stop

| Step | Expected | 🤖 | 🍎 | 🌐 |
|------|----------|----|----|-----|
| Worker submits proof | Tracking continues until poster confirms | ☐ | ☐ | ☐ |
| Poster confirms completion | `stopTask()` called → notification dismissed (Android) / banner hides (iOS/PWA) | ☐ | ☐ | ☐ |
| Server returns `{ active: false }` from batch endpoint | `stopTask()` called automatically | ☐ | ☐ | ☐ |
| After stop: no notification / banner | Confirmed dismissed | ☐ | ☐ | ☐ |

---

## 7. GPS vs Google Maps Navigation Separation

| Scenario | Expected |
|----------|----------|
| Tapping "OPEN NAVIGATION" or the Google Maps tile | Opens external Google Maps app — does NOT start/stop GUBER tracking |
| GUBER GPS tracker running | Independent of whether Google Maps is open |
| Google Maps shows blue dot | This is Maps' own location, not GUBER's tracker. Both can be active simultaneously. |
| "Location is off" toast from GUBER | Only fires from `gpsGetCurrentPosition` inside GUBER flow, not from Maps |

---

## 8. Log Lines to Verify (ADB logcat / Xcode Console)

Filter by `[GUBER` to see all structured GPS events.

```
[GUBER GPS] getCurrentPosition checkPermissions: granted
[GUBER GPS] calling getCurrentPosition…
[GUBER GPS] getCurrentPosition: lat=XX.XXXX, acc=±XXm
[GUBER GPS] on_the_way: acquiring position…
[GUBER GPS] on_the_way: fix acquired lat=XX.XXXX acc=±XXm
[GUBER GPS] arrived: acquiring position…
[GUBER GPS] arrived: fix acquired lat=XX.XXXX acc=±XXm
[GUBER GPS] iOS bg-geo: starting background watch…
[GUBER GPS] iOS bg-geo: stopping watch id=X
[GUBER TRACKING] startTask jobId=X
[GUBER TRACKING] iOS bg-geo watch started id=X jobId=X
[GUBER TRACKING] foreground watch started id=X jobId=X
[GUBER TRACKING] tracking ACTIVE jobId=X
[GUBER TRACKING] tracking STOPPED jobId=X
```

Android — filter ADB:
```bash
adb logcat | grep -E "chromium|GUBER"
```

iOS — Xcode: Window → Devices → Console → filter "GUBER"

---

## 9. Known PWA Limitations (Do Not Claim in Store Listings)

- `navigator.geolocation.watchPosition` pauses when the tab is backgrounded or the screen locks on most Android browsers.
- Samsung Internet and Chrome for Android may suspend GPS after 2–5 minutes in background.
- Safari on iOS suspends web GPS immediately when the app is backgrounded.
- PWA tracking is for foreground-only use. The in-app banner says so.
- Do NOT use PWA GPS screenshots as evidence of background GPS for App Store / Play Store review.

---

## 10. Sign-off

| Platform | Tester | Date | Pass/Fail | Notes |
|----------|--------|------|-----------|-------|
| Android AAB | | | | |
| iOS TestFlight | | | | |
| Chrome PWA (Android) | | | | |
| Samsung Browser PWA | | | | |
| Safari PWA (iOS) | | | | |
