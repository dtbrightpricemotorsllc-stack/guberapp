/**
 * useGuestJacSession
 *
 * Provides a stable guest_session_id for anonymous JAC conversations.
 * Stored in localStorage — survives page reloads, survives until the user
 * signs in and the session is transferred (then cleared).
 *
 * On first call a UUID is generated and stored.
 * On subsequent calls the same UUID is returned.
 */

import { useCallback, useMemo } from "react";

const STORAGE_KEY = "jac_guest_session_id";

export function getGuestSessionId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Fallback if localStorage is unavailable (private browsing, etc.)
    return "guest-no-storage";
  }
}

export function clearGuestSessionId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function useGuestJacSession() {
  const guestSessionId = useMemo(() => getGuestSessionId(), []);

  /** Transfer guest drafts to the now-authenticated user, then clear local session. */
  const transferGuestSession = useCallback(async (): Promise<{ transferred: number } | null> => {
    const id = getGuestSessionId();
    if (!id || id === "guest-no-storage") return null;
    try {
      const res = await fetch("/api/jac/guest-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ guest_session_id: id }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.success) clearGuestSessionId();
      return { transferred: data.transferred ?? 0 };
    } catch {
      return null;
    }
  }, []);

  /** Save a guest draft to the server-side guest session. */
  const saveGuestDraft = useCallback(async (type: string, data: Record<string, any>): Promise<boolean> => {
    const id = getGuestSessionId();
    if (!id || id === "guest-no-storage") return false;
    try {
      const res = await fetch("/api/jac/guest-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_session_id: id, type, data }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { guestSessionId, transferGuestSession, saveGuestDraft };
}
