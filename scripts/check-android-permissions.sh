#!/usr/bin/env bash
# check-android-permissions.sh
#
# Guards against silently shipping an Android build that is missing the
# critical permission declarations or WebView permission handlers that caused
# the GPS / mic bugs.  Exits 1 on any failed check.
#
# Checks (designed to reject false positives from XML/Java comments):
#   1. AndroidManifest.xml — uses Python's XML parser (ElementTree) so that
#      permissions mentioned only inside <!-- ... --> comments do NOT satisfy
#      the check.  Covers both single-line and multi-line comment blocks.
#   2. MainActivity.java   — matches actual Java method-declaration lines
#      (access-modifier + return-type + methodName + "("), excluding pure
#      comment lines (leading * or //).
#
# Self-test:
#   Run with --self-test to execute built-in negative fixtures that confirm
#   each check correctly exits 1 when an item is commented out or absent.

set -euo pipefail

# Allow env-var overrides so the --self-test mode can point at fixture files.
MANIFEST="${MANIFEST:-android/app/src/main/AndroidManifest.xml}"
MAIN_ACTIVITY="${MAIN_ACTIVITY:-android/app/src/main/java/com/guber/app/MainActivity.java}"

FAIL=0

# ── Self-test mode ────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--self-test" ]]; then
  echo "=== Android permission guard — self-test ==="
  SELF_TEST_FAIL=0

  # Helper: run the guard against temporary fixtures and assert exit code.
  assert_guard_exit() {
    local desc="$1"
    local expected_exit="$2"
    local tmp_manifest="$3"
    local tmp_main="$4"

    # Temporarily point the guard at the fixture files.
    actual_exit=0
    MANIFEST="$tmp_manifest" MAIN_ACTIVITY="$tmp_main" \
      bash "$0" >/dev/null 2>&1 || actual_exit=$?

    if [ "$actual_exit" -eq "$expected_exit" ]; then
      echo "  [OK]  $desc (exit $actual_exit as expected)"
    else
      echo "  [FAIL] $desc: expected exit $expected_exit, got $actual_exit"
      SELF_TEST_FAIL=1
    fi
  }

  TMPDIR_FIXTURES=$(mktemp -d)
  trap 'rm -rf "$TMPDIR_FIXTURES"' EXIT

  GOOD_MANIFEST="$TMPDIR_FIXTURES/manifest_good.xml"
  GOOD_MAIN="$TMPDIR_FIXTURES/MainActivity_good.java"
  BAD_MANIFEST_COMMENT="$TMPDIR_FIXTURES/manifest_comment.xml"
  BAD_MANIFEST_ABSENT="$TMPDIR_FIXTURES/manifest_absent.xml"
  BAD_MAIN_COMMENT="$TMPDIR_FIXTURES/MainActivity_comment.java"

  # ── Build good fixtures ───────────────────────────────────────────────────
  cat > "$GOOD_MANIFEST" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
XML

  cat > "$GOOD_MAIN" <<'JAVA'
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
    @Override
    public void onPermissionRequest(final PermissionRequest request) {}
}
JAVA

  # ── Bad fixture: RECORD_AUDIO only in an XML comment (single-line) ─────────
  cat > "$BAD_MANIFEST_COMMENT" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- <uses-permission android:name="android.permission.RECORD_AUDIO" /> -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
XML

  # ── Bad fixture: ACCESS_FINE_LOCATION entirely absent ─────────────────────
  cat > "$BAD_MANIFEST_ABSENT" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
</manifest>
XML

  # ── Bad fixture: onPermissionRequest only in a // line comment ────────────
  cat > "$BAD_MAIN_COMMENT" <<'JAVA'
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    // onPermissionRequest is handled elsewhere
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
}
JAVA

  BAD_MAIN_BLOCK_COMMENT="$TMPDIR_FIXTURES/MainActivity_block_comment.java"

  # ── Bad fixture: both handlers inside a /* ... */ block comment ─────────────
  cat > "$BAD_MAIN_BLOCK_COMMENT" <<'JAVA'
package com.guber.app;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
public class MainActivity {
    /*
     * Temporarily disabled:
     * @Override
     * public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {}
     * @Override
     * public void onPermissionRequest(final PermissionRequest request) {}
     */
}
JAVA

  # ── Run assertions ─────────────────────────────────────────────────────────
  assert_guard_exit "good fixtures pass (exit 0)"                                      0 "$GOOD_MANIFEST"         "$GOOD_MAIN"
  assert_guard_exit "RECORD_AUDIO in XML comment fails (exit 1)"                       1 "$BAD_MANIFEST_COMMENT"  "$GOOD_MAIN"
  assert_guard_exit "ACCESS_FINE_LOCATION absent fails (exit 1)"                       1 "$BAD_MANIFEST_ABSENT"   "$GOOD_MAIN"
  assert_guard_exit "onPermissionRequest only in // comment fails (exit 1)"            1 "$GOOD_MANIFEST"         "$BAD_MAIN_COMMENT"
  assert_guard_exit "both handlers only in /* */ block comment fails (exit 1)"         1 "$GOOD_MANIFEST"         "$BAD_MAIN_BLOCK_COMMENT"

  echo ""
  if [ "$SELF_TEST_FAIL" -eq 0 ]; then
    echo "All self-tests passed."
    exit 0
  else
    echo "One or more self-tests FAILED."
    exit 1
  fi
fi

# ── Normal guard mode ─────────────────────────────────────────────────────────

echo "=== Android permission guard ==="

# ── 1. AndroidManifest.xml — XML-parser-based check ──────────────────────────
# Uses Python's ElementTree, which ignores XML comments entirely, so a permission
# that appears only inside <!-- ... --> will correctly fail this check.

check_manifest_permission() {
  local perm="$1"
  local result
  result=$(python3 - "$MANIFEST" "android.permission.${perm}" <<'PYEOF'
import sys, xml.etree.ElementTree as ET
manifest_path, target = sys.argv[1], sys.argv[2]
NS = "http://schemas.android.com/apk/res/android"
tree = ET.parse(manifest_path)
declared = {
    el.get(f"{{{NS}}}name")
    for el in tree.getroot().iter("uses-permission")
}
print("found" if target in declared else "missing")
PYEOF
)
  if [ "$result" = "found" ]; then
    echo "  [OK]  ${perm} declared in AndroidManifest.xml"
  else
    echo "  [FAIL] ${perm} is MISSING from AndroidManifest.xml (no active <uses-permission> element — XML comments do not count)"
    FAIL=1
  fi
}

echo ""
echo "Checking AndroidManifest.xml ($MANIFEST) ..."
check_manifest_permission "RECORD_AUDIO"
check_manifest_permission "ACCESS_FINE_LOCATION"
check_manifest_permission "ACCESS_COARSE_LOCATION"

# ── 2. MainActivity.java — comment-stripped method-declaration check ──────────
# Uses Python to strip ALL Java comment forms (// line comments and /* */
# block/Javadoc comments) before searching for the method declaration.  This
# prevents a method name that appears only inside a comment from satisfying
# the check — including the common case of block-commenting out an override.

check_main_activity_method() {
  local method="$1"
  local result
  result=$(python3 - "$MAIN_ACTIVITY" "$method" <<'PYEOF'
import sys, re

java_path, method = sys.argv[1], sys.argv[2]
with open(java_path, "r", encoding="utf-8") as f:
    source = f.read()

# Strip block comments (/* ... */) including Javadoc (/** ... */).
# DOTALL so the pattern spans newlines.
source = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)

# Strip line comments (// ...).
source = re.sub(r"//[^\n]*", "", source)

# Match an actual method declaration:
#   optional-access-modifier  return-type  methodName(
# This is a simplified but sufficient heuristic for our known method names.
pattern = re.compile(
    r"\b(?:public|protected|private)?\s*(?:static\s+)?\S+\s+" + re.escape(method) + r"\s*\("
)
print("found" if pattern.search(source) else "missing")
PYEOF
)
  if [ "$result" = "found" ]; then
    echo "  [OK]  ${method}() override present in MainActivity.java"
  else
    echo "  [FAIL] ${method}() override is MISSING from MainActivity.java (comment-only references do not count)"
    FAIL=1
  fi
}

echo ""
echo "Checking MainActivity.java ($MAIN_ACTIVITY) ..."
check_main_activity_method "onGeolocationPermissionsShowPrompt"
check_main_activity_method "onPermissionRequest"

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All Android permission checks passed."
  exit 0
else
  echo "One or more Android permission checks FAILED. Fix the issues above before shipping."
  exit 1
fi
