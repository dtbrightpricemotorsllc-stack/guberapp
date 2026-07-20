#!/usr/bin/env node
/**
 * Post-cap-sync repair for iOS.
 *
 * `npx cap sync ios` rebuilds ios/App/App/capacitor.config.json from scratch,
 * reading only npm-registered Capacitor plugins. Plugins that don't expose a
 * proper SPM/Capacitor package (e.g. @aparajita/capacitor-biometric-auth, which
 * is CocoaPods-only) are silently dropped from packageClassList even though
 * their Swift source has been copied into ios/App/App/ and must be registered.
 *
 * Run this script AFTER every `cap sync ios` to re-inject the missing classes.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "../ios/App/App/capacitor.config.json");

// Classes that cap sync drops but must always be present
const REQUIRED_CLASSES = [
  "BiometricAuthNative",
  "AppleSignInPlugin",
];

const raw = readFileSync(configPath, "utf8");
const config = JSON.parse(raw);

const existing = Array.isArray(config.packageClassList) ? config.packageClassList : [];
let changed = false;

for (const cls of REQUIRED_CLASSES) {
  if (!existing.includes(cls)) {
    existing.push(cls);
    changed = true;
    console.log(`[post-cap-sync] Added missing class: ${cls}`);
  }
}

if (!changed) {
  console.log("[post-cap-sync] All required classes already present.");
} else {
  config.packageClassList = existing;
  writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8");
  console.log("[post-cap-sync] capacitor.config.json updated.");
}
