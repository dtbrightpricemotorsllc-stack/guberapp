/**
 * useJacNavPoll — polls /api/jac/pending-nav every 2 seconds.
 *
 * When ElevenLabs calls the open_guber_screen or publish_job server tools, the
 * backend queues a navigation action keyed to the logged-in user.  This hook
 * picks it up and fires a wouter navigation so the user lands on the right
 * screen without having to tap a link.
 *
 * Only polls when the user is authenticated (no wasted requests for guests).
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";

const POLL_INTERVAL_MS = 2000;

export function useJacNavPoll() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }

    async function poll() {
      try {
        const res = await fetch("/api/jac/pending-nav", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.pending && data.route) {
          navigate(data.route);
        }
      } catch {
        // network error — silent, retry on next tick
      }
    }

    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
