export type JacQuickActionSurface = "homepage" | "live" | "assistant";

export type JacQuickAction = {
  id: string;
  label: string;
  message: string;
  surfaces: JacQuickActionSurface[];
};

export type SharedJacMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: JacQuickActionSurface;
};

const SHARED_CONVERSATION_KEY = "jac_shared_conversation_v1";
const MAX_SHARED_MESSAGES = 40;
const JAC_E2E_HARNESS_KEY = "jac_e2e_voice_harness";
const JAC_E2E_EVENT = "jac:e2e-voice";
const JAC_GREETING_KEYS = [
  "jac_welcome_greeting_spoken_v2",
  // Read the previous homepage guard so upgrading does not replay the greeting.
  "jac_homepage_greeting_spoken_v1",
];
let greetingClaimedThisRuntime = false;

export type JacE2EVoiceEvent = {
  target: "homepage" | "assistant";
  kind:
    | "connect"
    | "listening"
    | "thinking"
    | "speaking"
    | "user-transcript"
    | "assistant-response"
    | "error"
    | "disconnect";
  text?: string;
  errorKind?:
    | "microphone-denied"
    | "microphone-unavailable"
    | "session"
    | "audio"
    | "transport";
};

/**
 * Development-only deterministic voice harness for browser acceptance tests.
 *
 * The query flag is remembered in sessionStorage so a real login navigation can
 * keep using the same harness without exposing it in production builds.
 */
export function isJacE2EVoiceHarnessEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    const requested = new URLSearchParams(window.location.search).get("jac_e2e") === "1";
    if (requested) window.sessionStorage.setItem(JAC_E2E_HARNESS_KEY, "1");
    return requested || window.sessionStorage.getItem(JAC_E2E_HARNESS_KEY) === "1";
  } catch {
    return false;
  }
}

export function subscribeToJacE2EVoiceEvents(
  target: JacE2EVoiceEvent["target"],
  handler: (event: JacE2EVoiceEvent) => void,
): () => void {
  if (!isJacE2EVoiceHarnessEnabled() || typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<JacE2EVoiceEvent>).detail;
    if (detail?.target === target) handler(detail);
  };
  window.addEventListener(JAC_E2E_EVENT, listener);
  return () => window.removeEventListener(JAC_E2E_EVENT, listener);
}

export const JAC_WELCOME_GREETING =
  "Welcome to Team Guber. What brings you here?";

/** Claim the one-per-browser-session welcome across every JAC surface. */
export function claimJacWelcomeGreeting(): boolean {
  if (greetingClaimedThisRuntime) return false;
  greetingClaimedThisRuntime = true;
  if (typeof window === "undefined") return false;
  try {
    if (JAC_GREETING_KEYS.some((key) => window.sessionStorage.getItem(key) === "1")) return false;
    JAC_GREETING_KEYS.forEach((key) => window.sessionStorage.setItem(key, "1"));
  } catch {
    // The runtime guard still prevents duplicate greetings when storage is unavailable.
  }
  return true;
}

/** Check voice readiness without prompting for permission or opening the mic. */
export async function isJacMicrophoneReady(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return false;
  if (!navigator.permissions?.query) return false;
  try {
    const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (permission.state !== "granted") return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === "audioinput");
  } catch {
    return false;
  }
}

/**
 * Create a duplicate-start guard for one mounted JAC session.
 *
 * This deliberately stays out of browser storage: returning from sign-in or an
 * auth-driven provider remount is a fresh JAC entry and must be allowed to
 * establish its current voice session again. The generic greeting has its own,
 * separate browser-session guard above.
 */
export function createJacAutomaticVoiceStartClaim(): () => boolean {
  let claimed = false;
  return () => {
    if (claimed) return false;
    claimed = true;
    return true;
  };
}

export const JAC_QUICK_ACTIONS: JacQuickAction[] = [
  { id: "help", label: "I need help", message: "I need help", surfaces: ["homepage", "live", "assistant"] },
  { id: "work", label: "I need work", message: "I need work", surfaces: ["homepage", "live", "assistant"] },
  { id: "money", label: "I need money today", message: "I need money today", surfaces: ["homepage", "live", "assistant"] },
  { id: "hire", label: "I need to hire someone", message: "I need to hire someone", surfaces: ["homepage", "live", "assistant"] },
  { id: "services", label: "Find a local service", message: "I need help from a local service provider", surfaces: ["homepage", "live", "assistant"] },
  { id: "transport", label: "I need transport", message: "I need transport", surfaces: ["homepage", "live", "assistant"] },
  { id: "verify", label: "Have something verified", message: "I need something verified before I buy it", surfaces: ["homepage", "live", "assistant"] },
  { id: "sell", label: "I want to sell something", message: "I want to sell something", surfaces: ["homepage", "live", "assistant"] },
  { id: "business", label: "I own a business", message: "I own a business", surfaces: ["homepage", "live", "assistant"] },
  { id: "provider", label: "I provide services", message: "I provide services", surfaces: ["homepage", "assistant"] },
  { id: "loads", label: "I have a truck", message: "I have a truck and want loads", surfaces: ["homepage", "live", "assistant"] },
  { id: "content", label: "I create content", message: "I create content", surfaces: ["homepage", "live", "assistant"] },
  { id: "retired", label: "I'm retired", message: "I'm retired", surfaces: ["homepage", "assistant"] },
  { id: "explore", label: "Just exploring", message: "I'm just exploring", surfaces: ["homepage", "live", "assistant"] },
  { id: "unsure", label: "I'm not sure yet", message: "I'm not sure yet", surfaces: ["homepage"] },
];

export function getJacQuickActions(surface: JacQuickActionSurface, limit?: number): JacQuickAction[] {
  const actions = JAC_QUICK_ACTIONS.filter((action) => action.surfaces.includes(surface));
  return typeof limit === "number" ? actions.slice(0, limit) : actions;
}

export function isServiceDiscoveryIntent(text: string): boolean {
  return /\b(service|provider|plumber|electrician|cleaner|cleaning|lawn|landscap|handyman|repair|painter|moving help|pet sitter|dog walker)\b/i.test(text);
}

function readStoredMessages(): SharedJacMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SHARED_CONVERSATION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((message): message is SharedJacMessage =>
        message
        && (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
        && typeof message.id === "string"
      )
      .slice(-MAX_SHARED_MESSAGES);
  } catch {
    return [];
  }
}

export function readSharedJacConversation(limit = MAX_SHARED_MESSAGES): SharedJacMessage[] {
  return readStoredMessages().slice(-limit);
}

export function appendSharedJacMessage(
  message: Omit<SharedJacMessage, "id"> & { id?: string },
): SharedJacMessage {
  const entry: SharedJacMessage = {
    ...message,
    id: message.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  if (typeof window === "undefined") return entry;

  try {
    const next = [...readStoredMessages(), entry].slice(-MAX_SHARED_MESSAGES);
    window.sessionStorage.setItem(SHARED_CONVERSATION_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("jac:conversation-updated", { detail: entry }));
  } catch {
    // Conversation persistence should never block an active assistant exchange.
  }
  return entry;
}