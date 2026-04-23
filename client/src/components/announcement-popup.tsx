import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Popup = {
  id: number;
  title: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
};

export default function AnnouncementPopup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  const { data } = useQuery<Popup | null>({
    queryKey: ["/api/me/popup"],
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data) setOpen(true);
  }, [data?.id]);

  if (!user || !data || !open) return null;

  const dismiss = async () => {
    setOpen(false);
    try {
      await apiRequest("PATCH", `/api/notifications/${data.id}/read`);
      queryClient.invalidateQueries({ queryKey: ["/api/me/popup"] });
    } catch {}
  };

  const accept = async () => {
    if (data.ctaUrl) {
      const url = data.ctaUrl;
      const isExternal = /^https?:\/\//i.test(url);
      if (isExternal) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = url;
      }
    }
    await dismiss();
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={dismiss}
      data-testid="announcement-popup-backdrop"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-amber-500/30 p-5 shadow-2xl"
        style={{
          background: "linear-gradient(160deg,#1a1410 0%,#0c0a08 100%)",
          boxShadow: "0 0 40px rgba(245,197,66,0.15),0 20px 50px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="announcement-popup"
      >
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          data-testid="button-popup-close"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h2
          className="font-display text-lg font-bold pr-8 mb-2"
          style={{ color: "#F5C542" }}
          data-testid="text-popup-title"
        >
          {data.title}
        </h2>
        <p className="text-sm text-zinc-300 leading-relaxed mb-5" data-testid="text-popup-body">
          {data.body}
        </p>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={dismiss}
            className="flex-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
            data-testid="button-popup-dismiss"
          >
            Not interested
          </Button>
          {data.ctaUrl && (
            <Button
              onClick={accept}
              className="flex-1 font-display font-bold"
              style={{
                background: "linear-gradient(135deg,#F5C542,#D4A017)",
                color: "#0c0a08",
                boxShadow: "0 0 20px rgba(245,197,66,0.4)",
              }}
              data-testid="button-popup-cta"
            >
              {data.ctaLabel || "Learn more"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
