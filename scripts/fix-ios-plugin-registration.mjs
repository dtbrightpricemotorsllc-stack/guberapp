#!/usr/bin/env node
// Re-injects locally-defined (non-npm) native iOS plugin classes into
// ios/App/App/capacitor.config.json's `packageClassList`.
//
// WHY THIS SCRIPT EXISTS:
// `npx cap sync ios` regenerates `packageClassList` by scanning the .swift/.m
// files of *installed npm* Capacitor plugins only (see
// @capacitor/cli/dist/util/iosplugin.js: getPluginFiles/generateIOSPackageJSON).
// It never scans this app target's own source directory
// (ios/App/App/*.swift). Any plugin implemented directly in that directory
// (not published as an npm package) is silently dropped from
// packageClassList on every `cap sync`, with no build error — the plugin
// just stops being registered at runtime (bridge.plugin(withName:) hits
// nothing, JS-side `registerPlugin()` calls reject silently).
//
// `registerPluginType()` in CapacitorBridge.swift is NOT a workaround: it is
// a no-op whenever `autoRegisterPlugins` is true (the default), which it is
// in this project. So the ONLY supported way to keep a local plugin
// registered is to keep its class name present in packageClassList.
//
// USAGE: run this immediately after every `npx cap sync ios`:
//   npx cap sync ios && node scripts/fix-ios-plugin-registration.mjs

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const CONFIG_PATH = resolve("ios/App/App/capacitor.config.json");

// Add new locally-defined native plugin classes here as they're created.
const LOCAL_PLUGIN_CLASSES = ["AppleSignInPlugin"];

function main() {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw);

  if (!Array.isArray(config.packageClassList)) {
    config.packageClassList = [];
  }

  let added = [];
  for (const cls of LOCAL_PLUGIN_CLASSES) {
    if (!config.packageClassList.includes(cls)) {
      config.packageClassList.push(cls);
      added.push(cls);
    }
  }

  if (added.length === 0) {
    console.log(
      "[fix-ios-plugin-registration] All local plugin classes already present. No changes needed.",
    );
    return;
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, "\t") + "\n");
  console.log(
    `[fix-ios-plugin-registration] Re-added missing local plugin class(es) to packageClassList: ${added.join(", ")}`,
  );
}

main();
