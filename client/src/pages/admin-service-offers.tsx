import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GuberLayout } from "@/components/guber-layout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Loader2,
  Pause,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  UserCheck,
} from "lucide-react";

type OfferStatus = "draft" | "published" | "paused" | "archived" | "removed";
type FilterStatus = "all" | "published" | "paused" | "removed" | "needs_attention";

interface ServiceOffer {
  id: number;
  title: string;
  description: string | null;
  category: string;
  serviceType: string | null;
  serviceClass: string;
  capabilities: string[];
  equipment: string[];
  pricingType: string;
  startingPrice: number | null;
  hourlyRate: number | null;
  serviceRadius: number | null;
  providerUserId: number;
  status: OfferStatus;
  moderationStatus: string;
  createdAt: string;
  updatedAt: string;
  provider: {
    id: number;
    name: string;
    avatar: string | null;
    rating: number;
    reviewCount: number;
    idVerified: boolean;
    credentialVerified: boolean;
  };
}

interface AuditLog {
  id: number;
  action: string;
  details: string | null;
  createdAt: string;
  username?: string | null;
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  published: "Live",
  paused: "Paused",
  archived: "Archived",
  removed: "Removed",
};

const statusStyles: Record<string, string> = {
  draft: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  paused: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  archived: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  removed: "border-red-400/30 bg-red-400/10 text-red-300",
};

const moderationLabels: Record<string, string> = {
  approved: "Moderation approved",
  pending: "Awaiting review",
  rejected: "Moderation rejected",
};

const moderationStyles: Record<string, string> = {
  approved: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  rejected: "border-red-400/30 bg-red-400/10 text-red-300",
};

function formatPrice(offer: ServiceOffer) {
  if (offer.pricingType === "hourly" && offer.hourlyRate != null) {
    return `$${Number(offer.hourlyRate).toFixed(2)}/hr`;
  }
  if (offer.pricingType === "starting_at" && offer.startingPrice != null) {
    return `From $${Number(offer.startingPrice).toFixed(2)}`;
  }
  return "Quote";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function AuditHistory({ offerId }: { offerId: number }) {
  const { data, isLoading, isError } = useQuery<{ logs: AuditLog[] }>({
    queryKey: ["/api/admin/audit-logs", "service-offer", offerId],
    queryFn: async () => {
      const params = new URLSearchParams({
        action: "service_offer_moderated",
        details: `serviceOfferId":${offerId},`,
        limit: "50",
      });
      const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load moderation history");
      return response.json();
    },
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading decision history…</div>;
  }
  if (isError) {
    return <p className="py-3 text-xs text-red-300">Decision history is temporarily unavailable.</p>;
  }
  if (!data?.logs?.length) {
    return <p className="py-3 text-xs text-muted-foreground">No moderation decisions recorded yet.</p>;
  }

  return (
    <div className="space-y-2" data-testid={`moderation-history-${offerId}`}>
      {data.logs.map((log) => {
        let decision = "Moderated";
        try {
          const parsed = log.details ? JSON.parse(log.details) : {};
          decision = statusLabels[parsed.status] || parsed.status || decision;
        } catch {
          // Older audit records may use plain text details.
        }
        return (
          <div key={log.id} className="flex items-start gap-2 rounded-lg border border-border/20 bg-background/40 p-2.5 text-xs">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{decision} <span className="font-normal text-muted-foreground">by {log.username ? `@${log.username}` : "admin"}</span></p>
              <p className="text-[10px] text-muted-foreground">{formatDate(log.createdAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerificationBadge({ verified, children, warning = false }: { verified: boolean; children: React.ReactNode; warning?: boolean }) {
  return (
    <Badge className={`gap-1 border text-[10px] ${verified ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : warning ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-border/30 bg-muted text-muted-foreground"}`}>
      {verified ? <BadgeCheck className="h-3 w-3" /> : warning ? <ShieldAlert className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
      {children}
    </Badge>
  );
}

function OfferCard({
  offer,
  expanded,
  onToggle,
  onModerate,
  isBusy,
}: {
  offer: ServiceOffer;
  expanded: boolean;
  onToggle: () => void;
  onModerate: (status: "published" | "paused" | "removed") => void;
  isBusy: boolean;
}) {
  const isRemoved = offer.status === "removed";
  const isLive = offer.status === "published";
  const needsCredential = offer.serviceClass === "skilled_pro";

  return (
    <Card className={`border-border/20 bg-card/80 ${isRemoved ? "opacity-75" : ""}`} data-testid={`service-offer-card-${offer.id}`}>
      <CardHeader className="space-y-3 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${statusStyles[offer.status] || statusStyles.draft}`} data-testid={`service-offer-status-${offer.id}`}>
                {statusLabels[offer.status] || offer.status}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${moderationStyles[offer.moderationStatus] || statusStyles.draft}`} data-testid={`service-offer-moderation-status-${offer.id}`}>
                {moderationLabels[offer.moderationStatus] || offer.moderationStatus}
              </Badge>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{offer.category}</span>
            </div>
            <CardTitle className="text-base leading-tight sm:text-lg" data-testid={`service-offer-title-${offer.id}`}>{offer.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {offer.serviceType || "General service"} · Offer #{offer.id}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggle} aria-label={`${expanded ? "Hide" : "Show"} history for ${offer.title}`} data-testid={`button-toggle-history-${offer.id}`}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" data-testid={`service-offer-verification-${offer.id}`}>
          <VerificationBadge verified={offer.provider.idVerified}>ID {offer.provider.idVerified ? "verified" : "not verified"}</VerificationBadge>
          {needsCredential && <VerificationBadge verified={offer.provider.credentialVerified} warning>Credential {offer.provider.credentialVerified ? "verified" : "not verified"}</VerificationBadge>}
          <span className="ml-1 text-xs text-muted-foreground">Provider {offer.provider.name}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
        <div className="rounded-lg border border-border/20 bg-background/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="h-3 w-3" /> Public offer copy</span>
            <span className="text-xs font-semibold text-foreground">{formatPrice(offer)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{offer.description || "No description provided."}</p>
          {(offer.capabilities.length > 0 || offer.equipment.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...offer.capabilities, ...offer.equipment].map((item, index) => <Badge key={`${item}-${index}`} variant="outline" className="text-[10px] font-normal">{item}</Badge>)}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> {offer.provider.rating ? `${Number(offer.provider.rating).toFixed(1)} rating` : "No rating"} · {offer.provider.reviewCount || 0} reviews</span>
          {offer.serviceRadius != null && <span>{offer.serviceRadius} mile service radius</span>}
          <span>Updated {formatDate(offer.updatedAt)}</span>
        </div>

        {!isRemoved && (
          <div className="flex flex-col gap-2 border-t border-border/20 pt-3 sm:flex-row sm:justify-end">
            {!isLive && (
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onModerate("published")} data-testid={`button-keep-live-${offer.id}`}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Approve &amp; publish
              </Button>
            )}
            {offer.status !== "paused" && (
              <Button variant="outline" size="sm" disabled={isBusy} onClick={() => onModerate("paused")} data-testid={`button-pause-offer-${offer.id}`}>
                <Pause className="mr-1.5 h-3.5 w-3.5 text-amber-400" /> Pause
              </Button>
            )}
            <Button variant="destructive" size="sm" disabled={isBusy} onClick={() => onModerate("removed")} data-testid={`button-remove-offer-${offer.id}`}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove unsafe offer
            </Button>
          </div>
        )}

        {expanded && (
          <div className="border-t border-border/20 pt-3">
            <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Decision history</h4>
            <AuditHistory offerId={offer.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminServiceOffers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<{ offer: ServiceOffer; status: "published" | "paused" | "removed" } | null>(null);

  const { data: offers = [], isLoading, isError } = useQuery<ServiceOffer[]>({
    queryKey: ["/api/admin/service-offers"],
    enabled: user?.role === "admin",
  });

  const moderationMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "published" | "paused" | "removed" }) =>
      apiRequest("PATCH", `/api/admin/service-offers/${id}`, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/service-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-offers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/audit-logs"] });
      setConfirmation(null);
      toast({
        title: variables.status === "removed" ? "Offer removed" : variables.status === "paused" ? "Offer paused" : "Offer approved and published",
        description: variables.status === "removed" || variables.status === "paused" ? "It is no longer visible in public service discovery." : "The offer is now visible to customers.",
      });
    },
    onError: (error: any) => toast({ title: "Moderation action failed", description: error.message, variant: "destructive" }),
  });

  const filteredOffers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return offers.filter((offer) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "needs_attention" && (offer.moderationStatus !== "approved" || !offer.provider.idVerified || (offer.serviceClass === "skilled_pro" && !offer.provider.credentialVerified))) ||
        offer.status === filter;
      const matchesSearch = !needle || [offer.title, offer.description, offer.category, offer.serviceType, offer.provider.name].some((value) => value?.toLowerCase().includes(needle));
      return matchesFilter && matchesSearch;
    });
  }, [filter, offers, search]);

  if (user?.role !== "admin") {
    return <GuberLayout><div className="mx-auto max-w-3xl px-4 py-20 text-center"><Shield className="mx-auto mb-3 h-12 w-12 text-muted-foreground" /><p className="font-display text-muted-foreground">Admin access required</p></div></GuberLayout>;
  }

  return (
    <GuberLayout>
      <main className="mx-auto w-full max-w-4xl px-4 py-5 sm:px-6 sm:py-8" data-testid="page-admin-service-offers">
        <div className="mb-6 flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="mt-0.5 h-8 w-8 shrink-0" data-testid="link-back-admin">
            <a href="/admin" aria-label="Back to admin panel"><ArrowLeft className="h-4 w-4" /></a>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-400" />
              <h1 className="font-display text-xl font-bold sm:text-2xl">Services moderation</h1>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Review provider verification and public offer copy before unsafe services reach customers.</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="service-offer-moderation-stats">
          {[
            { label: "Total offers", value: offers.length, color: "text-foreground" },
            { label: "Live", value: offers.filter((offer) => offer.status === "published").length, color: "text-emerald-400" },
            { label: "Paused", value: offers.filter((offer) => offer.status === "paused").length, color: "text-amber-400" },
            { label: "Removed", value: offers.filter((offer) => offer.status === "removed").length, color: "text-red-400" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/20 bg-card p-3 text-center">
              <p className={`font-display text-xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search offers, providers, or categories…" className="h-10 rounded-xl bg-muted pl-9" data-testid="input-service-offer-search" />
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="service-offer-filters">
            {([
              ["all", "All"],
              ["needs_attention", "Needs attention"],
              ["published", "Live"],
              ["paused", "Paused"],
              ["removed", "Removed"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-[10px] font-display font-bold tracking-wide transition-colors ${filter === value ? "border-amber-400/40 bg-amber-400 text-black" : "border-border/20 bg-muted text-muted-foreground hover:text-foreground"}`} data-testid={`filter-service-offers-${value}`}>
                {label}{value === "all" ? ` (${offers.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        {confirmation && (
          <div className={`mb-5 rounded-xl border p-4 ${confirmation.status === "removed" ? "border-red-400/40 bg-red-400/10" : "border-amber-400/40 bg-amber-400/10"}`} role="alert" data-testid="moderation-confirmation">
            <div className="flex items-start gap-3">
              <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${confirmation.status === "removed" ? "text-red-300" : "text-amber-300"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{confirmation.status === "removed" ? "Remove this unsafe offer?" : confirmation.status === "paused" ? "Pause this offer?" : "Approve and publish this offer?"}</p>
                <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">{confirmation.offer.title}</span> will {confirmation.status === "removed" ? "be removed from service discovery" : confirmation.status === "paused" ? "be hidden from service discovery until resumed" : "remain visible to customers"}.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant={confirmation.status === "removed" ? "destructive" : "default"} disabled={moderationMutation.isPending} onClick={() => moderationMutation.mutate({ id: confirmation.offer.id, status: confirmation.status })} data-testid="button-confirm-moderation">
                    {moderationMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Confirm {confirmation.status === "removed" ? "remove" : confirmation.status === "paused" ? "pause" : "approval"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={moderationMutation.isPending} onClick={() => setConfirmation(null)} data-testid="button-cancel-moderation">Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-56 w-full rounded-xl" />)}</div>
        ) : isError ? (
          <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-6 text-center text-sm text-red-200" data-testid="service-offer-error">Unable to load the service moderation queue. Refresh and try again.</div>
        ) : filteredOffers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/30 p-10 text-center" data-testid="service-offer-empty">
            <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-display font-semibold">No matching service offers</p>
            <p className="mt-1 text-sm text-muted-foreground">{offers.length ? "Try a different filter or search." : "New provider offers will appear here for review."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOffers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                expanded={expandedId === offer.id}
                onToggle={() => setExpandedId((current) => current === offer.id ? null : offer.id)}
                onModerate={(status) => setConfirmation({ offer, status })}
                isBusy={moderationMutation.isPending && moderationMutation.variables?.id === offer.id}
              />
            ))}
          </div>
        )}
      </main>
    </GuberLayout>
  );
}