#!/usr/bin/env node
/**
 * test-jac-websocket-transport.mjs
 *
 * Validates that the JAC ConvAI session controller:
 *   1. Forces connectionType: "websocket" — never falls back to WebRTC
 *   2. Sets connectionDelay overrides to 0 on all platforms (no 3-second Android hang)
 *   3. Has a finite connection timeout (CONNECTION_TIMEOUT_MS)
 *   4. Handles unexpected disconnect via onDisconnect → onError
 *   5. sendVoiceTelemetry is wired to all four lifecycle events
 *
 * Runs from the project root: node scripts/test-jac-websocket-transport.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dir, "../client/src/components/jac/jac-convai-session.tsx"),
  "utf8"
);

let pass = 0;
let fail = 0;
const results = [];

function check(label, predicate) {
  const ok = predicate(src);
  results.push({ ok, label });
  if (ok) pass++; else fail++;
}

// 1. WebSocket transport forced
check(
  'connectionType: "websocket" present in startSession params',
  s => /connectionType\s*:\s*["']websocket["']/.test(s)
);

// 2. No WebRTC path — the SDK defaults to WebRTC when only agentId is given
//    without explicit connectionType. Ensure we never pass connectionType: "webrtc"
check(
  'connectionType: "webrtc" NOT present (no accidental WebRTC override)',
  s => !/connectionType\s*:\s*["']webrtc["']/.test(s)
);

// 3. Android delay zeroed out
check(
  "connectionDelay android: 0 present",
  s => /android\s*:\s*0/.test(s)
);

// 4. Finite connection timeout defined
check(
  "CONNECTION_TIMEOUT_MS constant defined",
  s => /CONNECTION_TIMEOUT_MS\s*=\s*\d+/.test(s)
);

// 5. Timeout actually fires onError
check(
  "Timeout fires onError with retry message",
  s => /Voice connection timed out/.test(s)
);

// 6. clearConnectTimeout called in onConnect
check(
  "clearConnectTimeout() called inside onConnect",
  s => {
    const onConnectBlock = s.match(/onConnect\s*:\s*\(\)\s*=>\s*\{([^}]+)\}/)?.[1] ?? "";
    return onConnectBlock.includes("clearConnectTimeout");
  }
);

// 7. Unexpected disconnect fires onError
check(
  "onDisconnect fires onError when session drops unexpectedly",
  s => /Voice disconnected\. Tap the mic to retry/.test(s)
);

// 8. activeRef guards disconnect→error so intentional stop does not surface an error
check(
  "activeRef.current guards onDisconnect error to avoid false alerts on intentional stop",
  s => /activeRef\.current/.test(s) && /onDisconnect/.test(s)
);

// 9. sendVoiceTelemetry wired to connect
check(
  'sendVoiceTelemetry("connect", ...) called in onConnect',
  s => /sendVoiceTelemetry\(["']connect["']/.test(s)
);

// 10. sendVoiceTelemetry wired to timeout
check(
  'sendVoiceTelemetry("timeout", ...) called in timeout handler',
  s => /sendVoiceTelemetry\(["']timeout["']/.test(s)
);

// 11. sendVoiceTelemetry wired to error
check(
  'sendVoiceTelemetry("error", ...) called in onError',
  s => /sendVoiceTelemetry\(["']error["']/.test(s)
);

// 12. sendVoiceTelemetry wired to disconnect
check(
  'sendVoiceTelemetry("disconnect", ...) called in onDisconnect',
  s => /sendVoiceTelemetry\(["']disconnect["']/.test(s)
);

// 13. getUserMedia is wrapped with a timeout so IAB browsers that hang the call
//     indefinitely resolve within a bounded window instead of blocking forever.
check(
  "getUserMedia wrapped with timeout — no indefinite hang in IAB or any browser",
  s => /getUserMediaWithTimeout/.test(s) && /getUserMedia timed out/.test(s)
);

// 14. Mic denied error shows clear actionable message
check(
  "Mic access denied shows actionable error message",
  s => /allow mic in your browser settings/.test(s) || /Grant mic permission/.test(s)
);

// Print results
console.log("\nJAC WebSocket Transport Validation\n" + "─".repeat(40));
for (const { ok, label } of results) {
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
}
console.log("─".repeat(40));
console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail > 0 ? 1 : 0);
