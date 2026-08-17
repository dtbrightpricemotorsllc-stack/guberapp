/**
 * Tests for normalizeOnboardActions — the in-scene signup action rules.
 * Run: npx tsx server/jac-onboard-actions.test.ts
 */
import assert from "node:assert/strict";
import { normalizeOnboardActions } from "./jac-onboard-actions";

const base = { isGuest: true, isDoorSurface: true, alreadyOffered: false, signupMoment: false };
const four = [
  { label: "A", message: "a" },
  { label: "B", message: "b" },
  { label: "C", message: "c" },
  { label: "D", message: "d" },
];

// 1. Model returns 4 ordinary actions + show_signup → signup survives, 3 ordinary kept
{
  const { actions, offeredSignup } = normalizeOnboardActions([...four, { action: "show_signup" }], base);
  assert.equal(offeredSignup, true);
  assert.equal(actions.length, 4);
  assert.deepEqual(actions[3], { action: "show_signup" });
  assert.deepEqual(actions.slice(0, 3).map(a => a.label), ["A", "B", "C"]);
}

// 2. Deterministic signup moment (guestDraft / high-confidence /signup route) with no model action
{
  const { actions, offeredSignup } = normalizeOnboardActions(four, { ...base, signupMoment: true });
  assert.equal(offeredSignup, true);
  assert.deepEqual(actions[3], { action: "show_signup" });
}

// 3. Once per guest session: alreadyOffered suppresses even a qualifying reply
{
  const { actions, offeredSignup } = normalizeOnboardActions(
    [...four, { action: "show_signup" }],
    { ...base, alreadyOffered: true, signupMoment: true }
  );
  assert.equal(offeredSignup, false);
  assert.equal(actions.some(a => a.action === "show_signup"), false);
  assert.equal(actions.length, 4); // full 4-slot cap restored for ordinary actions
}

// 4. Non-door surface (regular homepage chat) never emits and never consumes the offer
{
  const { actions, offeredSignup } = normalizeOnboardActions(
    [...four, { action: "show_signup" }],
    { ...base, isDoorSurface: false, signupMoment: true }
  );
  assert.equal(offeredSignup, false);
  assert.equal(actions.some(a => a.action === "show_signup"), false);
}

// 5. Logged-in users never get the card
{
  const { offeredSignup } = normalizeOnboardActions(
    [{ action: "show_signup" }],
    { ...base, isGuest: false, signupMoment: true }
  );
  assert.equal(offeredSignup, false);
}

// 6. No trigger → plain 4-cap filtering, malformed entries dropped
{
  const { actions, offeredSignup } = normalizeOnboardActions(
    [...four, { label: "E", message: "e" }, { bogus: true }],
    base
  );
  assert.equal(offeredSignup, false);
  assert.equal(actions.length, 4);
}

console.log("jac-onboard-actions: all 6 tests passed");
