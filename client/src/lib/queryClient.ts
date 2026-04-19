import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getToken, clearToken } from "./token-storage";

async function getBearerHeader(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleExpiredSession() {
  const token = await getToken();
  if (token) {
    await clearToken();
    window.location.href = "/login?reason=session_expired";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      await handleExpiredSession();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(await getBearerHeader()),
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      headers: await getBearerHeader(),
      credentials: "include",
    });

    if (res.status === 401) {
      await handleExpiredSession();
      if (unauthorizedBehavior === "returnNull") return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
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
