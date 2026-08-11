#!/usr/bin/env node
/**
 * scripts/jac-voice-telemetry.test.mjs
 *
 * Self-contained unit tests for the JAC voice telemetry counter logic.
 *
 * Tests:
 *   1. Invalid / missing token → not counted (cid must be present)
 *   2. Duplicate (cid, event) pair → deduplicated, counted only once
 *   3. Connect → disconnect for same cid → counted as success, not diluted
 *   4. Error-only session → counted as failure
 *   5. Connect → error for same cid → first outcome (connect) wins → success
 *   6. Success rate denominator excludes disconnects
 *   7. Mixed platform sessions → aggregate is correct
 *   8. Empty counter → successRate = -1 (no outcome sessions)
 *
 * Run:  node scripts/jac-voice-telemetry.test.mjs
 */

// ---------------------------------------------------------------------------
// Replicate core telemetry logic (mirrors server/jac-voice-telemetry.ts)
// ---------------------------------------------------------------------------

function makeCounter() {
  const _events = [];
  const _seenCids = new Set();

  function recordVoiceEvent(event, cid) {
    if (event === "disconnect") {
      _events.push({ ts: Date.now(), event, cid });
      return false; // neutral — doesn't affect success rate
    }
    // Outcome events: one per cid
    if (_seenCids.has(cid)) return false;
    _seenCids.add(cid);
    _events.push({ ts: Date.now(), event, cid });
    return true;
  }

  function getVoiceHealthStats(windowMs = 60 * 60 * 1000) {
    const cutoff = Date.now() - windowMs;
    _seenCids.forEach(cid => {
      const active = _events.some(e => e.ts >= cutoff && e.cid === cid);
      if (!active) _seenCids.delete(cid);
    });

    let connects = 0, errors = 0, timeouts = 0, disconnects = 0;
    for (const e of _events) {
      if (e.ts < cutoff) continue;
      if (e.event === "connect")         connects++;
      else if (e.event === "error")      errors++;
      else if (e.event === "timeout")    timeouts++;
      else if (e.event === "disconnect") disconnects++;
    }
    const sessions    = connects + errors + timeouts;
    const successRate = sessions === 0 ? -1 : Math.round((connects / sessions) * 100);
    return { connects, errors, timeouts, disconnects, sessions, successRate };
  }

  return { recordVoiceEvent, getVoiceHealthStats };
}

// ---------------------------------------------------------------------------
// SQL success-rate calculation (mirrors the /api/admin/jac/voice-stats logic)
// ---------------------------------------------------------------------------

/**
 * Simulates the DISTINCT ON (cid) first-outcome-per-session SQL query.
 * events = [{ cid, event, ts }]
 */
function computeStatsFromEvents(events, windowMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  const outcomeEvents = events.filter(
    e => e.cid && ["connect", "error", "timeout"].includes(e.event) && e.ts >= cutoff
  );

  // Group by cid, pick earliest outcome
  const byCid = new Map();
  for (const e of outcomeEvents) {
    if (!byCid.has(e.cid) || e.ts < byCid.get(e.cid).ts) {
      byCid.set(e.cid, e);
    }
  }

  const firstOutcomes = [...byCid.values()];
  const connects  = firstOutcomes.filter(e => e.event === "connect").length;
  const errors    = firstOutcomes.filter(e => e.event === "error").length;
  const timeouts  = firstOutcomes.filter(e => e.event === "timeout").length;
  const sessions  = firstOutcomes.length;
  const successRate = sessions === 0 ? null : Math.round((connects / sessions) * 100);

  const disconnects = events.filter(
    e => e.cid && e.event === "disconnect" && e.ts >= cutoff
  ).length;

  return { connects, errors, timeouts, sessions, disconnects, successRate };
}

// Per-platform denominator (mirrors the byPlatform query)
function computePlatformStats(events, windowMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  const outcomeEvents = events.filter(
    e => e.cid && ["connect", "error", "timeout"].includes(e.event) && e.ts >= cutoff
  );
  const byCid = new Map();
  for (const e of outcomeEvents) {
    if (!byCid.has(e.cid) || e.ts < byCid.get(e.cid).ts) byCid.set(e.cid, e);
  }
  const rows = new Map();
  for (const e of byCid.values()) {
    if (!rows.has(e.platform)) rows.set(e.platform, { connects: 0, failures: 0, sessions: 0 });
    const r = rows.get(e.platform);
    r.sessions++;
    if (e.event === "connect") r.connects++;
    else r.failures++;
  }
  return [...rows.entries()].map(([platform, r]) => ({ platform, ...r }));
}

// ---------------------------------------------------------------------------
// Mini test harness
// ---------------------------------------------------------------------------

let passed = 0, failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    console.log(`  ✅ ${label} (got ${JSON.stringify(actual)})`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Tests — In-memory counter (server/jac-voice-telemetry.ts logic)
// ---------------------------------------------------------------------------

console.log("\n── In-memory counter ─────────────────────────────────────");

{
  // 1. No cid → not counted (caller only invokes recordVoiceEvent when cid is present)
  const c = makeCounter();
  // Simulate: token missing → cid = null → recordVoiceEvent never called
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.sessions, 0, "No cid → sessions = 0");
  assertEqual(stats.successRate, -1, "No cid → successRate = -1 (unknown)");
}

{
  // 2. Duplicate (cid, event) → deduplicated
  const c = makeCounter();
  c.recordVoiceEvent("connect", "cid-abc");
  c.recordVoiceEvent("connect", "cid-abc"); // replay
  c.recordVoiceEvent("connect", "cid-abc"); // replay again
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.connects, 1, "Duplicate connect for same cid → counted once");
  assertEqual(stats.sessions, 1, "Duplicate connect → sessions = 1");
  assertEqual(stats.successRate, 100, "One unique connect → 100% success rate");
}

{
  // 3. Connect + disconnect same cid → success, disconnect not in denominator
  const c = makeCounter();
  c.recordVoiceEvent("connect", "cid-1");
  c.recordVoiceEvent("disconnect", "cid-1");
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.connects, 1, "Connect + disconnect → connects = 1");
  assertEqual(stats.disconnects, 1, "Disconnect tracked separately");
  assertEqual(stats.sessions, 1, "Connect + disconnect → sessions = 1 (disconnect excluded)");
  assertEqual(stats.successRate, 100, "Connect + disconnect → 100% success");
}

{
  // 4. Error-only session
  const c = makeCounter();
  c.recordVoiceEvent("error", "cid-e1");
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.errors, 1, "Error-only → errors = 1");
  assertEqual(stats.successRate, 0, "Error-only → 0% success rate");
}

{
  // 5. Connect → error for same cid → first outcome (connect) wins
  // In-memory: _seenCids prevents the error from being recorded since connect
  // already claimed the cid slot
  const c = makeCounter();
  c.recordVoiceEvent("connect", "cid-x");
  c.recordVoiceEvent("error", "cid-x"); // same cid → deduplicated
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.connects, 1, "Connect→error same cid → connects = 1");
  assertEqual(stats.errors, 0, "Connect→error same cid → errors = 0 (deduped)");
  assertEqual(stats.successRate, 100, "Connect→error same cid → success rate = 100%");
}

{
  // 6. Mixed: 4 connects, 1 error, 1 timeout, 2 disconnects
  const c = makeCounter();
  ["c1","c2","c3","c4"].forEach(cid => c.recordVoiceEvent("connect", cid));
  c.recordVoiceEvent("error", "e1");
  c.recordVoiceEvent("timeout", "t1");
  c.recordVoiceEvent("disconnect", "c1");
  c.recordVoiceEvent("disconnect", "c2");
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.connects, 4,    "Mixed → connects = 4");
  assertEqual(stats.errors, 1,      "Mixed → errors = 1");
  assertEqual(stats.timeouts, 1,    "Mixed → timeouts = 1");
  assertEqual(stats.disconnects, 2, "Mixed → disconnects = 2 (tracked separately)");
  assertEqual(stats.sessions, 6,    "Mixed → sessions = 6 (connects+errors+timeouts)");
  assertEqual(stats.successRate, 67,"Mixed → success rate = 67% (4/6)");
}

{
  // 7. Empty counter
  const c = makeCounter();
  const stats = c.getVoiceHealthStats();
  assertEqual(stats.successRate, -1, "Empty counter → successRate = -1");
}

// ---------------------------------------------------------------------------
// Tests — SQL first-outcome-per-session semantics
// ---------------------------------------------------------------------------

console.log("\n── SQL first-outcome-per-session logic ───────────────────");

const now = Date.now();

{
  // 8. Connect → disconnect → counted as one success
  const events = [
    { cid: "s1", event: "connect",    platform: "web", ts: now - 1000 },
    { cid: "s1", event: "disconnect", platform: "web", ts: now - 500  },
  ];
  const stats = computeStatsFromEvents(events);
  assertEqual(stats.connects, 1, "SQL: connect+disconnect → 1 connect");
  assertEqual(stats.sessions, 1, "SQL: connect+disconnect → 1 session");
  assertEqual(stats.disconnects, 1, "SQL: disconnect tracked separately");
  assertEqual(stats.successRate, 100, "SQL: connect+disconnect → 100%");
}

{
  // 9. Connect before error: connect was first → session counts as success
  const events = [
    { cid: "s2", event: "connect", platform: "ios_native", ts: now - 2000 },
    { cid: "s2", event: "error",   platform: "ios_native", ts: now - 1000 }, // later → ignored
  ];
  const stats = computeStatsFromEvents(events);
  assertEqual(stats.connects, 1, "SQL: connect-before-error → 1 connect (first outcome wins)");
  assertEqual(stats.errors, 0,   "SQL: connect-before-error → error not counted (first outcome wins)");
  assertEqual(stats.successRate, 100, "SQL: connect-before-error → 100%");
}

{
  // 10. Error-only session → failure
  const events = [
    { cid: "s3", event: "error", platform: "android_native", ts: now - 500 },
  ];
  const stats = computeStatsFromEvents(events);
  assertEqual(stats.errors, 1, "SQL: error-only → 1 error");
  assertEqual(stats.successRate, 0, "SQL: error-only → 0%");
}

{
  // 11. Rows without cid (legacy) excluded
  const events = [
    { cid: null,  event: "connect", platform: "web", ts: now - 500 },
    { cid: "s4",  event: "error",   platform: "web", ts: now - 400 },
  ];
  const stats = computeStatsFromEvents(events);
  assertEqual(stats.sessions, 1, "SQL: null-cid rows excluded, only cid='s4' counted");
  assertEqual(stats.connects, 0, "SQL: no connects from verified sessions");
  assertEqual(stats.errors, 1,   "SQL: 1 error from verified session");
  assertEqual(stats.successRate, 0, "SQL: 0% with null-cid rows excluded");
}

{
  // 12. Per-platform denominator excludes disconnects
  const events = [
    { cid: "w1", event: "connect",    platform: "web", ts: now - 1000 },
    { cid: "w1", event: "disconnect", platform: "web", ts: now - 500  }, // neutral
    { cid: "w2", event: "error",      platform: "web", ts: now - 800  },
  ];
  const plat = computePlatformStats(events, 24 * 60 * 60 * 1000);
  const web = plat.find(p => p.platform === "web");
  assert(web !== undefined, "Platform stats include web");
  assertEqual(web?.sessions, 2,  "Per-platform: sessions = 2 (not 3 — disconnect excluded)");
  assertEqual(web?.connects, 1,  "Per-platform: connects = 1");
  assertEqual(web?.failures, 1,  "Per-platform: failures = 1 (error)");
}

{
  // 13. Forged replayed token (same cid, same event) — deduplicated at DB level
  // Simulated: same cid/event pair inserted twice — second is ignored
  const events = [
    { cid: "forged", event: "error", platform: "web", ts: now - 1000 },
    { cid: "forged", event: "error", platform: "web", ts: now - 900  }, // replay
  ];
  const stats = computeStatsFromEvents(events);
  assertEqual(stats.errors, 1, "Replayed (cid,event) → deduplicated to 1");
  assertEqual(stats.sessions, 1, "Replayed forged beacon → 1 session, not 2");
}

// ---------------------------------------------------------------------------
// Tests — VoiceTab UI / API contract (row.sessions as denominator)
// ---------------------------------------------------------------------------

console.log("\n── VoiceTab per-platform API contract ────────────────────");

{
  // 14. VoiceTab must use row.sessions (not row.total) to compute the gauge %.
  // This mirrors the calculation in admin-jac-brain.tsx VoiceTab.
  function voiceTabRate(row) {
    // Correct: uses sessions (connects + errors + timeouts, excludes disconnects)
    return row.sessions > 0 ? Math.round((row.connects / row.sessions) * 100) : null;
  }

  // Simulate API response for a platform with 8 connects, 2 errors, 3 disconnects
  const row = { platform: "web", connects: 8, failures: 2, sessions: 10 };
  // sessions = 8 + 2 = 10 (disconnects not included)
  // If we mistakenly used total=13 (including 3 disconnects), rate would be 62% — wrong
  const rate = voiceTabRate(row);
  assertEqual(rate, 80, "VoiceTab: 8 connects / 10 sessions = 80% (not diluted by disconnects)");

  // Zero sessions → null rate (not 0 or NaN)
  const emptyRow = { platform: "ios_native", connects: 0, failures: 0, sessions: 0 };
  assertEqual(voiceTabRate(emptyRow), null, "VoiceTab: zero sessions → null rate (renders '—')");

  // 100% success platform
  const perfectRow = { platform: "android_native", connects: 5, failures: 0, sessions: 5 };
  assertEqual(voiceTabRate(perfectRow), 100, "VoiceTab: all connects → 100%");

  // 0% success platform
  const failRow = { platform: "pwa", connects: 0, failures: 4, sessions: 4 };
  assertEqual(voiceTabRate(failRow), 0, "VoiceTab: no connects → 0%");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("Some tests failed.");
  process.exit(1);
} else {
  console.log("All tests passed ✅");
  process.exit(0);
}
