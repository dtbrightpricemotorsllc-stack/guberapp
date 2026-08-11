/**
 * useJacDraftCardPoll — polls /api/jac/pending-draft-card every 2 seconds.
 *
 * When ElevenLabs calls the create_job_draft server tool, the backend queues
 * a draft-card notification keyed to the logged-in user.  This hook picks it
 * up and calls onDraftCard() so the JAC chat UI can render a "Review Draft"
 * action card without the user having to navigate manually.
 *
 * Only polls when `active` is true (voice session is running) to avoid
 * unnecessary requests when JAC is idle.
 */
import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2000;

interface DraftCard {
  draftId: string;
  title: string;
}

export function useJacDraftCardPoll(
  active: boolean,
  onDraftCard: (card: DraftCard) => void,
) {
  const cbRef = useRef(onDraftCard);
  useEffect(() => { cbRef.current = onDraftCard; });

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/jac/pending-draft-card", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.card && data.card.draftId && !cancelled) {
          cbRef.current(data.card as DraftCard);
        }
      } catch {
        // network error — silent, retry on next tick
      }
    }

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active]);
}
