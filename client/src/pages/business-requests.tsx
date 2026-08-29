import { useMutation, useQuery } from "@tanstack/react-query";
import { BizLayout } from "@/components/biz-layout";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Check, Clock3, MessageSquare, X } from "lucide-react";
import { Link } from "wouter";
import { isStoreBuild } from "@/lib/platform";

type RequestItem = {
  id: number;
  request_type: string;
  topic: string;
  message: string | null;
  requested_start_at: string | null;
  customer_timezone: string | null;
  customer_location: string | null;
  status: string;
  business_note: string | null;
  customer_guber_id: string | null;
  created_at: string;
};

const typeLabel: Record<string, string> = {
  inquiry: "Customer inquiry",
  quote: "Quote request",
  consultation: "Consultation request",
  appointment: "Appointment request",
};

function statusClass(status: string) {
  if (status === "closed" || status === "declined") return "bg-muted text-muted-foreground";
  if (status === "scheduled" || status === "quoted") return "bg-emerald-500/10 text-emerald-600";
  return "bg-amber-500/10 text-amber-600";
}

export default function BusinessRequests() {
  const { data: account } = useQuery<{ activityAccess?: boolean }>({
    queryKey: ["/api/business/account"],
    retry: false,
  });
  const { data: requests = [], isLoading } = useQuery<RequestItem[]>({
    queryKey: ["/api/business/requests"],
    retry: false,
    enabled: account?.activityAccess === true,
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/business/requests/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/business/requests"] }),
  });

  return (
    <BizLayout>
      {account && !account.activityAccess ? (
        <div className="mx-auto max-w-3xl rounded-3xl border bg-card p-8 md:p-12">
          <MessageSquare className="h-10 w-10 text-primary" />
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-primary">BUSINESS+ feature</p>
          <h1 className="mt-2 text-3xl font-black">Customer requests</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">Bookings and requests, payments and deposits, and business customer history require BUSINESS+, BUSINESS PRO, or the Founding Local Business offer.</p>
          {isStoreBuild ? (
            <p className="mt-6 rounded-xl bg-muted p-4 text-xs text-muted-foreground">Your access is recognized here. Subscriptions and billing are managed on guberapp.com.</p>
          ) : (
            <Button asChild className="mt-6"><Link href="/biz/dashboard">View business plans</Link></Button>
          )}
        </div>
      ) : (
      <div className="mx-auto max-w-5xl space-y-8 pb-12">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Customer connections</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Business requests</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Review inquiries, quote requests, consultations, and appointment requests from your verified GUBER profile. Customers are identified by Guber ID only.</p>
        </header>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading requests…</p> : requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">No customer requests yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Enable customer-facing capabilities in your business profile to start receiving them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-primary">{typeLabel[request.request_type] || "Business request"}</p>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(request.status)}`}>{request.status}</span>
                    </div>
                    <h2 className="mt-2 text-lg font-bold">{request.topic}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Customer Guber ID: {request.customer_guber_id || "Guber member"}</p>
                    {request.requested_start_at && <p className="mt-3 flex items-center gap-2 text-sm"><Clock3 className="h-4 w-4 text-primary" />{new Date(request.requested_start_at).toLocaleString()}{request.customer_timezone ? ` · ${request.customer_timezone}` : ""}</p>}
                    {request.customer_location && <p className="mt-2 text-xs text-muted-foreground">General area: {request.customer_location}</p>}
                    {request.message && <p className="mt-3 rounded-xl bg-muted p-3 text-sm leading-relaxed">{request.message}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {request.status === "requested" && <Button size="sm" onClick={() => update.mutate({ id: request.id, status: request.request_type === "quote" ? "quoted" : request.request_type === "appointment" || request.request_type === "consultation" ? "scheduled" : "contacted" })}><Check className="mr-1 h-4 w-4" /> {request.request_type === "quote" ? "Mark quoted" : "Respond"}</Button>}
                    {!["closed", "declined"].includes(request.status) && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: request.id, status: "closed" })}><X className="mr-1 h-4 w-4" /> Close</Button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      )}
    </BizLayout>
  );
}