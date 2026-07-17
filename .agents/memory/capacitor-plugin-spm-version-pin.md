---
name: Capacitor SPM plugin major-version mismatches break iOS CI builds
description: Mixing a Capacitor core major version with a newer major-version plugin causes a silent-until-CI SPM dependency resolution failure.
---

`ios/App/CapApp-SPM/Package.swift` pins an exact `capacitor-swift-pm` version
matching `@capacitor/core`'s major version (e.g. `exact: "7.6.4"`). Every
first-party `@capacitor/*` plugin's own `Package.swift` declares its own
`capacitor-swift-pm` requirement (`from: "7.0.0"` for 7.x plugins, `from:
"8.0.0"` for 8.x plugins). If any single plugin in `package.json` is on a
newer major (e.g. `@capacitor/camera@^8.2.0` or `@capacitor/status-bar@^8.0.2`
while core and everything else is 7.x), SPM dependency resolution fails during
the "Resolve Swift Package Manager dependencies" GitHub Actions step with an
unsatisfiable version range — `npm install` / local dev / TypeScript all stay
green, so this is invisible until an actual iOS CI build runs.

**Why:** npm allows independent major versions per package with no
cross-plugin consistency check; only Xcode's SPM resolver enforces that all
`capacitor-swift-pm` version requirements across every Capacitor plugin must
overlap.

**How to apply:** Before triggering an iOS build, check every
`node_modules/@capacitor/*/Package.swift` (and any Capacitor community
plugins) for its `capacitor-swift-pm` version requirement and confirm they're
all compatible with the exact version pinned in
`ios/App/CapApp-SPM/Package.swift`. If a plugin was bumped to a new major
without bumping `@capacitor/core` and the rest of the stack, downgrade that
plugin to the latest release on the *same* major as core (check `npm view
<pkg> versions`) rather than attempting a full-stack major upgrade under
time pressure. After changing any Capacitor plugin version, run `npx cap sync
ios` to regenerate `Package.swift`, and re-run `npm install` — this
regenerates `package-lock.json` and can reintroduce Replit's local firewall
registry URLs (`package-firewall.replit.local`) in place of
`registry.npmjs.org`, which will fail on external CI runners with
`ENOTFOUND`; re-sanitize the lockfile before pushing.
