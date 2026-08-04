#!/usr/bin/env node
/**
 * check-android-permissions.test.mjs
 *
 * Confirms that check-android-permissions.sh cannot be silently bypassed:
 *   - exits 0 when all required permissions / handlers are present
 *   - exits 1 (with the correct FAIL message) when each item is missing or
 *     hidden inside an XML / Java comment
 *
 * Run:  node scripts/check-android-permissions.test.mjs
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUARD = resolve(__dirname, "check-android-permissions.sh");

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  FAIL  ${label}`);
  if (detail) console.error(`        ${detail}`);
  failed++;
}

/**
 * Run the guard with MANIFEST / MAIN_ACTIVITY pointing at fixture files.
 * Returns { code, stdout } so assertions can check both exit code and output.
 */
async function runGuard(manifestPath, mainPath) {
  const stdoutChunks = [];
  const code = await new Promise((resolve, reject) => {
    const child = spawn("bash", [GUARD], {
      env: {
        ...process.env,
        MANIFEST: manifestPath,
        MAIN_ACTIVITY: mainPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stdoutChunks.push(c)); // merge for easy scanning
    child.on("error", reject);
    child.on("close", resolve);
  });
  return { code, stdout: Buffer.concat(stdoutChunks).toString("utf8") };
}

async function assertGuardExit(label, expectedCode, manifestPath, mainPath, mustContain) {
  const { code, stdout } = await runGuard(manifestPath, mainPath);

  if (code !== expectedCode) {
    fail(label, `expected exit ${expectedCode}, got ${code}\noutput: ${stdout.trim()}`);
    return;
  }

  if (mustContain) {
    for (const fragment of mustContain) {
      if (!stdout.includes(fragment)) {
        fail(label, `stdout did not contain: ${JSON.stringify(fragment)}\noutput: ${stdout.trim()}`);
        return;
      }
    }
  }

  pass(label);
}

// ---------------------------------------------------------------------------
// Build fixture files
// ---------------------------------------------------------------------------

const tmpDir = await mkdtemp(join(tmpdir(), "android-perm-test-"));

async function write(name, content) {
  const p = join(tmpDir, name);
  await writeFile(p, content, "utf8");
  return p;
}

// ── Good fixtures (all required items present) ─────────────────────────────

const GOOD_MANIFEST = await write("manifest_good.xml", `\
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
`);

const GOOD_MAIN = await write("MainActivity_good.java", `\
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
    @Override
    public void onPermissionRequest(final PermissionRequest request) {}
}
`);

// ── Bad fixtures — manifest ────────────────────────────────────────────────

// RECORD_AUDIO hidden in a single-line XML comment → not a real declaration
const MANIFEST_RECORD_AUDIO_COMMENTED = await write("manifest_record_audio_comment.xml", `\
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- <uses-permission android:name="android.permission.RECORD_AUDIO" /> -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
`);

// ACCESS_FINE_LOCATION entirely absent
const MANIFEST_FINE_LOC_ABSENT = await write("manifest_fine_loc_absent.xml", `\
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
`);

// ACCESS_COARSE_LOCATION entirely absent
const MANIFEST_COARSE_LOC_ABSENT = await write("manifest_coarse_loc_absent.xml", `\
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
</manifest>
`);

// RECORD_AUDIO inside a multi-line XML comment
const MANIFEST_RECORD_AUDIO_MULTILINE_COMMENT = await write("manifest_record_audio_multiline.xml", `\
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!--
        Disabled temporarily:
        <uses-permission android:name="android.permission.RECORD_AUDIO" />
    -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
`);

// ── Bad fixtures — MainActivity ────────────────────────────────────────────

// onPermissionRequest only in a // line comment
const MAIN_PERMISSION_REQUEST_LINE_COMMENT = await write("MainActivity_perm_line_comment.java", `\
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    // onPermissionRequest is handled elsewhere
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
}
`);

// onGeolocationPermissionsShowPrompt only in a // line comment
const MAIN_GEO_PROMPT_LINE_COMMENT = await write("MainActivity_geo_line_comment.java", `\
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    // public void onGeolocationPermissionsShowPrompt(String origin, ...) {}
    @Override
    public void onPermissionRequest(final PermissionRequest request) {}
}
`);

// onPermissionRequest inside a /* */ block comment (onGeolocationPermissionsShowPrompt still present)
const MAIN_PERMISSION_REQUEST_BLOCK_COMMENT = await write("MainActivity_perm_block_comment.java", `\
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    /*
     * Temporarily disabled:
     * @Override
     * public void onPermissionRequest(final PermissionRequest request) {}
     */
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
}
`);

// onGeolocationPermissionsShowPrompt inside a /* */ block comment (onPermissionRequest still present)
const MAIN_GEO_PROMPT_BLOCK_COMMENT = await write("MainActivity_geo_block_comment.java", `\
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    /*
     * Temporarily disabled:
     * @Override
     * public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
     */
    @Override
    public void onPermissionRequest(final PermissionRequest request) {}
}
`);

// onPermissionRequest inside a Javadoc /** */ comment
const MAIN_PERMISSION_REQUEST_JAVADOC = await write("MainActivity_perm_javadoc.java", `\
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    /**
     * Example: public void onPermissionRequest(final PermissionRequest request) {}
     */
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
}
`);

// ---------------------------------------------------------------------------
// Run assertions
// ---------------------------------------------------------------------------

console.log("\n── Happy-path ───────────────────────────────────────────────────");

await assertGuardExit(
  "all permissions and handlers present → exit 0",
  0,
  GOOD_MANIFEST,
  GOOD_MAIN,
);

console.log("\n── AndroidManifest.xml — missing / commented-out permissions ────");

await assertGuardExit(
  "RECORD_AUDIO only in XML single-line comment → exit 1 with FAIL message",
  1,
  MANIFEST_RECORD_AUDIO_COMMENTED,
  GOOD_MAIN,
  ["[FAIL]", "RECORD_AUDIO"],
);

await assertGuardExit(
  "RECORD_AUDIO only in XML multi-line comment → exit 1 with FAIL message",
  1,
  MANIFEST_RECORD_AUDIO_MULTILINE_COMMENT,
  GOOD_MAIN,
  ["[FAIL]", "RECORD_AUDIO"],
);

await assertGuardExit(
  "ACCESS_FINE_LOCATION absent → exit 1 with FAIL message",
  1,
  MANIFEST_FINE_LOC_ABSENT,
  GOOD_MAIN,
  ["[FAIL]", "ACCESS_FINE_LOCATION"],
);

await assertGuardExit(
  "ACCESS_COARSE_LOCATION absent → exit 1 with FAIL message",
  1,
  MANIFEST_COARSE_LOC_ABSENT,
  GOOD_MAIN,
  ["[FAIL]", "ACCESS_COARSE_LOCATION"],
);

console.log("\n── MainActivity.java — missing / commented-out handlers ──────────");

await assertGuardExit(
  "onPermissionRequest only in // line comment → exit 1 with FAIL message",
  1,
  GOOD_MANIFEST,
  MAIN_PERMISSION_REQUEST_LINE_COMMENT,
  ["[FAIL]", "onPermissionRequest"],
);

await assertGuardExit(
  "onGeolocationPermissionsShowPrompt only in // line comment → exit 1 with FAIL message",
  1,
  GOOD_MANIFEST,
  MAIN_GEO_PROMPT_LINE_COMMENT,
  ["[FAIL]", "onGeolocationPermissionsShowPrompt"],
);

await assertGuardExit(
  "onPermissionRequest only in /* */ block comment → exit 1 naming onPermissionRequest",
  1,
  GOOD_MANIFEST,
  MAIN_PERMISSION_REQUEST_BLOCK_COMMENT,
  ["[FAIL]", "onPermissionRequest"],
);

await assertGuardExit(
  "onGeolocationPermissionsShowPrompt only in /* */ block comment → exit 1 naming onGeolocationPermissionsShowPrompt",
  1,
  GOOD_MANIFEST,
  MAIN_GEO_PROMPT_BLOCK_COMMENT,
  ["[FAIL]", "onGeolocationPermissionsShowPrompt"],
);

await assertGuardExit(
  "onPermissionRequest only in Javadoc /** */ comment → exit 1 with FAIL message",
  1,
  GOOD_MANIFEST,
  MAIN_PERMISSION_REQUEST_JAVADOC,
  ["[FAIL]", "onPermissionRequest"],
);

// ---------------------------------------------------------------------------
// Cleanup & summary
// ---------------------------------------------------------------------------

await rm(tmpDir, { recursive: true, force: true });

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
