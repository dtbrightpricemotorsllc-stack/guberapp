import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getToken, clearToken } from "./token-storage";
import { reportIssue } from "./report-issue";

export interface ApiError extends Error {
  status?: number;
  detail?: string;
}

async function getBearerHeader(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleExpiredSession() {
  // Never redirect when the user is already on an auth page — a 401 there
  // means "wrong credentials", not "session expired", and redirecting would
  // swallow the real error message.
  const onAuthPage = ["/login", "/auth", "/signup"].some(p =>
    window.location.pathname.startsWith(p)
  );
  if (onAuthPage) return;

  const token = await getToken();
  if (token) {
    await clearToken();
    const currentPath = window.location.pathname + window.location.search;
    const returnTo = currentPath !== "/" ? `&returnTo=${encodeURIComponent(currentPath)}` : "";
    window.location.href = `/login?reason=session_expired${returnTo}`;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      await handleExpiredSession();
    }
    const text = (await res.text()) || res.statusText;
    let message = text;
    let detail: string | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed.message) {
        message = parsed.message;
        detail = parsed.detail ?? parsed.error;
      }
    } catch {}
    const err: ApiError = new Error(message);
    err.detail = detail;
    err.status = res.status;
    // Phase 5: surface server-side failures (5xx) to JAC's System Guardian.
    // 4xx (validation / auth / not-found) are expected and NOT reported.
    if (res.status >= 500) {
      let path = "";
      try { path = new URL(res.url).pathname; } catch { path = res.url || ""; }
      if (!path.includes("/api/issues/report")) {
        void reportIssue({ module: "network", attemptedAction: `${res.status} ${path}`, error: message, blocked: false });
      }
    }
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(await getBearerHeader()),
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(extraHeaders || {}),
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch (err: any) {
    console.error("[GUBER] Network request failed:", err);
    if (!url.includes("/api/issues/report")) {
      void reportIssue({ module: "network", attemptedAction: `${method} ${url}`, error: err, blocked: false });
    }
    const friendly: ApiError = new Error("Connection issue. Please check your internet and try again.");
    friendly.name = "NetworkError";
    throw friendly;
  }
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let res: Response;
    try {
      res = await fetch(queryKey.join("/") as string, {
        headers: await getBearerHeader(),
        credentials: "include",
      });
    } catch (err: any) {
      console.error("[GUBER] Query network error:", err);
      const _qUrl = queryKey.join("/");
      if (!_qUrl.includes("/api/issues/report")) {
        void reportIssue({ module: "network", attemptedAction: `GET ${_qUrl}`, error: err, blocked: false });
      }
      throw new Error("Connection issue. Please check your internet and try again.");
    }

    if (res.status === 401) {
      await handleExpiredSession();
      if (unauthorizedBehavior === "returnNull") return null;
    }

    await throwIfResNotOk(res);
    return res.json();
  };

// ── Cache strategy ─────────────────────────────────────────────────────────
// Global default: 15s staleTime, refetch on window focus.
// Per-query overrides (defined at the useQuery call site):
//   staleTime: 0          — live/user/payment data (session, Stripe status, notifications)
//   staleTime: 15_000     — jobs list, marketplace feed (default)
//   staleTime: 30_000     — trust scores, cash drops, admin views
//   staleTime: 300_000    — static reference data (service catalog, platform settings)
// Server sets Cache-Control: no-store on all /api/* routes so browsers and
// Cloudflare never cache API responses regardless of these client settings.
// ──────────────────────────────────────────────────────────────────────────

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
