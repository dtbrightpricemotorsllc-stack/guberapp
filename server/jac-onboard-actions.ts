/**
 * Action normalization for /api/jac/onboard responses.
 *
 * The GUBER door scene (surface: "door") can receive a special
 * { action: "show_signup" } entry that renders an in-scene signup card.
 * Rules:
 *   • Only guests, only on the door surface, at most once per guest session.
 *   • The signup action must survive the 4-item action cap — a slot is
 *     reserved for it BEFORE ordinary actions are truncated.
 *   • Other surfaces (e.g. the regular homepage chat) never receive it and
 *     never consume the once-per-session offer.
 */

export interface JacOnboardAction {
  label?: string;
  message?: string;
  action?: string;
}

export interface NormalizeOnboardActionsOpts {
  /** true when no logged-in user is attached to the request */
  isGuest: boolean;
  /** true when the request came from the GUBER door scene (surface === "door") */
  isDoorSurface: boolean;
  /** true when this guest session was already shown the signup card */
  alreadyOffered: boolean;
  /**
   * Deterministic signup moment: guest produced a full guestDraft, or the
   * model routed a guest to /signup with high confidence.
   */
  signupMoment: boolean;
}

export function normalizeOnboardActions(
  raw: unknown,
  opts: NormalizeOnboardActionsOpts
): { actions: JacOnboardAction[]; offeredSignup: boolean } {
  const list = Array.isArray(raw) ? raw : [];
  // Detect the special action BEFORE any truncation so a model reply with
  // four ordinary actions + show_signup does not silently drop the offer.
  const modelWantsSignup = list.some((a: any) => a?.action === "show_signup");
  const ordinary = list.filter((a: any) => a?.label && a?.message);

  const eligible = opts.isGuest && opts.isDoorSurface && !opts.alreadyOffered;
  const offer = eligible && (modelWantsSignup || opts.signupMoment);

  if (offer) {
    // Reserve the 4th slot for show_signup; keep at most 3 ordinary actions.
    return { actions: [...ordinary.slice(0, 3), { action: "show_signup" }], offeredSignup: true };
  }
  return { actions: ordinary.slice(0, 4), offeredSignup: false };
}
