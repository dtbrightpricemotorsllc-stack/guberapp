import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Briefcase,
  PlusCircle,
  Search,
  AlertTriangle,
  DollarSign,
  Clock,
  MapPin,
  Lock,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Play,
  Camera,
  Circle,
} from "lucide-react";
import type { Job } from "@shared/schema";

type Mode = "hire" | "work";

const HIRE_TABS = [
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "posted", label: "Posted" },
  { value: "pending_confirm", label: "Pending Confirm" },
  { value: "locked_in_progress", label: "Locked / In Progress" },
  { value: "proof_submitted", label: "Proof Submitted" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "disputed", label: "Disputed" },
] as const;

const WORK_TABS = [
  { value: "accepted_pending", label: "Accepted Pending Lock" },
  { value: "locked_in_progress", label: "Locked / In Progress" },
  { value: "proof_needed", label: "Proof Needed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "disputed", label: "Disputed" },
] as const;

const STATUS_TIMELINE_HIRE = [
  { key: "posted_public", label: "Posted" },
  { key: "accepted_pending_payment", label: "Accepted" },
  { key: "funded", label: "Funded" },
  { key: "active", label: "Active" },
  { key: "in_progress", label: "In Progress" },
  { key: "proof_submitted", label: "Proof Sent" },
  { key: "completion_submitted", label: "Completed" },
  { key: "completed_paid", label: "Paid" },
];

const STATUS_TIMELINE_WORK = [
  { key: "accepted_pending_payment", label: "Accepted" },
  { key: "funded", label: "Funded" },
  { key: "active", label: "Active" },
  { key: "in_progress", label: "In Progress" },
  { key: "proof_submitted", label: "Proof Sent" },
  { key: "completion_submitted", label: "Completed" },
  { key: "completed_paid", label: "Paid" },
];

const statusColors: Record<string, string> = {
  posted_public: "bg-primary/15 text-primary border-primary/30",
  draft: "bg-muted/40 text-muted-foreground border-muted/30",
  accepted_pending_payment: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  funded: "bg-secondary/15 text-secondary-foreground border-secondary/30",
  active: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  completion_submitted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  completed_paid: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border-emerald-600/30",
  proof_submitted: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  cancelled: "bg-muted/40 text-muted-foreground border-muted/30",
  canceled_by_hirer: "bg-muted/40 text-muted-foreground border-muted/30",
  payment_pending: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  agreed_payment_pending: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  disputed: "bg-destructive/15 text-destructive border-destructive/30",
};

function getStatusIndex(status: string, timeline: { key: string }[]): number {
  const idx = timeline.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : -1;
}

function StatusTimeline({ status, timeline }: { status: string; timeline: { key: string; label: string }[] }) {
  const currentIdx = getStatusIndex(status, timeline);
  const isCancelled = status === "cancelled" || status === "canceled_by_hirer";
  const isDisputed = status === "disputed";

  if (isCancelled || isDisputed) {
    return (
      <div className="flex items-center gap-1.5 mb-3">
        <Badge variant="outline" className={`text-[10px] ${statusColors[status] || ""}`}>
          {status === "cancelled" ? "Cancelled" : "Disputed"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 mb-3 overflow-x-auto" data-testid="status-timeline">
      {timeline.map((step, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-0.5 shrink-0">
            {i > 0 && (
              <div
                className={`w-5 h-0.5 rounded-full transition-all duration-500 ${isPast || isCurrent ? "bg-primary shadow-[0_0_4px_hsl(152_100%_44%/0.3)]" : "bg-muted/40"}`}
              />
            )}
            <div className="flex flex-col items-center">
              {isPast ? (
                <CheckCircle2 className="w-4 h-4 text-primary drop-shadow-[0_0_3px_hsl(152_100%_44%/0.4)]" />
              ) : isCurrent ? (
                <Circle className="w-4 h-4 text-primary fill-primary drop-shadow-[0_0_4px_hsl(152_100%_44%/0.5)]" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground/30" />
              )}
              <span
                className={`text-[9px] mt-0.5 whitespace-nowrap font-display ${
                  isCurrent ? "text-foreground font-semibold" : isPast ? "text-muted-foreground" : "text-muted-foreground/40"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getHireActionButtons(job: Job) {
  const buttons: { label: string; icon: typeof Play; href: string; variant: "default" | "outline" }[] = [];

  switch (job.status) {
    case "posted_public":
      buttons.push({ label: "View", icon: Search, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    case "accepted_pending_payment":
      buttons.push({ label: "Fund Job", icon: Lock, href: `/jobs/${job.id}`, variant: "default" });
      break;
    case "funded":
    case "active":
    case "in_progress":
      buttons.push({ label: "Track", icon: Play, href: `/jobs/${job.id}`, variant: "default" });
      break;
    case "proof_submitted":
      buttons.push({ label: "Review Proof", icon: Camera, href: `/jobs/${job.id}`, variant: "default" });
      break;
    case "completion_submitted":
    case "completed_paid":
      buttons.push({ label: "Details", icon: CheckCircle2, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    case "disputed":
      buttons.push({ label: "View Dispute", icon: ShieldAlert, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    default:
      buttons.push({ label: "View", icon: Search, href: `/jobs/${job.id}`, variant: "outline" });
  }
  return buttons;
}

function getWorkActionButtons(job: Job) {
  const buttons: { label: string; icon: typeof Play; href: string; variant: "default" | "outline" }[] = [];

  switch (job.status) {
    case "accepted_pending_payment":
      buttons.push({ label: "Awaiting Funding", icon: Clock, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    case "funded":
      buttons.push({ label: "Start Work", icon: Play, href: `/jobs/${job.id}`, variant: "default" });
      break;
    case "active":
    case "in_progress":
      buttons.push({ label: "Submit Proof", icon: Camera, href: `/jobs/${job.id}`, variant: "default" });
      break;
    case "proof_submitted":
      buttons.push({ label: "Proof Sent", icon: CheckCircle2, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    case "completion_submitted":
    case "completed_paid":
      buttons.push({ label: "Details", icon: CheckCircle2, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    case "disputed":
      buttons.push({ label: "View Dispute", icon: ShieldAlert, href: `/jobs/${job.id}`, variant: "outline" });
      break;
    default:
      buttons.push({ label: "View", icon: Search, href: `/jobs/${job.id}`, variant: "outline" });
  }
  return buttons;
}

function MyJobCard({ job, mode }: { job: Job; mode: Mode }) {
  const timeline = mode === "hire" ? STATUS_TIMELINE_HIRE : STATUS_TIMELINE_WORK;
  const actionButtons = mode === "hire" ? getHireActionButtons(job) : getWorkActionButtons(job);
  const totalPrice = (job.budget || 0) + (job.urgentFee || 0);

  return (
    <Card className="glass-card rounded-xl p-4 animate-fade-in" data-testid={`card-job-${job.id}`}>
      <StatusTimeline status={job.status} timeline={timeline} />

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-foreground text-[15px] leading-tight truncate">
            {job.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.category}
            {job.serviceType ? ` / ${job.serviceType}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {job.urgentSwitch && (
            <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-[10px]" data-testid={`badge-urgent-${job.id}`}>
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              Urgent
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] ${statusColors[job.status] || ""}`} data-testid={`badge-status-${job.id}`}>
            {job.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {job.jobDetails && Object.keys(job.jobDetails).length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-3" data-testid="highlights-checklist">
          {Object.entries(job.jobDetails).slice(0, 3).map(([key, value]) => {
            let displayValue = value;
            if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
              try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) displayValue = parsed[0] + (parsed.length > 1 ? ` +${parsed.length - 1}` : "");
              } catch {}
            } else if (Array.isArray(value)) {
              displayValue = value[0] + (value.length > 1 ? ` +${value.length - 1}` : "");
            }
            return (
              <Badge key={key} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal bg-secondary/30 border-secondary/10 text-muted-foreground truncate max-w-[100px]">
                <span className="font-bold mr-1 text-foreground/70">{key.replace(/_/g, ' ')}:</span> {String(displayValue)}
              </Badge>
            );
          })}
        </div>
      ) : job.description ? (
        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-2" data-testid="text-job-description">
          {job.description}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {totalPrice > 0 && (
            <span className="flex items-center gap-0.5 font-display font-semibold guber-text-green" data-testid={`text-price-${job.id}`}>
              <DollarSign className="w-3 h-3" />{totalPrice.toFixed(0)}
            </span>
          )}
          {(job.locationApprox || job.zip) && (
            <span className="flex items-center gap-0.5 truncate max-w-[120px]">
              <MapPin className="w-3 h-3" />{job.locationApprox || `${job.zip} area`}
            </span>
          )}
          {job.createdAt && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {new Date(job.createdAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {actionButtons.map((btn) => (
            <Link key={btn.label} href={btn.href}>
              <Button size="sm" variant={btn.variant} className="font-display text-xs" data-testid={`button-${btn.label.toLowerCase().replace(/\s+/g, "-")}-${job.id}`}>
                <btn.icon className="w-3.5 h-3.5 mr-1" />
                {btn.label}
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

function filterJobsForHireTab(jobs: Job[], tab: string, userId: number): Job[] {
  const posted = jobs.filter((j) => j.postedById === userId);

  switch (tab) {
    case "awaiting_payment":
      return posted.filter((j) => j.status === "draft");
    case "posted":
      return posted.filter((j) => ["posted_public", "accepted_pending_payment", "payment_pending"].includes(j.status));
    case "pending_confirm":
      return posted.filter((j) => j.status === "accepted_pending_payment");
    case "locked_in_progress":
      return posted.filter((j) => ["funded", "active", "in_progress"].includes(j.status));
    case "proof_submitted":
      return posted.filter((j) => j.status === "proof_submitted");
    case "completed":
      return posted.filter((j) => ["completion_submitted", "completed_paid"].includes(j.status));
    case "cancelled":
      return posted.filter((j) => j.status === "cancelled" || j.status === "canceled_by_hirer");
    case "disputed":
      return posted.filter((j) => j.status === "disputed");
    default:
      return [];
  }
}

function filterJobsForWorkTab(jobs: Job[], tab: string, userId: number): Job[] {
  const accepted = jobs.filter((j) => j.assignedHelperId === userId);

  switch (tab) {
    case "accepted_pending":
      return accepted.filter((j) => j.status === "accepted_pending_payment");
    case "locked_in_progress":
      return accepted.filter((j) => ["funded", "active", "in_progress"].includes(j.status));
    case "proof_needed":
      return accepted.filter((j) => j.status === "proof_submitted" || (j.status === "in_progress" && j.proofRequired));
    case "completed":
      return accepted.filter((j) => ["completion_submitted", "completed_paid"].includes(j.status));
    case "cancelled":
      return accepted.filter((j) => j.status === "cancelled" || j.status === "canceled_by_hirer");
    case "disputed":
      return accepted.filter((j) => j.status === "disputed");
    default:
      return [];
  }
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 animate-fade-in">
      <Briefcase className="w-12 h-12 text-muted-foreground/15 mx-auto mb-3" />
      <p className="text-muted-foreground font-display">{message}</p>
    </div>
  );
}

function JobList({ jobs, mode, isLoading }: { jobs: Job[]; mode: Mode; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return <EmptyState message="No jobs in this category" />;
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => (
        <MyJobCard key={job.id} job={job} mode={mode} />
      ))}
    </div>
  );
}

export default function MyJobs() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("hire");
  const { toast } = useToast();

  const confirmBarterMutation = useMutation({
    mutationFn: async ({ sessionId, jobId }: { sessionId: string; jobId: string }) => {
      const resp = await apiRequest("POST", "/api/jobs/confirm-payment", { sessionId, jobId });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-jobs"] });
      toast({ title: "Barter Job Posted!", description: "Your barter listing is now live." });
      window.history.replaceState({}, "", "/my-jobs");
    },
    onError: (err: any) => {
      toast({ title: "Error confirming payment", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const barterSessionId = params.get("barter_session_id");
    const barterJobId = params.get("barter_job_id");
    if (barterSessionId && barterJobId) {
      confirmBarterMutation.mutate({ sessionId: barterSessionId, jobId: barterJobId });
    }
  }, []);

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ["/api/my-jobs"],
  });

  const allJobs = jobs || [];
  const tabs = mode === "hire" ? HIRE_TABS : WORK_TABS;
  const defaultTab = mode === "hire" ? "posted" : "accepted_pending";

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-my-jobs">
        <div className="flex items-center justify-between gap-2 mb-5 flex-wrap animate-fade-in">
          <h1 className="text-xl font-display font-bold tracking-tight">My Jobs</h1>
          <div className="flex items-center gap-2">
            {mode === "hire" ? (
              <Link href="/post-job">
                <Button size="sm" className="font-display" data-testid="button-new-job">
                  <PlusCircle className="w-4 h-4 mr-1" /> Post
                </Button>
              </Link>
            ) : (
              <Link href="/browse-jobs">
                <Button size="sm" className="font-display" data-testid="button-find-jobs">
                  <Search className="w-4 h-4 mr-1" /> Find Jobs
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="premium-toggle mb-5 flex animate-fade-in" data-testid="mode-toggle">
          <button
            className={`premium-toggle-btn flex-1 py-2 text-sm font-display text-center ${mode === "hire" ? "active" : "text-muted-foreground"}`}
            onClick={() => setMode("hire")}
            data-testid="button-hire-mode"
          >
            Hire Mode
          </button>
          <button
            className={`premium-toggle-btn flex-1 py-2 text-sm font-display text-center ${mode === "work" ? "active" : "text-muted-foreground"}`}
            onClick={() => setMode("work")}
            data-testid="button-work-mode"
          >
            Work Mode
          </button>
        </div>

        <Tabs defaultValue={defaultTab} key={mode} className="w-full">
          <div className="overflow-x-auto -mx-4 px-4 mb-4">
            <TabsList className="glass-card premium-border w-max min-w-full">
              {tabs.map((tab) => {
                const count =
                  mode === "hire"
                    ? filterJobsForHireTab(allJobs, tab.value, user?.id || 0).length
                    : filterJobsForWorkTab(allJobs, tab.value, user?.id || 0).length;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="font-display text-xs whitespace-nowrap"
                    data-testid={`tab-${tab.value}`}
                  >
                    {tab.label}
                    {count > 0 && (
                      <span className="ml-1 text-[10px] guber-text-green font-semibold">({count})</span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {tabs.map((tab) => {
            const filtered =
              mode === "hire"
                ? filterJobsForHireTab(allJobs, tab.value, user?.id || 0)
                : filterJobsForWorkTab(allJobs, tab.value, user?.id || 0);
            return (
              <TabsContent key={tab.value} value={tab.value}>
                <JobList jobs={filtered} mode={mode} isLoading={isLoading} />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </GuberLayout>
  );
}
