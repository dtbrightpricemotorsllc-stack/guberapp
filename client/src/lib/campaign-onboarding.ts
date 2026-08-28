export type CampaignKind = "consumer" | "business";

export interface CampaignSession {
  sessionId: string;
  kind: CampaignKind;
  source: string;
  referralCode: string | null;
  invitationCode: string | null;
  originalIntent: string | null;
  currentIntent: string | null;
  resumePath: string;
  context: Record<string, unknown>;
  status: string;
  expiresAt: string;
}

const STORAGE_KEY = "guber_campaign_session";

export function getActiveCampaignSessionId(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("campaignSession");
    if (fromQuery) {
      localStorage.setItem(STORAGE_KEY, fromQuery);
      return fromQuery;
    }
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setActiveCampaignSessionId(sessionId: string) {
  try { localStorage.setItem(STORAGE_KEY, sessionId); } catch {}
}

export function clearActiveCampaignSessionId() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export async function createCampaignSession(input: {
  kind: CampaignKind;
  code?: string;
  source?: string;
  guestSessionId?: string;
}) {
  const response = await fetch("/api/onboarding/campaign-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Unable to start flyer session");
  setActiveCampaignSessionId(body.sessionId);
  return body as CampaignSession;
}

export async function getCampaignSession(sessionId = getActiveCampaignSessionId()) {
  if (!sessionId) return null;
  const response = await fetch(`/api/onboarding/campaign-session/${encodeURIComponent(sessionId)}`, {
    credentials: "include",
  });
  if (!response.ok) return null;
  return response.json() as Promise<CampaignSession>;
}

export async function updateCampaignSession(
  sessionId: string,
  update: { intent?: string; resumePath?: string; context?: Record<string, unknown>; guestSessionId?: string },
) {
  const response = await fetch(`/api/onboarding/campaign-session/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(update),
  });
  if (!response.ok) return null;
  return response.json() as Promise<CampaignSession>;
}

export async function recordCampaignEvent(
  sessionId: string,
  eventType: string,
  eventKey = eventType,
  payload: Record<string, unknown> = {},
) {
  await fetch(`/api/onboarding/campaign-session/${encodeURIComponent(sessionId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ eventType, eventKey, payload }),
  }).catch(() => {});
}

export async function claimActiveCampaignSession(sessionId = getActiveCampaignSessionId()) {
  if (!sessionId) return null;
  const response = await fetch(`/api/onboarding/campaign-session/${encodeURIComponent(sessionId)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!response.ok) return null;
  return response.json() as Promise<CampaignSession>;
}

export async function claimAndResolveCampaignPath(fallback: string) {
  const session = await claimActiveCampaignSession();
  if (!session) return fallback;
  const destination = session.kind === "business" ? "/biz/dashboard" : session.resumePath || fallback;
  await recordCampaignEvent(session.sessionId, "flow_resumed", `flow_resumed:${destination}`, { destination });
  return withCampaignSession(destination, session.sessionId) || fallback;
}

export function withCampaignSession(path: string | null | undefined, sessionId: string | null) {
  if (!path || !sessionId || !path.startsWith("/") || path.startsWith("//")) return path || null;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("campaignSession", sessionId);
  return `${url.pathname}${url.search}${url.hash}`;
}