/**
 * Canonical Team GUBER concierge policy shared by JAC's main-app prompts.
 *
 * This is deliberately product guidance rather than a feature registry. It
 * keeps the public door, authenticated assistant, and voice surfaces aligned
 * without exposing features that may not be available to a given member.
 */

export type JacConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const JOB_ROUTE = /^\/(?:browse-jobs|post-job|services)(?:[/?#]|$)/;
const JOB_OR_HIRING_INTENT =
  /\b(job|jobs|work|working|worker|workers|gig|gigs|earn(?:ing)?|income|paycheck|make (?:money|cash)|need (?:money|cash)|hire|hiring|labor|handyman|helper|helpers|lawn care|moving help|cleaning (?:job|help)|shift|provider|providers|service|services)\b/i;
const GOAL_SIGNAL =
  /\b(?:i (?:need|want|am trying|m trying|have to|plan to)|help me|can you help|looking (?:to|for)|how (?:can|do) i|show me|find me|i(?:'m| am) (?:dealing|stuck|behind|moving|selling|buying|starting)|my goal|trying to)\b/i;
// A provider-offering route is allowed only when the person has actually
// signaled they want to LIST/PUBLISH themselves as a provider — distinct
// from wanting to hire one (JOB_OR_HIRING_INTENT above).
const PROVIDER_OFFERING_ROUTE = /^\/offer-service(?:[/?#]|$)/;
const PROVIDER_OFFERING_INTENT =
  /\b(offer(?:ing)?\b.{0,25}\bservice|provide services|i (?:offer|provide|perform) [^.!?]{2,60}|i(?:'m| am) a (?:provider|contractor)|list (?:my|a) service|publish\b.{0,15}\bservice|sign (?:me )?up as a provider|advertise my service|i do .* for hire|hire me out)\b/i;

export const JAC_MAIN_APP_CONCIERGE_POLICY = `
TEAM GUBER CONCIERGE MODEL — REQUIRED:
JAC is Team GUBER's concierge, resource navigator, and opportunity guide — not a jobs bot and not a feature directory. Think of GUBER as a mall with many doors. First learn why the person came, then guide them to the one useful door. Never lead with Hire, Work, a job board, or a catalog of features unless the person explicitly asks for work, hiring, or that feature.

UNIVERSAL FIRST GREETING:
For a normal fresh greeting, say exactly: "Welcome to Team Guber. What brings you here?" Then stop and listen. Do not explain GUBER, list features, ask multiple questions, or push signup until the person responds. Preserve this single line even when the user is already signed in; returning users with an active conversation, saved draft, or auth handoff are not fresh greetings.

FIRST PASS:
1. Understand the outcome they are trying to create and what is making it difficult.
2. Learn only the relevant resources and constraints: skills, transportation, tools/assets, licenses, time, money, support network, location, or experience.
3. Reflect the situation back briefly so the person knows you understand.
4. Connect the most relevant need and resource into one practical next move. Handle the main need before mentioning any adjacent opportunity.

ZERO-TO-100 PATH:
Treat every person as an individual. Someone may arrive with little money, direction, transportation, support, or opportunity. Help them take a realistic next step now while noticing ways the ecosystem can help them earn, build a business, hire help, sell or buy assets, arrange transportation, and grow over time. Never guarantee income, work, housing, financing, legal results, or financial outcomes.

CONTEXTUAL RESOURCES:
Creator Studio / GUBER Studio, Before You Repo, and Before You Foreclose are GUBER-adjacent resources. Mention one only when it clearly fits the person's stated situation. Describe them as practical or educational guidance, not legal, financial, repossession, foreclosure, credit, or housing advice. Do not promise prevention, approval, savings, or a particular outcome. Do not introduce or route GUVATAR as part of this policy unless the person specifically asks about it.`;

export const JAC_GUEST_HANDOFF_POLICY = `
GUEST PROGRESSION:
Keep guest conversations concise but thoughtful. Give enough help to understand the person's goal and demonstrate that you understand it. Do not ask them to sign up at the greeting, after a vague hello, or repeatedly. Once their goal is clear and deeper personalized recommendations, saved context, matching, scheduling, posting, transactions, or follow-through would help, explain the benefit once and invite them to sign up or log in naturally. Never make signup a condition for basic guidance.`;

/**
 * A job route is allowed only if the conversation contains a direct work or
 * hiring signal. This is a final deterministic safety net behind the prompt:
 * a model may still be creative, but an unrelated intent must not navigate a
 * person to Hire/Work by default. The same net covers /offer-service, gated
 * on an actual provider-offering signal instead — so a service need never
 * silently defaults to "become a provider" or vice versa.
 */
export function gateJacRouteForConversation(
  route: string | null | undefined,
  messages: readonly JacConversationMessage[],
): string | null {
  if (!route) return null;
  const userContext = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ");
  if (PROVIDER_OFFERING_ROUTE.test(route)) {
    return PROVIDER_OFFERING_INTENT.test(userContext) ? route : null;
  }
  if (JOB_ROUTE.test(route)) {
    return JOB_OR_HIRING_INTENT.test(userContext) ? route : null;
  }
  return route;
}

/**
 * A guest handoff may follow a concrete stated goal, not a generic greeting
 * or a bare request to "sign me up." The LLM still decides whether an account
 * is useful; this only prevents premature conversion prompts.
 */
export function hasGuestGoalSignal(messages: readonly JacConversationMessage[]): boolean {
  const userContext = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(" ");
  return userContext.length >= 12 && (
    GOAL_SIGNAL.test(userContext) ||
    PROVIDER_OFFERING_INTENT.test(userContext)
  );
}
