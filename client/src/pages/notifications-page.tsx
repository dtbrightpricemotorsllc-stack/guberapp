import { useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Check, Briefcase, AlertTriangle, Star, Info, ChevronRight, Zap, Trophy } from "lucide-react";
import type { Notification } from "@shared/schema";
import { useLocation } from "wouter";

const typeIcons: Record<string, any> = { job: Briefcase, alert: AlertTriangle, review: Star, system: Info, cash_drop: Zap, cash_drop_win: Trophy };

/** Resolve the navigation URL for a notification. Returns null if non-navigable. */
function getNotifUrl(n: Notification): string | null {
  if (n.cashDropId && (n.type === "cash_drop" || n.type === "cash_drop_win")) return `/cash-drop/${n.cashDropId}`;
  if (n.jobId) return `/jobs/${n.jobId}`;
  if (n.type === "review") return "/my-jobs";
  if (n.type === "alert") return "/wallet";
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const mutatingIds = useRef<Set<number>>(new Set());

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSettled: (_data, _err, id) => {
      mutatingIds.current.delete(id);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const handleNotificationTap = (n: Notification) => {
    // Mark as read — but only fire the mutation once (ref-based, won't block navigation)
    if (!n.read && !mutatingIds.current.has(n.id)) {
      mutatingIds.current.add(n.id);
      markReadMutation.mutate(n.id);
    }
    // Always navigate — even while the mark-read call is still in-flight
    const url = getNotifUrl(n);
    if (url) navigate(url);
  };

  const unreadCount = notifications?.filter((n) => !n.read).length || 0;

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-notifications">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-display font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost" size="sm"
              onClick={() => markAllMutation.mutate()}
              className="text-xs guber-text-green font-display"
              data-testid="button-mark-all-read"
            >
              <Check className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-display">No notifications</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const Icon = typeIcons[n.type || "system"] || Info;
              const navUrl = getNotifUrl(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  className={[
                    "w-full text-left bg-card rounded-xl border p-4 flex items-start gap-3 transition-colors",
                    !n.read ? "border-primary/20" : "border-border/10",
                    navUrl ? "cursor-pointer hover:border-primary/40 active:opacity-80" : "cursor-default",
                  ].join(" ")}
                  onClick={() => handleNotificationTap(n)}
                  data-testid={`notification-${n.id}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!n.read ? "bg-primary/10" : "bg-muted"}`}>
                    <Icon className={`w-4 h-4 ${!n.read ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-sm">{n.title}</p>
                    {n.body && <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    {!n.read && <div className="w-2 h-2 rounded-full bg-primary" />}
                    {navUrl && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}
