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

// 1. A model cannot force an early signup card before a qualifying moment.
{
  const { actions, offeredSignup } = normalizeOnboardActions([...four, { action: "show_signup" }], base);
  assert.equal(offeredSignup, false);
  assert.equal(actions.length, 4);
  assert.equal(actions.some(a => a.action === "show_signup"), false);
}

// 2. Once a goal is understood and the server marks a qualifying moment,
// signup survives the cap and reserves a slot.
{
  const { actions, offeredSignup } = normalizeOnboardActions([...four, { action: "show_signup" }], { ...base, signupMoment: true });
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

// 6. A premature normal signup/login button is removed too; useful ordinary
// actions remain available.
{
  const { actions, offeredSignup } = normalizeOnboardActions(
    [{ label: "Sign up", message: "__goto_signup__" }, ...four, { label: "E", message: "e" }, { bogus: true }],
    base
  );
  assert.equal(offeredSignup, false);
  assert.equal(actions.length, 4);
  assert.equal(actions.some(a => a.message === "__goto_signup__"), false);
}

console.log("jac-onboard-actions: all 6 tests passed");
