import { useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Shield, Clock, MapPin, Zap, ChevronRight, Search, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import propertySiteImg from "@assets/file_0000000010f471fd8230bcff69ab47cb_1772458042326.png";
import onlineItemsImg from "@assets/file_00000000bc5871f8b88e63dbfa6c16d2_1772458082754.png";
import wheelsWingsImg from "@assets/file_00000000a5947230b8561e43d9c81c1f_1772458107399.png";
import quickCheckImg from "@assets/file_000000001e2471f586eaaf945485317c_1772458167013.png";

const VI_CATEGORY_IMAGES: Record<string, string> = {
  "Property & Site Check": propertySiteImg,
  "Wheels, Wings & Water": wheelsWingsImg,
  "Online Items": onlineItemsImg,
  "Quick Check": quickCheckImg,
};

const VI_FILTERS = ["All", "Property & Site Check", "Wheels, Wings & Water", "Online Items", "Quick Check"];

type VIJob = {
  id: number;
  title: string;
  category: string;
  verifyInspectCategory: string | null;
  useCaseName: string | null;
  catalogServiceTypeName: string | null;
  budget: number | null;
  status: string;
  urgentSwitch: boolean;
  locationApprox: string | null;
  zip: string | null;
  createdAt: string | null;
  assignedHelperId: number | null;
  jobDetails: Record<string, string> | null;
};

export default function VIRequests() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [filter, setFilter] = useState("All");
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  const { data: jobs, isLoading } = useQuery<VIJob[]>({
    queryKey: ["/api/jobs"],
    select: (data) => {
      let filtered = (data as VIJob[]).filter(
        (j) => j.category === "Verify & Inspect" && j.status === "posted_public" && !j.assignedHelperId
      );
      if (filter !== "All") {
        filtered = filtered.filter((j) => j.verifyInspectCategory === filter);
      }
      return filtered;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setAcceptingId(jobId);
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/accept`, {});
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({ title: "Request accepted!", description: "Check My Jobs to get started." });
      navigate("/my-jobs");
    },
    onError: (err: any) => {
      toast({ title: "Could not accept", description: err.message, variant: "destructive" });
      setAcceptingId(null);
    },
  });

  function getCategoryImg(viCategory: string | null) {
    if (!viCategory) return null;
    return VI_CATEGORY_IMAGES[viCategory] ?? null;
  }

  return (
    <GuberLayout>
      <div className="flex flex-col min-h-full" data-testid="page-vi-requests">
        {/* Header */}
        <div className="relative px-4 pt-5 pb-4 shrink-0">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-8 -left-8 w-48 h-48 rounded-full opacity-[0.07]"
              style={{ background: "radial-gradient(circle, #a78bfa, transparent 70%)" }} />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => navigate("/verify-inspect")}
              className="w-8 h-8 rounded-xl glass-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1" />
            <button
              onClick={() => navigate("/verify-inspect")}
              className="h-8 px-3 rounded-xl font-display font-bold text-[10px] tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
              style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
              data-testid="button-post-request"
            >
              <Shield className="w-3.5 h-3.5" />
              POST A REQUEST
            </button>
          </div>

          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)" }}>
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-foreground tracking-tight leading-none">Open Requests</h1>
              <p className="text-[11px] text-muted-foreground font-display tracking-wider mt-0.5">VERIFY & INSPECT</p>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-4 pb-3 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {VI_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="shrink-0 h-8 px-3 rounded-full font-display font-bold text-[10px] tracking-wider transition-all"
                style={{
                  background: filter === f ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${filter === f ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.08)"}`,
                  color: filter === f ? "#a78bfa" : "#6b7280",
                }}
                data-testid={`filter-${f.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {f === "All" ? "ALL TYPES" : f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Requests list */}
        <div className="px-4 pb-6 flex-1">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <Shield className="w-7 h-7" style={{ color: "#a78bfa" }} />
              </div>
              <div className="text-center">
                <p className="font-display font-bold text-foreground">No open requests yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {filter !== "All" ? `No ${filter} requests open right now` : "Check back soon or post your own request"}
                </p>
              </div>
              <button
                onClick={() => navigate("/verify-inspect")}
                className="h-10 px-5 rounded-xl font-display font-bold text-xs tracking-wider"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}
              >
                POST A REQUEST
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] font-display text-muted-foreground tracking-widest uppercase">
                {jobs.length} open request{jobs.length !== 1 ? "s" : ""}
              </p>
              {jobs.map((job) => {
                const catImg = getCategoryImg(job.verifyInspectCategory);
                const isAccepting = acceptingId === job.id;
                return (
                  <div
                    key={job.id}
                    className="glass-card rounded-2xl overflow-hidden"
                    style={{ border: "1px solid rgba(139,92,246,0.12)" }}
                    data-testid={`card-vi-request-${job.id}`}
                  >
                    {catImg && (
                      <div className="relative h-20 overflow-hidden">
                        <img src={catImg} alt="" className="w-full h-full object-cover opacity-40" />
                        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 100%)" }} />
                        <div className="absolute inset-0 flex items-center px-4">
                          <div>
                            <p className="font-display font-black text-base text-white leading-tight">{job.title}</p>
                            {job.verifyInspectCategory && (
                              <p className="text-[10px] font-display font-bold tracking-widest mt-0.5" style={{ color: "#a78bfa" }}>
                                {job.verifyInspectCategory.toUpperCase()}
                              </p>
                            )}
                          </div>
                        </div>
                        {job.urgentSwitch && (
                          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(239,68,68,0.9)", border: "1px solid rgba(239,68,68,0.5)" }}>
                            <Zap className="w-2.5 h-2.5 text-white" />
                            <span className="text-[9px] font-display font-black text-white tracking-wider">URGENT</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="p-4">
                      {!catImg && (
                        <div className="mb-3">
                          <p className="font-display font-bold text-sm text-foreground">{job.title}</p>
                          {job.verifyInspectCategory && (
                            <p className="text-[10px] font-display font-bold tracking-widest mt-0.5" style={{ color: "#a78bfa" }}>
                              {job.verifyInspectCategory.toUpperCase()}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-3 flex-wrap mb-3">
                        <span className="font-display font-black text-xl" style={{ color: "#00e676" }}>
                          ${job.budget?.toFixed(0) ?? "?"}
                        </span>
                        {job.useCaseName && (
                          <Badge variant="outline" className="text-[10px] font-display" style={{ borderColor: "rgba(167,139,250,0.2)", color: "#a78bfa", background: "rgba(167,139,250,0.06)" }}>
                            {job.useCaseName}
                          </Badge>
                        )}
                        {job.catalogServiceTypeName && (
                          <Badge variant="outline" className="text-[10px] font-display text-muted-foreground">
                            {job.catalogServiceTypeName}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-display mb-4">
                        {job.locationApprox && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5" /> {job.locationApprox}
                          </span>
                        )}
                        {job.createdAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(job.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="flex-1 h-10 rounded-xl font-display font-bold text-xs tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9ca3af" }}
                          data-testid={`button-view-request-${job.id}`}
                        >
                          VIEW DETAILS
                        </button>
                        {user && user.id !== job.assignedHelperId && (
                          <button
                            onClick={() => acceptMutation.mutate(job.id)}
                            disabled={isAccepting || acceptMutation.isPending}
                            className="flex-1 h-10 rounded-xl font-display font-bold text-xs tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #4c1d95)", color: "#fff", border: "none" }}
                            data-testid={`button-accept-request-${job.id}`}
                          >
                            {isAccepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            TAKE THIS
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </GuberLayout>
  );
}
