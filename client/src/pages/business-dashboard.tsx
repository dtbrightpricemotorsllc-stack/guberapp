import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, FileText, Upload, ChevronRight, Eye, Briefcase, Search, CheckCircle2, CheckCircle, Shield, TrendingUp, DollarSign, Clock, AlertCircle, ShoppingBag } from "lucide-react";
import type { Job, BusinessProfile } from "@shared/schema";

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border/20 p-3 text-center">
      <p className="font-display font-black text-xl" style={{ color }}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground/40 font-display">{sub}</p>}
      <p className="text-[9px] font-display tracking-widest uppercase text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    posted_public: "bg-primary/10 text-primary border-primary/30",
    accepted_pending_payment: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    funded: "bg-secondary/10 text-secondary border-secondary/30",
    active: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    in_progress: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    completion_submitted: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    completed_paid: "bg-emerald-600/15 text-emerald-300 border-emerald-600/30",
    proof_submitted: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    disputed: "bg-destructive/10 text-destructive border-destructive/30",
    cancelled: "bg-muted/20 text-muted-foreground border-border/20",
    canceled_by_hirer: "bg-muted/20 text-muted-foreground border-border/20",
    expired: "bg-muted/20 text-muted-foreground border-border/20",
  };
  return map[status] || "bg-muted/20 text-muted-foreground border-border/20";
}

export default function BusinessDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchFilter, setSearchFilter] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery<BusinessProfile>({
    queryKey: ["/api/business/profile"],
    retry: false,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ["/api/business/jobs"],
    enabled: !!profile,
  });

  if (profileLoading) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </GuberLayout>
    );
  }

  if (!profile) {
    return (
      <GuberLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
          <Building2 className="w-12 h-12 text-muted-foreground/20 mx-auto" />
          <p className="font-display font-bold text-muted-foreground">No business profile found</p>
          <Link href="/business-onboarding">
            <Button className="font-display bg-primary text-primary-foreground" data-testid="button-setup-business">Set Up Business Account</Button>
          </Link>
        </div>
      </GuberLayout>
    );
  }

  const total = jobs?.length || 0;
  const completed = jobs?.filter((j) => j.status === "completion_submitted" || j.status === "completed_paid").length || 0;
  const inProgress = jobs?.filter((j) => ["in_progress", "active", "funded"].includes(j.status)).length || 0;
  const open = jobs?.filter((j) => j.status === "posted_public").length || 0;
  const expired = jobs?.filter((j) => j.status === "cancelled" || j.expiresAt && new Date(j.expiresAt) < new Date() && j.status === "posted_public").length || 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const totalSpend = jobs?.filter((j) => j.status === "completion_submitted" || j.status === "completed_paid").reduce((sum, j) => sum + (j.finalPrice || j.budget || 0), 0) || 0;

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        const loc = (j.location || "").toLowerCase();
        const zip = (j.zip || "").toLowerCase();
        const title = (j.title || "").toLowerCase();
        if (!loc.includes(q) && !zip.includes(q) && !title.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, statusFilter, searchFilter]);

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {profile.companyLogo ? (
              <img src={profile.companyLogo} className="w-10 h-10 rounded-xl object-cover border border-border/20" alt="logo" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-base" data-testid="text-company-name">{profile.companyName}</h1>
                {(profile as any).companyVerified && (
                  <Shield className="w-4 h-4 text-primary" title="Verified Company" data-testid="badge-verified-company" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/40 font-display">
                {(profile as any).industry || "Business"} Dashboard
              </p>
            </div>
          </div>
          <Link href="/business-onboarding">
            <button className="text-[10px] text-primary/60 hover:text-primary font-display tracking-wider transition-colors" data-testid="button-edit-profile">Edit</button>
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Total" value={total} color="hsl(152 100% 44%)" />
          <StatCard label="Done" value={completed} color="#22c55e" />
          <StatCard label="Rate" value={`${completionRate}%`} sub="completion" color="#60a5fa" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Active" value={inProgress} color="#a78bfa" />
          <StatCard label="Open" value={open} color="#f59e0b" />
          <StatCard label="Spend" value={`$${totalSpend.toFixed(0)}`} color="#34d399" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link href="/business-templates">
            <button className="w-full bg-card rounded-xl border border-border/20 p-4 text-left flex items-center gap-3 hover:border-primary/20 transition-colors" data-testid="button-templates">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-display font-semibold">Templates</p>
                <p className="text-[10px] text-muted-foreground/40">Inspection forms</p>
              </div>
            </button>
          </Link>
          <Link href="/business-bulk-post">
            <button className="w-full bg-card rounded-xl border border-border/20 p-4 text-left flex items-center gap-3 hover:border-primary/20 transition-colors" data-testid="button-bulk-post">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Upload className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-display font-semibold">Bulk Post</p>
                <p className="text-[10px] text-muted-foreground/40">Upload CSV</p>
              </div>
            </button>
          </Link>
          <Link href="/observations" className="col-span-2">
            <button className="w-full bg-card rounded-xl border border-border/20 p-4 text-left flex items-center gap-3 hover:border-indigo-500/20 transition-colors" data-testid="button-observation-marketplace">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-display font-semibold">Observation Marketplace</p>
                <p className="text-[10px] text-muted-foreground/40">Browse & purchase field observations</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 ml-auto" />
            </button>
          </Link>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground uppercase px-1">Jobs</p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
              <Input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search by city, zip, title…"
                className="pl-8 h-8 text-xs bg-card border-border/20"
                data-testid="input-job-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs bg-card border-border/20 w-28" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="posted_public">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completion_submitted">Completed</SelectItem>
                <SelectItem value="completed_paid">Paid</SelectItem>
                <SelectItem value="proof_submitted">Review</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {jobsLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
          ) : filteredJobs.length > 0 ? (
            <div className="space-y-2">
              {filteredJobs.slice(0, 50).map((job) => (
                <div
                  key={job.id}
                  className="bg-card rounded-xl border border-border/20 p-3 flex items-center gap-3 cursor-pointer hover:border-border/40 transition-colors"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  data-testid={`business-job-${job.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{job.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{job.location || ""}{job.zip ? ` · ${job.zip}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <p className="text-sm font-display font-bold text-primary">${job.budget || 0}</p>
                    <Badge variant="outline" className={`text-[9px] capitalize ${statusColor(job.status)}`}>
                      {job.status.replace(/_/g, " ")}
                    </Badge>
                    {["proof_submitted", "completion_submitted", "completed_paid"].includes(job.status) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                        className="text-[9px] font-display text-primary/70 hover:text-primary flex items-center gap-0.5"
                        data-testid={`button-view-proof-biz-${job.id}`}
                      >
                        <Eye className="w-3 h-3" /> View
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Briefcase className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-display">
                {total === 0 ? "No jobs posted yet" : "No jobs match your filters"}
              </p>
              {total === 0 && (
                <Link href="/business-bulk-post">
                  <Button size="sm" variant="outline" className="mt-3 font-display border-border/30 text-xs" data-testid="button-post-first-job">Post Your First Jobs</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </GuberLayout>
  );
}
