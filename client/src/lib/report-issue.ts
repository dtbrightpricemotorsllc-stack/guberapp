/**
 * Client-side issue reporter — feeds JAC's System Guardian.
 *
 * Sends rich failure context (platform, device, route, user, related ids) to
 * POST /api/issues/report. Designed to NEVER throw into the caller and NEVER
 * flood the server:
 *  - swallows all of its own errors
 *  - per-key session cap so a repeating failure reports at most a few times
 *  - a recursion guard so global error handlers (Phase 5) don't report errors
 *    that originate from the reporter itself
 *
 * Severity is intentionally NOT sent — the server classifies it. `blocked`
 * tells the server whether the user was stopped from completing the flow.
 */
import { isIOS, isAndroid } from "./platform";
import { getToken } from "./token-storage";

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || "web";

function currentPlatform(): string {
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "web";
}

function deviceInfo(): string {
  try {
    return (navigator.userAgent || "unknown").slice(0, 200);
  } catch {
    return "unknown";
  }
}

function currentRoute(): string {
  try {
    return (window.location.pathname + window.location.search).slice(0, 300);
  } catch {
    return "";
  }
}

function errToMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || String(error);
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return String(error);
  }
}

export interface ReportIssueParams {
  /** payment | wallet | login | signup | upload | gps | map | studio | job | network | client | general */
  module: string;
  attemptedAction?: string;
  error?: unknown;
  relatedIds?: Record<string, string | number>;
  /** true when the failure stopped the user from completing a core flow */
  blocked?: boolean;
  steps?: string[];
  gpsPermission?: string;
}

let reporting = false; // recursion guard for global handlers
const sessionCaps = new Map<string, number>();
const MAX_PER_KEY = 5;

/** Whether the reporter is mid-send — global error handlers use this to skip. */
export function isReporting(): boolean {
  return reporting;
}

export async function reportIssue(params: ReportIssueParams): Promise<void> {
  try {
    if (reporting) return;
    const message = errToMessage(params.error).slice(0, 1000);

    const capKey = `${params.module}|${message.slice(0, 60)}`;
    const seen = sessionCaps.get(capKey) ?? 0;
    if (seen >= MAX_PER_KEY) return;
    sessionCaps.set(capKey, seen + 1);

    reporting = true;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    try {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* token optional — endpoint is auth-optional */
    }

    const body = JSON.stringify({
      platform: currentPlatform(),
      device: deviceInfo(),
      appVersion: APP_VERSION,
      route: currentRoute(),
      module: params.module,
      attemptedAction: params.attemptedAction ?? null,
      errorMessage: message,
      relatedIds: params.relatedIds ?? {},
      blocked: params.blocked ?? false,
      steps: params.steps ?? [],
      gpsPermission: params.gpsPermission ?? null,
    });

    await fetch("/api/issues/report", {
      method: "POST",
      headers,
      body,
      keepalive: true, // allow delivery during navigation / unload
      credentials: "include",
    }).catch(() => {});
  } catch {
    /* reporting must never throw into the caller */
  } finally {
    reporting = false;
  }
}

let globalInstalled = false;

/**
 * Install browser-global error handlers (Phase 5) so uncaught exceptions and
 * unhandled promise rejections anywhere in the app are reported to JAC's System
 * Guardian as `client` issues. Idempotent. Skips errors that originate from the
 * reporter itself (isReporting) and common browser noise (ResizeObserver loops,
 * cross-origin "Script error."). Per-key session caps + server-side dedupe keep
 * this from flooding.
 */
export function installGlobalErrorReporting(): void {
  try {
    if (globalInstalled || typeof window === "undefined") return;
    globalInstalled = true;

    const NOISE = [/resizeobserver/i, /^script error\.?$/i, /non-error promise rejection/i];
    const isNoise = (m: string) => !m || NOISE.some((p) => p.test(m));

    window.addEventListener("error", (event: ErrorEvent) => {
      if (isReporting()) return;
      const msg =
        event?.error instanceof Error ? event.error.message || String(event.error) : event?.message || "";
      if (isNoise(msg)) return;
      void reportIssue({
        module: "client",
        attemptedAction: "uncaught error",
        error: msg,
        relatedIds: event?.filename ? { src: `${event.filename}:${event.lineno ?? 0}` } : undefined,
        blocked: false,
      });
    });

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      if (isReporting()) return;
      const reason: any = event?.reason;
      const msg =
        reason instanceof Error
          ? reason.message || String(reason)
          : typeof reason === "string"
            ? reason
            : "";
      if (isNoise(msg)) return;
      void reportIssue({
        module: "client",
        attemptedAction: "unhandled promise rejection",
        error: msg,
        blocked: false,
      });
    });
  } catch {
    /* never break app startup */
  }
}
