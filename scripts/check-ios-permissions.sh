#!/usr/bin/env bash
# check-ios-permissions.sh
#
# Guards against silently shipping an iOS build that is missing the critical
# permission declarations or WKUIDelegate handlers that caused the GPS / mic
# bugs.  Exits 1 on any failed check.
#
# Checks (designed to reject false positives from XML/Swift comments):
#   1. Info.plist — uses Python's plistlib parser so that keys mentioned only
#      inside <!-- ... --> XML comments do NOT satisfy the check.
#   2. AppDelegate.swift / ViewController.swift — strips Swift line comments
#      (//) and block comments (/* */) before searching for the method
#      declaration, so a method name that only appears in a comment does NOT
#      satisfy the check.
#
# Self-test:
#   Run with --self-test to execute built-in negative fixtures that confirm
#   each check correctly exits 1 when an item is commented out or absent.

set -euo pipefail

# Allow env-var overrides so the --self-test mode can point at fixture files.
INFO_PLIST="${INFO_PLIST:-ios/App/App/Info.plist}"
# The WKUIDelegate handler may live in either AppDelegate.swift or
# ViewController.swift; search both by default.
SWIFT_FILES="${SWIFT_FILES:-ios/App/App/AppDelegate.swift ios/App/App/ViewController.swift}"

FAIL=0

# ── Self-test mode ────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--self-test" ]]; then
  echo "=== iOS permission guard — self-test ==="
  SELF_TEST_FAIL=0

  assert_guard_exit() {
    local desc="$1"
    local expected_exit="$2"
    local tmp_plist="$3"
    local tmp_swift="$4"

    actual_exit=0
    INFO_PLIST="$tmp_plist" SWIFT_FILES="$tmp_swift" \
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

  GOOD_PLIST="$TMPDIR_FIXTURES/Info_good.plist"
  GOOD_SWIFT="$TMPDIR_FIXTURES/ViewController_good.swift"
  BAD_PLIST_COMMENT="$TMPDIR_FIXTURES/Info_comment.plist"
  BAD_PLIST_ABSENT="$TMPDIR_FIXTURES/Info_absent.plist"
  BAD_SWIFT_LINE_COMMENT="$TMPDIR_FIXTURES/ViewController_line_comment.swift"
  BAD_SWIFT_BLOCK_COMMENT="$TMPDIR_FIXTURES/ViewController_block_comment.swift"
  BAD_SWIFT_NON_HANDLER="$TMPDIR_FIXTURES/ViewController_non_handler.swift"

  # ── Good fixtures ─────────────────────────────────────────────────────────
  cat > "$GOOD_PLIST" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSMicrophoneUsageDescription</key>
    <string>We use the microphone for audio recording.</string>
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>We use location to match you with nearby jobs.</string>
</dict>
</plist>
XML

  cat > "$GOOD_SWIFT" <<'SWIFT'
import UIKit
import WebKit
import Capacitor
class ViewController: CAPBridgeViewController, WKUIDelegate {
    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }
}
SWIFT

  # ── Bad fixture: NSMicrophoneUsageDescription only in an XML comment ───────
  cat > "$BAD_PLIST_COMMENT" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- <key>NSMicrophoneUsageDescription</key>
    <string>We use the microphone for audio recording.</string> -->
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>We use location to match you with nearby jobs.</string>
</dict>
</plist>
XML

  # ── Bad fixture: NSLocationWhenInUseUsageDescription entirely absent ───────
  cat > "$BAD_PLIST_ABSENT" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSMicrophoneUsageDescription</key>
    <string>We use the microphone for audio recording.</string>
</dict>
</plist>
XML

  # ── Bad fixture: handler only in a // line comment ────────────────────────
  cat > "$BAD_SWIFT_LINE_COMMENT" <<'SWIFT'
import UIKit
import WebKit
import Capacitor
class ViewController: CAPBridgeViewController, WKUIDelegate {
    // func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, ...) {}
}
SWIFT

  # ── Bad fixture: handler inside a /* ... */ block comment ─────────────────
  cat > "$BAD_SWIFT_BLOCK_COMMENT" <<'SWIFT'
import UIKit
import WebKit
import Capacitor
class ViewController: CAPBridgeViewController, WKUIDelegate {
    /*
     * Temporarily disabled:
     * func webView(_ webView: WKWebView,
     *     requestMediaCapturePermissionFor origin: WKSecurityOrigin,
     *     ...) {}
     */
}
SWIFT

  # ── Bad fixture: identifier appears as a string literal inside an unrelated
  #    func webView override — must NOT satisfy the guard even though both
  #    "func webView" and the identifier appear in live (non-comment) code
  cat > "$BAD_SWIFT_NON_HANDLER" <<'SWIFT'
import UIKit
import WebKit
import Capacitor
class ViewController: CAPBridgeViewController, WKNavigationDelegate {
    // A navigation-delegate override that happens to log the permission label
    func webView(_ webView: WKWebView, didStartProvisionalNavigation nav: WKNavigation!) {
        let tag = "requestMediaCapturePermissionFor"
        print(tag)
    }
}
SWIFT

  # ── Run assertions ─────────────────────────────────────────────────────────
  assert_guard_exit "good fixtures pass (exit 0)"                                               0 "$GOOD_PLIST"        "$GOOD_SWIFT"
  assert_guard_exit "NSMicrophoneUsageDescription in XML comment fails (exit 1)"                1 "$BAD_PLIST_COMMENT" "$GOOD_SWIFT"
  assert_guard_exit "NSLocationWhenInUseUsageDescription absent fails (exit 1)"                 1 "$BAD_PLIST_ABSENT"  "$GOOD_SWIFT"
  assert_guard_exit "requestMediaCapturePermissionFor only in // comment fails (exit 1)"        1 "$GOOD_PLIST"        "$BAD_SWIFT_LINE_COMMENT"
  assert_guard_exit "requestMediaCapturePermissionFor only in /* */ comment fails (exit 1)"     1 "$GOOD_PLIST"        "$BAD_SWIFT_BLOCK_COMMENT"
  assert_guard_exit "requestMediaCapturePermissionFor as non-handler identifier fails (exit 1)" 1 "$GOOD_PLIST"        "$BAD_SWIFT_NON_HANDLER"

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

echo "=== iOS permission guard ==="

# ── 1. Info.plist — plistlib-based check ─────────────────────────────────────
# Uses Python's plistlib, which parses the binary/XML property list and
# ignores XML comments entirely, so a key mentioned only inside <!-- ... -->
# will correctly fail this check.

check_plist_key() {
  local key="$1"
  local result
  result=$(python3 - "$INFO_PLIST" "$key" <<'PYEOF'
import sys, plistlib
plist_path, target_key = sys.argv[1], sys.argv[2]
with open(plist_path, "rb") as f:
    data = plistlib.load(f)
print("found" if target_key in data else "missing")
PYEOF
)
  if [ "$result" = "found" ]; then
    echo "  [OK]  ${key} present in Info.plist"
  else
    echo "  [FAIL] ${key} is MISSING from Info.plist (XML comments do not count)"
    FAIL=1
  fi
}

echo ""
echo "Checking Info.plist ($INFO_PLIST) ..."
check_plist_key "NSMicrophoneUsageDescription"
check_plist_key "NSLocationWhenInUseUsageDescription"

# ── 2. Swift sources — comment-stripped method-declaration check ──────────────
# Uses Python to strip ALL Swift comment forms (// line comments and /* */
# block comments) before searching for the method declaration.  This prevents a
# method name that appears only inside a comment from satisfying the check.
# Searches across all files listed in SWIFT_FILES; the check passes if any one
# of them contains the live (non-commented) declaration.

check_swift_method() {
  local method="$1"
  local found=0

  for swift_file in $SWIFT_FILES; do
    if [ ! -f "$swift_file" ]; then
      continue
    fi
    result=$(python3 - "$swift_file" "$method" <<'PYEOF'
import sys, re

swift_path, method = sys.argv[1], sys.argv[2]
with open(swift_path, "r", encoding="utf-8") as f:
    source = f.read()

# Strip block comments (/* ... */) including doc comments (/** ... */).
source = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)

# Strip line comments (// ...).
source = re.sub(r"//[^\n]*", "", source)

# requestMediaCapturePermissionFor is a *parameter label* in the WKUIDelegate
# method (func webView(_:requestMediaCapturePermissionFor:...)), not the
# function name itself.
#
# Two hazards prevented here:
#   1. Comment-only references — handled by stripping comments above.
#   2. String-literal references — e.g. a *different* func webView override
#      that stores the label as a log tag: `let tag = "requestMediaCapture…"`.
#      Strip all Swift string literals (including escape sequences) before
#      searching so the label inside quotes cannot satisfy the check.
#
# After stripping, require "func webView" and the label to co-appear within
# 800 chars (DOTALL), which matches the multi-line parameter-label form of
# the real WKUIDelegate override while rejecting unrelated webView methods.
source = re.sub(r'"(?:[^"\\]|\\.)*"', '""', source)

pattern = re.compile(
    r"\bfunc\s+webView\b.{0,800}\b" + re.escape(method) + r"\b",
    re.DOTALL,
)
print("found" if pattern.search(source) else "missing")
PYEOF
)
    if [ "$result" = "found" ]; then
      found=1
      echo "  [OK]  ${method}() present in ${swift_file}"
      break
    fi
  done

  if [ "$found" -eq 0 ]; then
    echo "  [FAIL] ${method}() is MISSING from all checked Swift files: ${SWIFT_FILES}"
    echo "         (comment-only references do not count)"
    FAIL=1
  fi
}

echo ""
echo "Checking Swift sources ($SWIFT_FILES) ..."
check_swift_method "requestMediaCapturePermissionFor"

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "All iOS permission checks passed."
  exit 0
else
  echo "One or more iOS permission checks FAILED. Fix the issues above before shipping."
  exit 1
fi
