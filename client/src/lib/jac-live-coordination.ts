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