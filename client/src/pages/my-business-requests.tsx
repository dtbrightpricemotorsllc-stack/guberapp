import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MessageSquare,
  Check,
  X,
} from "lucide-react";
import { GuberLayout } from "@/components/guber-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type CustomerBusinessRequest = {
  source: "request" | "booking";
  id: number;
  requestType: "inquiry" | "quote" | "consultation" | "appointment";
  serviceName: string;
  requestedStartAt: string | null;
  proposedStartAt: string | null;
  proposedEndAt: string | null;
  status: string;
  businessNote: string | null;
  businessName: string;
  businessLogo: string | null;
  createdAt: string;
  updatedAt: string;
  nextAction: string;
  proposalHistory: Array<{
    startAt: string;
    endAt: string;
    status: string;
    createdAt: string;
  }>;
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  inquiry: "Service request",
  quote: "Quote request",
  consultation: "Consultation",
  appointment: "Appointment",
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  contacted: "Business responded",
  quoted: "Quote ready",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  reschedule_proposed: "New time proposed",
  declined: "Declined",
  cancelled: "Cancelled",
  closed: "Closed",
  completed: "Completed",
};

function statusClass(status: string) {
  if (status === "confirmed" || status === "scheduled" || status === "completed") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "reschedule_proposed" || status === "quoted" || status === "contacted") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300";
  }
  if (status === "declined" || status === "cancelled" || status === "closed") {
    return "border-border bg-muted text-muted-foreground";
  }
  return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function businessInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "B";
}

export default function MyBusinessRequests() {
  const { toast } = useToast();
  const {
    data: requests = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<CustomerBusinessRequest[]>({
    queryKey: ["/api/business/requests/mine"],
    retry: false,
  });
  const proposalResponse = useMutation({
    mutationFn: ({
      id,
      decision,
      proposedStartAt,
      proposedEndAt,
    }: {
      id: number;
      decision: "accept" | "decline";
      proposedStartAt: string;
      proposedEndAt: string;
    }) => apiRequest("POST", `/api/business/bookings/${id}/proposal-response`, {
      decision,
      proposedStartAt,
      proposedEndAt,
    }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/requests/mine"] });
      toast({
        title: variables.decision === "accept" ? "Appointment time accepted" : "Proposed time declined",
        description: variables.decision === "accept"
          ? "Your appointment is now confirmed."
          : "The business can propose another available time.",
      });
    },
    onError: (error: Error) => toast({ title: "Unable to respond to proposal", description: error.message, variant: "destructive" }),
  });

  return (
    <GuberLayout title="My Requests" showBack backHref="/dashboard">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Business activity</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">My Requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Track appointments, quotes, consultations, service requests, reschedules, cancellations, and completed requests.
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-3" aria-label="Loading requests">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-44 animate-pulse rounded-2xl border bg-card" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <h2 className="mt-3 font-bold">We couldn’t load your requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">Try again to check for the latest updates.</p>
            <Button className="mt-4" variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <MessageSquare className="mx-auto h-9 w-9 text-muted-foreground" />
            <h2 className="mt-3 font-bold">No business requests yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              When you contact or book a business, its updates will appear here.
            </p>
            <Button asChild className="mt-5">
              <Link href="/businesses">Explore businesses <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4" data-testid="customer-business-request-list">
            {requests.map((request) => {
              const activeDate = request.status === "reschedule_proposed" && request.proposedStartAt
                ? request.proposedStartAt
                : request.requestedStartAt;
              const terminal = ["declined", "cancelled", "closed", "completed"].includes(request.status);
              return (
                <article
                  key={`${request.source}-${request.id}`}
                  className="rounded-2xl border bg-card p-5 shadow-sm"
                  style={{ contentVisibility: "auto", containIntrinsicSize: "0 260px" }}
                  data-testid={`customer-business-request-${request.source}-${request.id}`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12 shrink-0 border">
                      {request.businessLogo && <AvatarImage src={request.businessLogo} alt="" className="object-cover" />}
                      <AvatarFallback className="bg-primary/10 font-bold text-primary">
                        {businessInitials(request.businessName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="truncate font-bold">{request.businessName}</p>
                          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                            {REQUEST_TYPE_LABELS[request.requestType] || "Business request"}
                          </p>
                        </div>
                        <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass(request.status)}`}>
                          {STATUS_LABELS[request.status] || request.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <h2 className="mt-3 text-lg font-bold">{request.serviceName}</h2>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 border-t pt-4">
                    {activeDate ? (
                      <div className="flex items-start gap-2 text-sm">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div>
                          <p className="font-semibold">
                            {request.status === "reschedule_proposed" ? "Proposed new time" : "Requested time"}
                          </p>
                          <p className="text-muted-foreground">{formatDate(activeDate)}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock3 className="h-4 w-4 shrink-0" />
                        Submitted {formatDate(request.createdAt)}
                      </div>
                    )}

                    {request.businessNote && (
                      <div className="rounded-xl bg-muted p-3 text-sm">
                        <p className="font-semibold">Business response</p>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">{request.businessNote}</p>
                      </div>
                    )}

                    {request.proposalHistory?.length > 0 && (
                      <div className="rounded-xl border bg-background p-3 text-sm">
                        <p className="font-semibold">Proposed time history</p>
                        <div className="mt-2 space-y-1.5 text-muted-foreground">
                          {request.proposalHistory.map((proposal, index) => (
                            <p key={`${proposal.createdAt}-${index}`}>
                              {formatDate(proposal.startAt)}
                              {" · Offered"}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-2 rounded-xl border bg-background p-3 text-sm">
                      {terminal
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        : <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                      <div>
                        <p className="font-semibold">Next action</p>
                        <p className="mt-0.5 text-muted-foreground">{request.nextAction}</p>
                      </div>
                    </div>
                    {request.source === "booking" && request.status === "reschedule_proposed" && request.proposedStartAt && request.proposedEndAt && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                        <Button
                          size="sm"
                          onClick={() => proposalResponse.mutate({
                            id: request.id,
                            decision: "accept",
                            proposedStartAt: request.proposedStartAt!,
                            proposedEndAt: request.proposedEndAt!,
                          })}
                          disabled={proposalResponse.isPending}
                          data-testid={`accept-proposed-time-${request.id}`}
                        >
                          <Check className="mr-1 h-4 w-4" /> Accept new time
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => proposalResponse.mutate({
                            id: request.id,
                            decision: "decline",
                            proposedStartAt: request.proposedStartAt!,
                            proposedEndAt: request.proposedEndAt!,
                          })}
                          disabled={proposalResponse.isPending}
                          data-testid={`decline-proposed-time-${request.id}`}
                        >
                          <X className="mr-1 h-4 w-4" /> Decline new time
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </GuberLayout>
  );
}