import { useQuery, useMutation } from "@tanstack/react-query";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { useRoute } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { useAuth } from "@/lib/auth-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, DollarSign, AlertTriangle, User,
  CheckCircle, Star, ArrowLeft, Lock, Shield,
  ClipboardCheck, ThumbsUp, ThumbsDown, Image as ImageIcon,
  ShoppingBag, X, ChevronRight, Navigation, Car, MapPinned, Banknote,
  PhoneOff, Clock, Loader2, ShieldCheck, Search, Trophy, CameraOff,
  Camera, AlertCircle, ChevronDown, ChevronUp, TrendingUp, Handshake, Zap,
  Download, FileText, Award, Zap as ZapIcon,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Job, User as UserType, ProofSubmission, BountyAttempt } from "@shared/schema";

function toLocalDatetimeString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}
import { TrustBadge } from "@/components/trust-badge";
import { Link, useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusLabels: Record<string, string> = {
  draft: "Draft", posted_public: "Open", accepted_pending_payment: "Pending Payment",
  funded: "Funded", active: "Active", in_progress: "In Progress",
  completion_submitted: "Completed", completed_paid: "Paid",
  proof_submitted: "Proof Submitted", disputed: "Disputed",
  cancelled: "Cancelled", canceled_by_hirer: "Cancelled",
};

const statusColors: Record<string, string> = {
  draft: "bg-muted/50 text-muted-foreground border-border/30",
  posted_public: "bg-primary/15 text-primary border-primary/30",
  accepted_pending_payment: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  funded: "bg-secondary/15 text-secondary border-secondary/30",
  active: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completion_submitted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  completed_paid: "bg-emerald-600/20 text-emerald-300 border-emerald-600/30",
  proof_submitted: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  disputed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted/50 text-muted-foreground border-border/30",
  canceled_by_hirer: "bg-muted/50 text-muted-foreground border-border/30",
};

const CANCEL_REASONS = [
  "Emergency / personal issue",
  "Unable to reach location",
  "Job requirements differ from posting",
  "Scheduling conflict",
  "Safety concern",
  "Unforeseen circumstances",
  "Other",
];

const POSTER_CANCEL_REASONS = [
  "No longer need this done",
  "Found someone else",
  "Budget changed",
  "Scheduling conflict",
  "Emergency / personal issue",
  "Other",
];

export default function JobDetail() {
  const [, params] = useRoute("/jobs/:id");
  const { user } = useAuth();
  const { toast } = useToast();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellForm, setSellForm] = useState({ category: "", condition: "", price: "", askingType: "fixed" });
  const [, navigate] = useLocation();

  const [showNavModal, setShowNavModal] = useState(false);
  const [navUrls, setNavUrls] = useState<{ google: string | null; waze: string | null }>({ google: null, waze: null });

  const buildNavDestination = (j: any): string => {
    if (j.location && j.location.trim()) return encodeURIComponent(j.location.trim());
    if (j.lat && j.lng) return `${j.lat},${j.lng}`;
    return "";
  };

  const openGoogleMapsForJob = (j: any) => {
    const dest = buildNavDestination(j);
    if (!dest) return;
    if (!navigator.geolocation) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const origin = `${pos.coords.latitude},${pos.coords.longitude}`;
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}`, "_blank");
      },
      () => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, "_blank");
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const openWazeForJob = (j: any) => {
    const hasAddress = j.location?.trim();
    const hasCoords = j.lat && j.lng;
    if (!hasAddress && !hasCoords) return;
    const wazeUrl = hasAddress
      ? `waze://?q=${encodeURIComponent(j.location.trim())}&navigate=yes`
      : `waze://?ll=${j.lat},${j.lng}&navigate=yes`;
    window.open(wazeUrl, "_blank");
    setTimeout(() => openGoogleMapsForJob(j), 2000);
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", budget: "", location: "", zip: "", lat: null as number | null, lng: null as number | null });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [showPosterCancelModal, setShowPosterCancelModal] = useState(false);
  const [posterCancelReason, setPosterCancelReason] = useState("");
  const [posterCancelNote, setPosterCancelNote] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [categoryWaiverChecked, setCategoryWaiverChecked] = useState(false);

  // Bounty submission state
  const [showBountyForm, setShowBountyForm] = useState(false);
  const [bountyPhotos, setBountyPhotos] = useState<string[]>([]);
  const [bountyGps, setBountyGps] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [bountyCondition, setBountyCondition] = useState<"Intact" | "Damaged" | "Missing" | "">("");
  const [bountyNotes, setBountyNotes] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  // Bounty review state
  const [rejectingAttemptId, setRejectingAttemptId] = useState<number | null>(null);
  const [bountyRejectReason, setBountyRejectReason] = useState("");
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [selectedPayoutMode, setSelectedPayoutMode] = useState<"standard" | "early" | "instant">("standard");
  const [now, setNow] = useState(Date.now());
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableTo, setAvailableTo] = useState("");
  const [confirmedStartTime, setConfirmedStartTime] = useState("");
  

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const onboardMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", "/api/stripe/connect/onboard");
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => toast({ title: "Setup Failed", description: err.message, variant: "destructive" }),
  });

  const jobId = params?.id;

  const { data: job, isLoading } = useQuery<Job>({
    queryKey: ["/api/jobs", jobId],
    enabled: !!jobId,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const { data: poster } = useQuery<UserType>({
    queryKey: ["/api/users", String(job?.postedById)],
    enabled: !!job?.postedById,
  });

  const { data: assignedWorker } = useQuery<UserType>({
    queryKey: ["/api/users", String(job?.assignedHelperId)],
    enabled: !!job?.assignedHelperId,
  });

  const { data: proofs } = useQuery<ProofSubmission[]>({
    queryKey: ["/api/jobs", jobId, "proof"],
    enabled: !!jobId && !!job && (job.status === "proof_submitted" || job.status === "completion_submitted" || job.status === "completed_paid" || job.status === "disputed" || job.proofStatus === "rejected"),
  });

  const isHelperForPayoutQuery = job?.assignedHelperId === user?.id;
  const isPayoutEligible = (job as any)?.payoutStatus === "payout_eligible" || job?.status === "completed_paid";
  const { data: payoutOptions } = useQuery<{
    eligible: boolean;
    reason?: string;
    trustLevel: string;
    badges: string[];
    modes: ("standard" | "early" | "instant")[];
    amounts: { standard: number; early: number; instant: number };
    fees: { earlyCashoutFee: number; instantCashoutFee: number };
    payoutStatus: string;
  }>({
    queryKey: ["/api/jobs", jobId, "payout-options"],
    enabled: !!jobId && isHelperForPayoutQuery && isPayoutEligible,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const requestPayoutMutation = useMutation({
    mutationFn: async (mode: string) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/request-payout`, { mode });
      return resp.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId, "payout-options"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: "Payout Initiated!", description: data.message || "Your earnings are being sent to your payout account." });
    },
    onError: (err: any) => toast({ title: "Payout Failed", description: err.message, variant: "destructive" }),
  });

  const { data: workerInstructions } = useQuery<{
    template: { name: string; requiredPhotoCount: number; requiredVideo: boolean; videoDuration: string | null; geoRequired: boolean } | null;
    items: { label: string; instruction: string; mediaType: string; quantityRequired: number; geoRequired: boolean }[];
  }>({
    queryKey: ["/api/proof-requirements", job?.catalogServiceTypeName],
    enabled: !!job?.catalogServiceTypeName && job?.category === "Verify & Inspect",
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/proof-requirements?catalogServiceTypeName=${encodeURIComponent(job!.catalogServiceTypeName!)}`);
      return res.json();
    },
  });

  const { data: businessProfile } = useQuery<any>({
    queryKey: ["/api/business/profile"],
    retry: false,
    enabled: !!user,
  });
  const isBusinessUser = !!businessProfile;

  const { data: helperReliability } = useQuery<{
    jobsCompleted: number;
    completionRate: number;
    avgRating: number;
    reviewCount: number;
    avgResponseTimeMins: number;
  }>({
    queryKey: ["/api/users", String(job?.assignedHelperId), "reliability"],
    enabled: !!job?.assignedHelperId && isBusinessUser,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${job!.assignedHelperId}/reliability`);
      return res.json();
    },
  });

  const handleDownloadReport = async () => {
    if (!jobId) return;
    try {
      const res = await apiRequest("GET", `/api/jobs/${jobId}/report`);
      const data = await res.json();
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>GUBER Verification Report — Job #${data.jobId}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #111; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 28px; font-weight: 900; letter-spacing: -1px; }
  .badge { background: #22c55e; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1px; }
  h2 { font-size: 18px; margin: 24px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
  .field { margin-bottom: 12px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 2px; }
  .value { font-size: 14px; font-weight: 600; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .photos img { width: 160px; height: 120px; object-fit: cover; border-radius: 8px; border: 1px solid #ddd; }
  .disclaimer { font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; line-height: 1.5; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="logo">GUBER</div>
    <div style="font-size:12px;color:#666;margin-top:4px;">Verification Report</div>
  </div>
  <div style="text-align:right">
    <div class="badge">VERIFIED</div>
    <div style="font-size:11px;color:#666;margin-top:6px;">Report generated: ${new Date().toLocaleDateString()}</div>
  </div>
</div>

${data.company ? `<h2>Company</h2>
<div class="grid">
  <div class="field"><div class="label">Company</div><div class="value">${data.company.name || "—"}</div></div>
  <div class="field"><div class="label">Industry</div><div class="value">${data.company.industry || "—"}</div></div>
  ${data.company.contactPerson ? `<div class="field"><div class="label">Contact</div><div class="value">${data.company.contactPerson}</div></div>` : ""}
  ${data.company.verified ? `<div class="field"><div class="label">Status</div><div class="value" style="color:#22c55e">Verified Company</div></div>` : ""}
</div>` : ""}

<h2>Job Details</h2>
<div class="grid">
  <div class="field"><div class="label">Job ID</div><div class="value">#${data.jobId}</div></div>
  <div class="field"><div class="label">Category</div><div class="value">${data.category || "—"}</div></div>
  <div class="field"><div class="label">Title</div><div class="value">${data.title || "—"}</div></div>
  <div class="field"><div class="label">Service Type</div><div class="value">${data.serviceType || "—"}</div></div>
  <div class="field"><div class="label">Location</div><div class="value">${data.location || "—"}</div></div>
  <div class="field"><div class="label">ZIP</div><div class="value">${data.zip || "—"}</div></div>
  <div class="field"><div class="label">Completed</div><div class="value">${data.completedAt ? new Date(data.completedAt).toLocaleString() : "—"}</div></div>
  <div class="field"><div class="label">Payout</div><div class="value">$${data.finalPrice || data.budget || 0}</div></div>
  ${data.lat && data.lng ? `<div class="field"><div class="label">GPS</div><div class="value">${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}</div></div>` : ""}
  ${data.taskTier ? `<div class="field"><div class="label">Task Tier</div><div class="value">${data.taskTier}</div></div>` : ""}
</div>
${data.description ? `<div class="field"><div class="label">Description</div><div class="value" style="font-weight:400;line-height:1.5">${data.description}</div></div>` : ""}

${data.helper ? `<h2>Helper</h2>
<div class="grid">
  <div class="field"><div class="label">Name</div><div class="value">${data.helper.name || "—"}</div></div>
  <div class="field"><div class="label">GUBER ID</div><div class="value">${data.helper.guberId || "—"}</div></div>
  <div class="field"><div class="label">Rating</div><div class="value">${data.helper.rating ? data.helper.rating.toFixed(1) + " / 5" : "—"}</div></div>
  <div class="field"><div class="label">Jobs Completed</div><div class="value">${data.helper.jobsCompleted || 0}</div></div>
</div>` : ""}

${data.proofs && data.proofs.length > 0 ? `<h2>Proof Photos</h2>
<div class="photos">
  ${data.proofs.map((p: any) => p.photoUrls?.map((url: string) => `<img src="${url}" alt="proof" />`).join("") || "").join("")}
</div>` : ""}

<div class="disclaimer">
  <strong>Legal Disclaimer:</strong> This GUBER Verification Report is generated automatically based on gig worker submissions. GUBER makes no warranty as to the accuracy, completeness, or fitness for any particular purpose of the information contained herein. This report documents the condition of the subject at the time of the gig worker visit only and may not reflect current conditions. GPS metadata is provided for informational purposes only. This report does not constitute a professional appraisal, inspection, or legal document. GUBER and its affiliates shall not be liable for any decisions made based on this report.
</div>

<div class="no-print" style="margin-top:24px;text-align:center">
  <button onclick="window.print()" style="background:#111;color:white;border:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:1px">PRINT / SAVE AS PDF</button>
</div>
</body>
</html>`);
      win.document.close();
    } catch (err: any) {
      toast({ title: "Report Error", description: err.message, variant: "destructive" });
    }
  };

  const action = (endpoint: string) => useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/${endpoint}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Success" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const acceptMutation = useMutation({
    mutationFn: ({ waiverAccepted, categoryWaiverAccepted, availableFrom: af, availableTo: at }: { waiverAccepted: boolean; categoryWaiverAccepted: boolean; availableFrom: string; availableTo: string }) =>
      apiRequest("POST", `/api/jobs/${jobId}/accept`, { waiverAccepted, categoryWaiverAccepted, availableFrom: af, availableTo: at }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      setShowWaiverModal(false);
      setWaiverChecked(false);
      setCategoryWaiverChecked(false);
      setAvailableFrom("");
      setAvailableTo("");
      toast({ title: "Applied!", description: "Waiting for the poster to confirm and pay." });
    },
    onError: (err: any) => {
      setShowWaiverModal(false);
      if (err.message?.includes("ID_REQUIRED")) {
        toast({ title: "ID Required", description: "You must verify your ID to accept jobs. Go to Profile → Trust & Credentials.", variant: "destructive" });
      } else if (err.message === "STRIPE_CONNECT_REQUIRED") {
        // Handled by the conditional UI below
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
  });

  const lockMutation = useMutation({
    mutationFn: async (startTime?: string) => {
      const body: any = {};
      if (startTime) body.confirmedStartTime = startTime;
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/lock`, body);
      return resp.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.locked) {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
        toast({ title: "Job Locked!", description: "Your helper has been notified." });
      }
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const needMoreTimeMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/need-more-time`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Worker Notified", description: "The worker has been told you need more time." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const confirmLockMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/confirm-lock-payment`, { sessionId });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Payment Confirmed!", description: "Job locked. Your helper is on the way." });
      window.history.replaceState({}, "", `/jobs/${jobId}`);
    },
    onError: (err: any) => toast({ title: "Payment error", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lockSessionId = params.get("lock_session_id");
    if (lockSessionId && jobId) {
      confirmLockMutation.mutate(lockSessionId);
    }
  }, [jobId]);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/confirm`);
      return resp.json();
    },
    onSuccess: (updatedJob: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      if (updatedJob?.status === "completion_submitted") {
        toast({
          title: "Job Complete!",
          description: isOwner
            ? "Both sides confirmed. Payment is being released to the worker."
            : "Both sides confirmed. Your payout is being processed.",
        });
      } else {
        toast({
          title: "Confirmation Received",
          description: isOwner
            ? "Confirmed! Waiting for the worker to also confirm."
            : "Confirmed! Waiting for the poster to confirm — your payout releases once both sides agree.",
        });
      }
    },
    onError: (err: any) => toast({ title: "Confirm Failed", description: err.message, variant: "destructive" }),
  });
  const disputeMutation = action("dispute");

  const rejectProofMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/reject-proof`, { feedback: rejectFeedback }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      setShowRejectDialog(false);
      setRejectFeedback("");
      toast({ title: "Proof Rejected", description: "The worker has been notified and can resubmit." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const escalateMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${jobId}/escalate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({ title: "Escalated to Admin", description: "GUBER will review and resolve the dispute." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const posterCancelMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/cancel/poster`, {
        note: posterCancelReason + (posterCancelNote ? ` — ${posterCancelNote}` : ""),
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      setShowPosterCancelModal(false);
      setPosterCancelReason("");
      setPosterCancelNote("");
      toast({ title: "Job Cancelled", description: "This job has been cancelled." });
      navigate("/my-jobs");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const milestoneMutation = useMutation({
    mutationFn: async (data: { statusType: string; gpsLat?: number; gpsLng?: number; cancelReason?: string; cancelStage?: string; cancelNotes?: string }) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/milestone`, data);
      return resp.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      if (vars.statusType === "on_the_way") {
        setNavUrls(data.navigationUrls || { google: null, waze: null });
        setShowNavModal(true);
        toast({ title: "On The Way!", description: "GPS logged. Launch navigation below." });
      } else if (vars.statusType === "arrived") {
        toast({ title: "Arrival Logged", description: "The poster has been notified you arrived." });
      } else if (vars.statusType === "cancelled") {
        setShowCancelModal(false);
        toast({ title: "Cancelled", description: "Job re-opened for other helpers." });
        navigate("/browse-jobs");
      }
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/reviews", {
      jobId: Number(jobId),
      revieweeId: user?.id === job?.postedById ? job?.assignedHelperId : job?.postedById,
      rating: reviewRating,
      comment: reviewComment,
    }),
    onSuccess: () => {
      setReviewSubmitted(true);
      const revieweeName = user?.id === job?.postedById
        ? (job as any)?.helperUsername || "the worker"
        : (job as any)?.posterUsername || "the poster";
      toast({ title: "Review Submitted!", description: `Your review for ${revieweeName} has been saved.` });
      setTimeout(() => navigate("/jobs"), 1400);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Bounty mutations and queries
  const { data: bountyAttempts, refetch: refetchAttempts } = useQuery<(BountyAttempt & { helperUsername: string; helperTier: string })[]>({
    queryKey: ["/api/jobs", jobId, "bounty-attempts"],
    enabled: !!jobId && !!job?.isBounty && !!user && user.id === job?.postedById,
  });

  const bountySubmitMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/bounty-submit`, {
        proofPhotos: bountyPhotos,
        proofGps: bountyGps,
        partConditionTag: bountyCondition,
        helperNotes: bountyNotes,
      });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      setShowBountyForm(false);
      setBountyPhotos([]);
      setBountyCondition("");
      setBountyNotes("");
      toast({ title: "Proof Submitted!", description: "The poster will review and notify you of the decision." });
    },
    onError: (err: any) => toast({ title: "Submission Failed", description: err.message, variant: "destructive" }),
  });

  const bountyApproveMutation = useMutation({
    mutationFn: async (attemptId: number) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/bounty-approve/${attemptId}`);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      refetchAttempts();
      toast({ title: "Approved!", description: "Proof approved. Payout processing." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const bountyRejectMutation = useMutation({
    mutationFn: async ({ attemptId, reason }: { attemptId: number; reason: string }) => {
      const resp = await apiRequest("POST", `/api/jobs/${jobId}/bounty-reject/${attemptId}`, { reason });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      refetchAttempts();
      setRejectingAttemptId(null);
      setBountyRejectReason("");
      toast({ title: "Rejected", description: "Helper has been notified." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  function captureGps() {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBountyGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGpsLoading(false);
        toast({ title: "Location Captured", description: `Accuracy: ±${Math.round(pos.coords.accuracy)}m` });
      },
      () => {
        setGpsLoading(false);
        toast({ title: "GPS Error", description: "Could not capture location. Please enable location access.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleBountyPhotoCapture(index: number, file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target?.result as string;
      setBountyPhotos(prev => {
        const next = [...prev];
        next[index] = b64;
        return next;
      });
    };
    reader.readAsDataURL(file);
  }

  const fromVIMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/marketplace/from-vi/${jobId}`, {
      category: sellForm.category || "Other",
      condition: sellForm.condition || null,
      price: sellForm.price ? parseFloat(sellForm.price) : null,
      askingType: sellForm.askingType,
    }),
    onSuccess: () => {
      toast({ title: "Listed in Marketplace!", description: "Your verified item is now live with GUBER Verified badge." });
      setShowSellModal(false);
      navigate("/marketplace");
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (data: any) => {
      const resp = await apiRequest("PATCH", `/api/jobs/${jobId}`, data);
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      setShowEditModal(false);
      toast({ title: "Post updated!" });
    },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("DELETE", `/api/jobs/${jobId}`);
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: "Post deleted" });
      navigate("/browse-jobs");
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const handleOnMyWay = () => {
    if (!navigator.geolocation) {
      milestoneMutation.mutate({ statusType: "on_the_way" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        milestoneMutation.mutate({
          statusType: "on_the_way",
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
        });
      },
      () => {
        milestoneMutation.mutate({ statusType: "on_the_way" });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleArrived = () => {
    if (!navigator.geolocation) {
      milestoneMutation.mutate({ statusType: "arrived" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        milestoneMutation.mutate({
          statusType: "arrived",
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
        });
      },
      () => {
        milestoneMutation.mutate({ statusType: "arrived" });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCancel = () => {
    if (!cancelReason) {
      toast({ title: "Select a reason", description: "Please select a cancellation reason.", variant: "destructive" });
      return;
    }
    milestoneMutation.mutate({
      statusType: "cancelled",
      cancelReason,
      cancelNotes,
    });
  };

  if (isLoading) {
    return <GuberLayout><div className="max-w-lg mx-auto px-4 py-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-48" /></div></GuberLayout>;
  }

  if (!job) {
    return <GuberLayout><div className="text-center py-20 text-muted-foreground font-display">Job not found</div></GuberLayout>;
  }

  const isOwner = user?.id === job.postedById;
  const isHelper = user?.id === job.assignedHelperId;
  const isLockedOrBeyond = ["funded", "active", "in_progress", "completion_submitted", "completed_paid", "proof_submitted"].includes(job.status);
  const isVIJob = job.category === "Verify & Inspect";
  const isBountyJob = !!(job as any).isBounty;
  const isPAVJob = isBountyJob && isVIJob;
  const showClipboard = isHelper && ["funded", "active", "in_progress", "proof_submitted"].includes(job.status);
  const showProofReview = isOwner && (job.status === "proof_submitted" || (job.proofStatus === "submitted" && job.status === "in_progress"));

  const isActiveJob = isHelper && ["funded", "active", "in_progress"].includes(job.status);
  const helperStage = (job as any).helperStage as string | null;
  const showOnMyWay = isActiveJob && !helperStage;
  const showArrived = isActiveJob && helperStage === "on_the_way";
  const canEditDelete = isOwner && ["posted_public", "draft"].includes(job.status);

  return (
    <GuberLayout>
      <div className="max-w-lg mx-auto px-4 py-6" data-testid="page-job-detail">
        <div className="flex items-center justify-between mb-3">
          <Link href="/browse-jobs">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground px-0">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          {canEditDelete && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-border/30 gap-1.5"
                onClick={() => {
                  setEditForm({
                    title: job.title || "",
                    description: job.description || "",
                    budget: String(job.budget ?? ""),
                    location: job.location || "",
                    zip: (job as any).zip || "",
                    lat: (job as any).lat || null,
                    lng: (job as any).lng || null,
                  });
                  setShowEditModal(true);
                }}
                data-testid="button-edit-job"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 gap-1.5"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-job"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                Delete
              </Button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border/20 p-5 mb-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <h1 className="text-lg font-display font-bold text-foreground" data-testid="text-job-title">{job.title}</h1>
            {job.urgentSwitch && (
              <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 shrink-0 text-[10px]">
                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Urgent
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Badge variant="outline" className="text-[11px] bg-muted/50 border-border/30">{job.category}</Badge>
            {job.serviceType && <Badge variant="outline" className="text-[11px] bg-muted/50 border-border/30">{job.serviceType}</Badge>}
            <Badge variant="outline" className={`text-[11px] ${statusColors[job.status] || ""}`} data-testid="badge-status">
              {statusLabels[job.status] || job.status}
            </Badge>
            {job.isBoosted && (
              <Badge variant="outline" className="text-[11px] bg-amber-500/15 text-amber-400 border-amber-500/30" data-testid="badge-boosted">
                <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> Boosted
              </Badge>
            )}
            {helperStage && isHelper && (
              <Badge variant="outline" className="text-[11px] bg-blue-500/15 text-blue-400 border-blue-500/30">
                {helperStage === "on_the_way" && <><Navigation className="w-2.5 h-2.5 mr-0.5" /> On The Way</>}
                {helperStage === "arrived" && <><MapPinned className="w-2.5 h-2.5 mr-0.5" /> Arrived</>}
              </Badge>
            )}
          </div>

          {job.jobDetails && Object.keys(job.jobDetails).length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4 bg-muted/30 rounded-xl p-4 border border-border/10" data-testid="section-job-details">
              {Object.entries(job.jobDetails).map(([key, value]) => {
                let displayValue: any = value;
                let isArray = false;
                try {
                  if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                      displayValue = parsed;
                      isArray = true;
                    }
                  } else if (Array.isArray(value)) {
                    isArray = true;
                  }
                } catch (e) {
                  // Not JSON, use as is
                }

                return (
                  <div key={key} className="flex flex-col min-w-0" data-testid={`detail-item-${key.toLowerCase().replace(/\s+/g, '-')}`}>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">{key.replace(/_/g, ' ')}</span>
                    <div className="text-sm font-medium text-foreground truncate">
                      {isArray && Array.isArray(displayValue) ? (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {displayValue.map((v, i) => (
                            <Badge key={i} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-normal bg-secondary/50 border-secondary/20">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        String(displayValue)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {job.description && (
            <div className="mb-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Additional Notes</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed" data-testid="text-job-description">
                {job.description}
              </p>
            </div>
          )}

          {isVIJob && workerInstructions && workerInstructions.items.length > 0 && (
            <div className="mb-4 rounded-xl p-4 space-y-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)" }} data-testid="worker-instructions-section">
              <p className="text-[10px] text-green-400/90 uppercase tracking-wider font-display font-bold flex items-center gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5" /> Worker Instructions
              </p>
              <div className="space-y-2">
                {workerInstructions.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-green-400/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-display font-bold text-green-400">{i + 1}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-display font-semibold">{item.label}</p>
                      {item.instruction && <p className="text-[10px] text-muted-foreground/70">{item.instruction}</p>}
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[9px] text-muted-foreground/50">{item.mediaType === "video" ? "Video" : "Photo"}{item.quantityRequired > 1 ? ` x${item.quantityRequired}` : ""}</span>
                        {item.geoRequired && <span className="text-[9px] text-green-400/60 flex items-center gap-0.5"><MapPinned className="w-2.5 h-2.5" /> GPS</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {workerInstructions.template && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-green-400/10 text-[9px]">
                  {workerInstructions.template.requiredPhotoCount > 0 && (
                    <Badge variant="secondary" className="text-[9px] gap-1"><Camera className="w-2.5 h-2.5" />{workerInstructions.template.requiredPhotoCount} photos total</Badge>
                  )}
                  {workerInstructions.template.requiredVideo && (
                    <Badge variant="secondary" className="text-[9px] gap-1">Video required</Badge>
                  )}
                  {workerInstructions.template.geoRequired && (
                    <Badge variant="secondary" className="text-[9px] gap-1"><MapPinned className="w-2.5 h-2.5" />GPS verification</Badge>
                  )}
                </div>
              )}
            </div>
          )}

          {job.category === "Barter Labor" && ((job as any).barterNeed || (job as any).barterOffering || (job as any).barterEstimatedValue) && (
            <div className="mb-4 rounded-xl p-4 space-y-3" style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.18)" }} data-testid="section-barter-details">
              <p className="text-[10px] uppercase tracking-wider font-display font-bold flex items-center gap-1.5" style={{ color: "#14B8A6" }}>
                <Handshake className="w-3.5 h-3.5" /> Barter Exchange
              </p>
              {(job as any).barterNeed && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Need</p>
                  <p className="text-sm text-foreground/90 leading-relaxed" data-testid="text-barter-need-detail">{(job as any).barterNeed}</p>
                </div>
              )}
              {(job as any).barterOffering && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Offering</p>
                  <p className="text-sm text-foreground/90 leading-relaxed" data-testid="text-barter-offering-detail">{(job as any).barterOffering}</p>
                </div>
              )}
              {(job as any).barterEstimatedValue && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Estimated Value</p>
                  <p className="text-sm font-display font-semibold" style={{ color: "#14B8A6" }} data-testid="text-barter-value-detail">{(job as any).barterEstimatedValue}</p>
                </div>
              )}
              {((job as any).estimatedMinutes || (job as any).estimatedDurationHours) && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1">Estimated Time</p>
                  <p className="text-sm font-display font-semibold flex items-center gap-1" style={{ color: "#14B8A6" }} data-testid="text-barter-time-detail">
                    <Clock className="w-3.5 h-3.5" />
                    {(job as any).estimatedMinutes
                      ? ((job as any).estimatedMinutes < 60
                        ? `${(job as any).estimatedMinutes} min`
                        : `${((job as any).estimatedMinutes / 60).toFixed(1).replace(/\.0$/, '')} hr`)
                      : `${(job as any).estimatedDurationHours} hr`}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            {job.budget != null && job.budget > 0 && (
              <div className="bg-background rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Budget</p>
                <p className="text-lg font-display font-bold guber-text-green flex items-center gap-0.5">
                  <DollarSign className="w-4 h-4" />{job.budget}
                </p>
                {(job as any).autoIncreaseEnabled && (
                  <div className="mt-1.5 space-y-0.5" data-testid="auto-increase-detail-badge">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] text-emerald-400 font-display">
                        +${(job as any).autoIncreaseAmount} every {
                          (job as any).autoIncreaseIntervalMins < 60
                            ? `${(job as any).autoIncreaseIntervalMins}m`
                            : (job as any).autoIncreaseIntervalMins === 60
                              ? "1hr"
                              : `${(job as any).autoIncreaseIntervalMins / 60}hr`
                        } up to ${(job as any).autoIncreaseMax}
                      </span>
                    </div>
                    {(job as any).nextIncreaseAt && (() => {
                      const nextAt = new Date((job as any).nextIncreaseAt);
                      const mins = Math.max(0, Math.round((nextAt.getTime() - Date.now()) / 60000));
                      const timeStr = mins < 60 ? `~${mins} min` : `~${Math.round(mins / 60)} hr`;
                      return (
                        <p className="text-[9px] text-emerald-400/60 font-display pl-4">
                          Next: +${(job as any).autoIncreaseAmount} in {timeStr}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            {((job as any).estimatedMinutes || (job as any).estimatedDurationHours) && (
              <div className="bg-background rounded-xl p-3">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Est. Time</p>
                <p className="text-sm font-display font-bold flex items-center gap-1" data-testid="text-estimated-time-detail">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  {(job as any).estimatedMinutes
                    ? ((job as any).estimatedMinutes < 60
                      ? `${(job as any).estimatedMinutes} min`
                      : `${((job as any).estimatedMinutes / 60).toFixed(1).replace(/\.0$/, '')} hr`)
                    : `${(job as any).estimatedDurationHours} hr`}
                </p>
              </div>
            )}
            <div className="bg-background rounded-xl p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Location</p>
              {isLockedOrBeyond && (isOwner || isHelper) ? (
                <p className="text-sm flex items-center gap-1"><MapPin className="w-3 h-3" />{job.location || "N/A"}</p>
              ) : (
                <p className="text-sm flex items-center gap-1 text-muted-foreground">
                  <Lock className="w-3 h-3" />{(job as any).locationApprox || job.zip || "Locked"}
                </p>
              )}
            </div>
          </div>

          {!isLockedOrBeyond && !isOwner && (
            <div className="bg-background rounded-xl p-3 border border-border/20 flex items-start gap-2 mb-4">
              <Shield className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground">
                Exact address is revealed only after the buyer confirms and locks the job with you.
              </p>
            </div>
          )}

          {poster && (
            <div className="pt-3 border-t border-border/20">
              <p className="text-[10px] font-display font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Posted By</p>
              <Link href={`/profile/${job.postedById}`}>
                <div className="flex items-center gap-3 rounded-xl p-2.5 -mx-1 transition-all hover:bg-white/[0.03] active:scale-[0.98] cursor-pointer" data-testid="link-poster-profile">
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden shrink-0 ring-2 ring-border/20">
                    {(poster as any).profilePhoto ? (
                      <img src={(poster as any).profilePhoto} alt="Poster" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {isLockedOrBeyond
                        ? ((poster as any).publicUsername ? `@${(poster as any).publicUsername}` : ((poster as any).guberId || "GUBER Member"))
                        : ((poster as any).guberId || "GUBER Member")}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <TrustBadge tier={poster.tier} />
                      {poster.rating != null && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {poster.rating.toFixed(1)}
                          {(poster as any).reviewCount > 0 && (
                            <span className="text-muted-foreground/50">({(poster as any).reviewCount})</span>
                          )}
                        </span>
                      )}
                      {(poster as any).idVerified && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-display font-bold">
                          <Shield className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                    {(poster as any).jobsCompleted > 0 && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{(poster as any).jobsCompleted} jobs completed</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                </div>
              </Link>
            </div>
          )}

          {isOwner && ["accepted_pending_payment", "funded", "active", "in_progress"].includes(job.status) && (
            <div className="pt-2">
              <Button
                variant="outline"
                onClick={() => setShowPosterCancelModal(true)}
                className="w-full h-9 font-display tracking-wider rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
                data-testid="button-poster-cancel"
              >
                <X className="w-3.5 h-3.5 mr-1.5" /> CANCEL THIS JOB
              </Button>
            </div>
          )}
        </div>

        {showClipboard && (
          <Link href={`/worker-clipboard/${jobId}`}>
            <Button
              className="w-full h-12 font-display tracking-wider bg-secondary text-secondary-foreground rounded-xl mb-4 hover-elevate active-elevate-2"
              data-testid="button-open-clipboard"
            >
              <ClipboardCheck className="w-5 h-5 mr-2" /> OPEN MISSION CLIPBOARD
            </Button>
          </Link>
        )}

        {isActiveJob && (
          <div className="mb-4 space-y-2" data-testid="section-helper-milestone-actions">
            {showOnMyWay && (
              <Button
                onClick={handleOnMyWay}
                disabled={milestoneMutation.isPending}
                className="w-full h-12 font-display tracking-wider rounded-xl text-white font-bold"
                style={{ background: "linear-gradient(135deg, #2563eb, #1d4ed8)" }}
                data-testid="button-on-my-way"
              >
                {milestoneMutation.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Navigation className="w-5 h-5 mr-2" />
                )}
                I'M ON MY WAY
              </Button>
            )}

            {showArrived && (
              <Button
                onClick={handleArrived}
                disabled={milestoneMutation.isPending}
                className="w-full h-12 font-display tracking-wider rounded-xl text-white font-bold"
                style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
                data-testid="button-arrived"
              >
                {milestoneMutation.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <MapPinned className="w-5 h-5 mr-2" />
                )}
                I'VE ARRIVED
              </Button>
            )}

            {isActiveJob && ((job as any).lat || job.location) && (
              <div className="space-y-2 pt-1" data-testid="section-navigation">
                <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/40 uppercase px-1">Get Directions</p>
                {job.location && (
                  <p className="text-xs text-muted-foreground/60 px-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 shrink-0" /> {job.location}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openGoogleMapsForJob(job)}
                    className="flex items-center gap-2.5 p-3 rounded-2xl transition-all active:scale-[0.97]"
                    style={{ background: "rgba(66,133,244,0.10)", border: "1px solid rgba(66,133,244,0.22)" }}
                    data-testid="link-google-maps"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(66,133,244,0.18)" }}>
                      <Navigation className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-display font-bold text-blue-400 truncate">Google Maps</p>
                      <p className="text-[10px] text-muted-foreground/50">Directions</p>
                    </div>
                  </button>
                  <button
                    onClick={() => openWazeForJob(job)}
                    className="flex items-center gap-2.5 p-3 rounded-2xl transition-all active:scale-[0.97]"
                    style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
                    data-testid="link-waze"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.14)" }}>
                      <Car className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-display font-bold text-emerald-400 truncate">Waze</p>
                      <p className="text-[10px] text-muted-foreground/50">Live traffic</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => setShowCancelModal(true)}
              className="w-full h-10 font-display tracking-wider rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
              data-testid="button-helper-cancel"
            >
              <PhoneOff className="w-3.5 h-3.5 mr-1.5" /> CANCEL THIS JOB
            </Button>
          </div>
        )}

        {showProofReview && proofs && proofs.length > 0 && (
          <div className="bg-card rounded-2xl border border-border/20 p-5 mb-4 space-y-4">
            <div>
              <h3 className="font-display font-semibold text-sm flex items-center gap-2" data-testid="text-proof-review-header">
                <ImageIcon className="w-4 h-4 text-primary" /> Worker Proof Submitted
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Review the photos and info below. Approve if satisfied — or send it back with feedback.</p>
            </div>
            {proofs.map((proof) => {
              let images: string[] = [];
              try {
                if (proof.imageUrls) {
                  images = JSON.parse(proof.imageUrls);
                }
              } catch {
                if (proof.imageUrls) images = [proof.imageUrls];
              }
              return (
                <div key={proof.id} className="bg-background rounded-xl p-4 space-y-3" data-testid={`card-proof-${proof.id}`}>
                  {proof.notEncountered && (
                    <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-[10px]">
                      <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Not Encountered
                      {proof.notEncounteredReason && ` - ${proof.notEncounteredReason}`}
                    </Badge>
                  )}
                  {images.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {images.map((img, i) => (
                        <div key={i} className="w-24 h-24 rounded-xl overflow-hidden border border-border/20">
                          <img src={img} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-proof-${proof.id}-${i}`} />
                        </div>
                      ))}
                    </div>
                  )}
                  {(proof.gpsLat != null && proof.gpsLng != null) && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-gps-${proof.id}`}>
                      <MapPin className="w-3 h-3" /> {proof.gpsLat.toFixed(5)}, {proof.gpsLng.toFixed(5)}
                    </p>
                  )}
                  {proof.notes && (
                    <p className="text-xs text-muted-foreground" data-testid={`text-notes-${proof.id}`}>{proof.notes}</p>
                  )}
                </div>
              );
            })}

            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
                className="flex-1 h-11 font-display tracking-wider rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                data-testid="button-approve-proof"
              >
                <ThumbsUp className="w-4 h-4 mr-2" /> WORK IS DONE ✓
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(true)}
                className="flex-1 h-11 font-display tracking-wider border-destructive/40 text-destructive rounded-xl hover:bg-destructive/10"
                data-testid="button-not-satisfied"
              >
                <ThumbsDown className="w-4 h-4 mr-2" /> NOT SATISFIED
              </Button>
            </div>
          </div>
        )}

        {isHelper && job.status === "in_progress" && job.proofStatus === "rejected" && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 mb-4 space-y-3" data-testid="card-proof-rejected">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0 mt-0.5">
                <ThumbsDown className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-display font-bold text-destructive">Proof Not Accepted</p>
                <p className="text-xs text-muted-foreground mt-0.5">The poster reviewed your submission and wasn't satisfied. You can fix it and resubmit — or request admin review if you believe the work was done correctly.</p>
              </div>
            </div>
            {proofs && proofs.length > 0 && (
              <div className="bg-background/50 rounded-xl p-3 space-y-2">
                <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Your Submitted Proof</p>
                {proofs.map((proof) => {
                  let images: string[] = [];
                  try { if (proof.imageUrls) images = JSON.parse(proof.imageUrls); } catch { if (proof.imageUrls) images = [proof.imageUrls]; }
                  return images.length > 0 ? (
                    <div key={proof.id} className="flex gap-2 flex-wrap">
                      {images.map((img, i) => (
                        <div key={i} className="w-20 h-20 rounded-xl overflow-hidden border border-border/20">
                          <img src={img} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" data-testid={`img-rejected-proof-${proof.id}-${i}`} />
                        </div>
                      ))}
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <div className="flex gap-3">
              <Link href={`/worker-clipboard/${jobId}`} className="flex-1">
                <Button className="w-full h-11 font-display tracking-wider rounded-xl" data-testid="button-resubmit-proof">
                  <ClipboardCheck className="w-4 h-4 mr-2" /> RESUBMIT PROOF
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => escalateMutation.mutate()}
                disabled={escalateMutation.isPending}
                className="flex-1 h-11 font-display tracking-wider text-xs border-destructive/40 text-destructive rounded-xl hover:bg-destructive/10"
                data-testid="button-escalate-dispute"
              >
                <Shield className="w-4 h-4 mr-2" /> REQUEST ADMIN REVIEW
              </Button>
            </div>
          </div>
        )}

        {/* ── BOUNTY VERIFIED RESULT BANNER (T015) ──────────────────────────── */}
        {isPAVJob && (job.status === "completion_submitted" || job.status === "completed_paid") && (
          <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "linear-gradient(135deg, rgba(0,180,80,0.12), rgba(0,80,200,0.08))", border: "1.5px solid rgba(0,180,80,0.3)" }}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(0,180,80,0.15)" }}>
                  <Trophy className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-display font-bold tracking-widest text-emerald-400 uppercase">GUBER Verified</p>
                  <p className="text-[10px] text-muted-foreground">
                    {job.completedAt ? `Verified ${Math.round((Date.now() - new Date((job as any).completedAt).getTime()) / 60000)} min ago` : "Verification complete"}
                  </p>
                </div>
              </div>
              {(job as any).partConditionTag && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-muted-foreground">Condition:</span>
                  <Badge variant="outline" className={
                    (job as any).partConditionTag === "Intact" ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]" :
                    (job as any).partConditionTag === "Damaged" ? "border-yellow-500/40 text-yellow-400 bg-yellow-500/10 text-[10px]" :
                    "border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]"
                  }>
                    {(job as any).partConditionTag}
                  </Badge>
                </div>
              )}
              {(job as any).helperObservationNotes && (
                <p className="text-xs text-muted-foreground italic">"{(job as any).helperObservationNotes}"</p>
              )}
              <div className="mt-3 p-3 rounded-xl text-[10px] text-muted-foreground/60" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                Verification confirms visual presence only at time of inspection. GUBER does not guarantee ownership, pricing, fitment, compatibility, future availability, or mechanical condition.
              </div>
            </div>
          </div>
        )}

        {/* ── BOUNTY BADGE (open/proof_review) ──────────────────────────────── */}
        {isBountyJob && ["posted_public", "proof_review"].includes(job.status) && (
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-display tracking-widest text-[10px]">
              <Trophy className="w-3 h-3 mr-1" /> BOUNTY
            </Badge>
            <span className="text-xs text-muted-foreground">
              {job.status === "proof_review" ? "Proof submitted — under review" : "Open to all verified helpers"}
            </span>
          </div>
        )}

        {/* ── HELPER BOUNTY SUBMISSION PANEL (T013) ─────────────────────────── */}
        {isBountyJob && !isOwner && ["posted_public", "proof_review"].includes(job.status) && user && (
          <div className="bg-card border border-border/20 rounded-2xl overflow-hidden mb-4" data-testid="card-bounty-submit">
            <button
              onClick={() => setShowBountyForm(v => !v)}
              className="w-full flex items-center justify-between p-4"
              data-testid="button-toggle-bounty-form"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span className="font-display font-bold text-sm text-foreground">Submit Proof</span>
              </div>
              {showBountyForm ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showBountyForm && (
              <div className="border-t border-border/20 p-4 space-y-4">
                <div className="p-3 rounded-xl text-xs text-muted-foreground" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="font-semibold text-foreground mb-1">Required proof (3 photos minimum):</p>
                  <ol className="space-y-1 list-decimal list-inside">
                    <li>Location ID — yard sign, building sign, row marker</li>
                    <li>Source Object — vehicle, shelf, bin, or lot</li>
                    <li>Part/Item Closeup — clear view of the requested item</li>
                  </ol>
                </div>

                {/* Photo slots */}
                {["Location ID", "Source Object", "Part/Item Closeup"].map((label, i) => (
                  <div key={i}>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Photo {i + 1}: {label}</p>
                    <div
                      className="relative w-full h-28 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
                      style={{ border: `1.5px dashed ${bountyPhotos[i] ? "rgba(0,180,80,0.4)" : "rgba(255,255,255,0.15)"}`, background: "rgba(255,255,255,0.02)" }}
                      onClick={() => fileInputRefs.current[i]?.click()}
                      data-testid={`photo-slot-${i}`}
                    >
                      {bountyPhotos[i] ? (
                        <img src={bountyPhotos[i]} alt={label} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center">
                          <Camera className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                          <p className="text-[10px] text-muted-foreground">Tap to capture</p>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        ref={el => { fileInputRefs.current[i] = el; }}
                        onChange={e => { if (e.target.files?.[0]) handleBountyPhotoCapture(i, e.target.files[0]); }}
                        data-testid={`input-photo-${i}`}
                      />
                    </div>
                  </div>
                ))}

                {/* GPS Capture */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Location Proof (required)</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={captureGps}
                    disabled={gpsLoading}
                    className={`w-full h-10 text-xs font-display ${bountyGps ? "border-emerald-500/40 text-emerald-400" : "border-border/30"}`}
                    data-testid="button-capture-gps"
                  >
                    {gpsLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5 mr-1.5" />}
                    {bountyGps ? `GPS Captured (±${Math.round(bountyGps.accuracy || 0)}m)` : "Capture GPS Location"}
                  </Button>
                </div>

                {/* Condition Tag */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium">Part/Item Condition (required)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Intact", "Damaged", "Missing"] as const).map(tag => (
                      <button
                        key={tag}
                        onClick={() => setBountyCondition(tag)}
                        className={`h-9 rounded-xl text-xs font-display font-bold border transition-all ${bountyCondition === tag
                          ? tag === "Intact" ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" : tag === "Damaged" ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400" : "bg-amber-500/20 border-amber-500/50 text-amber-400"
                          : "border-border/30 text-muted-foreground"
                        }`}
                        data-testid={`button-condition-${tag.toLowerCase()}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Notes */}
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-xs text-muted-foreground font-medium">Observation Notes (optional)</p>
                    <span className="text-[10px] text-muted-foreground">{bountyNotes.length}/250</span>
                  </div>
                  <Textarea
                    value={bountyNotes}
                    onChange={e => setBountyNotes(e.target.value.slice(0, 250))}
                    placeholder="e.g. vehicle partially stripped, part looks clean..."
                    className="resize-none text-xs h-16 bg-background/50"
                    data-testid="textarea-bounty-notes"
                  />
                </div>

                <Button
                  onClick={() => bountySubmitMutation.mutate()}
                  disabled={bountySubmitMutation.isPending || bountyPhotos.filter(Boolean).length < 3 || !bountyCondition || !bountyGps}
                  className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-bold tracking-wide rounded-xl"
                  data-testid="button-submit-bounty-proof"
                >
                  {bountySubmitMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  SUBMIT PROOF
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── POSTER BOUNTY REVIEW PANEL (T014) ─────────────────────────────── */}
        {isBountyJob && isOwner && job.status === "proof_review" && (
          <div className="bg-card border border-emerald-500/20 rounded-2xl overflow-hidden mb-4" data-testid="card-bounty-review">
            <div className="p-4 border-b border-border/20">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span className="font-display font-bold text-sm text-foreground">Review Submissions</span>
                {bountyAttempts && (
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] ml-auto">
                    {bountyAttempts.filter(a => a.status === "pending").length} pending
                  </Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Verification confirms visual presence only. Review photos carefully before approving.
              </p>
            </div>

            <div className="divide-y divide-border/20">
              {!bountyAttempts && (
                <div className="p-4 text-xs text-muted-foreground text-center">Loading submissions...</div>
              )}
              {bountyAttempts?.filter(a => a.status !== "superseded").map((attempt) => (
                <div key={attempt.id} className="p-4 space-y-3" data-testid={`card-attempt-${attempt.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${attempt.status === "approved" ? "border-emerald-500/40 text-emerald-400" : attempt.status === "rejected" ? "border-amber-500/40 text-amber-400" : "border-yellow-500/40 text-yellow-400"}`}>
                        {attempt.status === "approved" ? "Approved" : attempt.status === "rejected" ? "Rejected" : "Pending Review"}
                      </Badge>
                      {attempt.partConditionTag && (
                        <Badge variant="outline" className={`text-[10px] ${attempt.partConditionTag === "Intact" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : attempt.partConditionTag === "Damaged" ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/10" : "border-amber-500/30 text-amber-400 bg-amber-500/10"}`}>
                          {attempt.partConditionTag}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {attempt.createdAt ? `${Math.round((Date.now() - new Date(attempt.createdAt).getTime()) / 60000)}m ago` : ""}
                    </span>
                  </div>

                  {attempt.helperNotes && (
                    <p className="text-xs text-muted-foreground italic">"{attempt.helperNotes}"</p>
                  )}

                  {attempt.proofPhotos && attempt.proofPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {attempt.proofPhotos.map((photo, pi) => (
                        <div key={pi} className="aspect-square rounded-lg overflow-hidden bg-muted/20">
                          <img src={photo} alt={`Proof ${pi + 1}`} className="w-full h-full object-cover" data-testid={`img-proof-${attempt.id}-${pi}`} />
                        </div>
                      ))}
                    </div>
                  )}

                  {attempt.proofGps && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Location captured near coordinates
                    </p>
                  )}

                  {attempt.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => bountyApproveMutation.mutate(attempt.id)}
                        disabled={bountyApproveMutation.isPending}
                        className="flex-1 h-9 bg-emerald-500 hover:bg-emerald-600 text-white font-display tracking-wide text-xs"
                        data-testid={`button-approve-${attempt.id}`}
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingAttemptId(attempt.id)}
                        className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/10 font-display tracking-wide text-xs"
                        data-testid={`button-reject-${attempt.id}`}
                      >
                        <X className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </div>
                  )}

                  {rejectingAttemptId === attempt.id && (
                    <div className="space-y-2 animate-in fade-in">
                      <Select value={bountyRejectReason} onValueChange={setBountyRejectReason}>
                        <SelectTrigger className="h-9 text-xs" data-testid="select-reject-reason">
                          <SelectValue placeholder="Select rejection reason" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Photos unclear">Photos unclear</SelectItem>
                          <SelectItem value="Photos don't match request">Photos don't match request</SelectItem>
                          <SelectItem value="Location not correct">Location not correct</SelectItem>
                          <SelectItem value="Part condition misrepresented">Part condition misrepresented</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRejectingAttemptId(null); setBountyRejectReason(""); }}
                          className="flex-1 h-8 text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => bountyRejectMutation.mutate({ attemptId: attempt.id, reason: bountyRejectReason })}
                          disabled={!bountyRejectReason || bountyRejectMutation.isPending}
                          className="flex-1 h-8 bg-destructive/80 hover:bg-destructive text-white text-xs"
                          data-testid={`button-confirm-reject-${attempt.id}`}
                        >
                          Confirm Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {job.status === "posted_public" && !isOwner && acceptMutation.error?.message === "STRIPE_CONNECT_REQUIRED" && (
            <div className="bg-card border border-emerald-500/30 rounded-2xl p-5 mb-4 animate-in fade-in slide-in-from-top-4" data-testid="card-stripe-setup-required">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
                  <Banknote className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-bold text-sm text-foreground mb-1">Payment Setup Required</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                    To accept jobs on GUBER you must complete Stripe verification for secure payments.
                  </p>
                  <Button 
                    onClick={() => onboardMutation.mutate()} 
                    disabled={onboardMutation.isPending}
                    className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-display font-bold tracking-wide rounded-xl shadow-lg shadow-emerald-500/10 active:scale-95 transition-all"
                    data-testid="button-setup-payouts"
                  >
                    {onboardMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 mr-2" />
                    )}
                    SET UP PAYMENTS NOW
                  </Button>
                </div>
              </div>
            </div>
          )}

          {job.status === "posted_public" && !isOwner && (
            <Button onClick={() => {
              setShowWaiverModal(true);
              setWaiverChecked(false);
              setCategoryWaiverChecked(false);
              if (job.urgentSwitch || job.category === "On-Demand Help") {
                const now = new Date();
                setAvailableFrom(toLocalDatetimeString(now));
                const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);
                setAvailableTo(toLocalDatetimeString(endOfDay));
              }
            }}
              disabled={acceptMutation.isPending || (acceptMutation.error?.message === "STRIPE_CONNECT_REQUIRED")}
              className="w-full h-12 font-display tracking-wider bg-primary text-primary-foreground rounded-xl" data-testid="button-accept-job">
              <CheckCircle className="w-5 h-5 mr-2" /> ACCEPT JOB
            </Button>
          )}

          {job.status === "accepted_pending_payment" && isOwner && (
            <div className="space-y-3">
              {assignedWorker && (
                <div className="bg-card rounded-xl border border-yellow-500/20 p-4" data-testid="card-who-accepted">
                  <p className="text-[10px] font-display font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">Who Accepted</p>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-muted overflow-hidden shrink-0 ring-2 ring-yellow-500/20">
                      {assignedWorker.profilePhoto ? (
                        <img src={assignedWorker.profilePhoto} alt="Worker avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {assignedWorker.guberId || "GUBER Member"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <TrustBadge tier={assignedWorker.tier} />
                        {assignedWorker.rating != null && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {assignedWorker.rating.toFixed(1)}
                          </span>
                        )}
                        {assignedWorker.idVerified && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5 font-display font-bold" data-testid="badge-verified-helper">
                            <Shield className="w-3 h-3" /> Verified
                          </span>
                        )}
                        {assignedWorker.rating != null && assignedWorker.rating >= 4.8 && (assignedWorker.reviewCount || 0) >= 10 && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-0.5 font-display font-bold" data-testid="badge-top-rated">
                            <Award className="w-3 h-3" /> Top Rated
                          </span>
                        )}
                      </div>
                    </div>
                    <Link href={`/profile/${job.assignedHelperId}`}>
                      <Button variant="outline" size="sm" className="text-xs h-7 border-border/30 gap-1 font-display shrink-0" data-testid="button-view-worker-profile">
                        Profile <ChevronRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                  {isBusinessUser && helperReliability && (
                    <div className="mt-3 pt-3 border-t border-border/10 grid grid-cols-4 gap-2" data-testid="section-helper-reliability">
                      <div className="text-center">
                        <p className="text-sm font-display font-bold text-primary">{helperReliability.jobsCompleted}</p>
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Done</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-display font-bold text-emerald-400">{helperReliability.completionRate}%</p>
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Rate</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-display font-bold text-amber-400">{helperReliability.avgRating.toFixed(1)}</p>
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Rating</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-display font-bold text-blue-400">{helperReliability.avgResponseTimeMins}m</p>
                        <p className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">Resp.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {job.category !== "Barter Labor" && (job as any).helperPayout != null && (() => {
                const budget = job.budget ?? 0;
                const urgentFee = (job as any).urgentFee ?? 0;
                const workerFeePct = (job as any).workerFeePct ?? 0.20;
                const helperPayout = (job as any).helperPayout as number;
                const workerFeeAmt = Math.round((budget - helperPayout) * 100) / 100;
                const netToCharge = budget + urgentFee;
                const grossCharge = Math.ceil((netToCharge + 0.30) / (1 - 0.029) * 100) / 100;
                const stripeFee = Math.round((grossCharge - netToCharge) * 100) / 100;
                return (
                  <div className="bg-card rounded-xl border border-white/[0.06] p-3 space-y-1.5">
                    <p className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Breakdown</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Job price</span>
                      <span className="font-medium">${budget.toFixed(2)}</span>
                    </div>
                    {urgentFee > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Urgent boost fee</span>
                        <span className="text-amber-400">+${urgentFee.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Card processing (2.9% + 30¢)</span>
                      <span className="text-muted-foreground">+${stripeFee.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-white/[0.06] pt-1.5 flex justify-between text-xs font-bold">
                      <span>Total you pay</span>
                      <span className="text-foreground">${grossCharge.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-white/[0.06] pt-1.5 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">GUBER platform fee ({Math.round(workerFeePct * 100)}% — deducted from worker)</span>
                        <span className="text-rose-400">−${workerFeeAmt.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-muted-foreground">Worker receives</span>
                        <span className="text-emerald-400">${helperPayout.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 leading-relaxed pt-0.5">
                      No service fee on your end. GUBER's fee is deducted from the worker's share. Processing fee passed through at cost. Funds held until both parties confirm completion.
                    </p>
                  </div>
                );
              })()}
              <div className="bg-card rounded-xl border border-white/[0.06] p-3">
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  Payments processed by Stripe. Funds are held until job completion and confirmation by both parties. Refunds are case-by-case. GUBER may assist in disputes but does not guarantee any outcome.
                </p>
              </div>
              {(job as any).assignment?.workerAvailableFrom && (
                <div className="bg-card rounded-xl border border-emerald-500/20 p-4 space-y-2" data-testid="card-worker-availability">
                  <p className="text-[10px] font-display font-semibold text-muted-foreground/60 uppercase tracking-wider">Worker Availability</p>
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <Clock className="w-4 h-4" />
                    <span>
                      {new Date((job as any).assignment.workerAvailableFrom).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {" – "}
                      {new Date((job as any).assignment.workerAvailableTo).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-bold">Pick a start time</label>
                    <input
                      type="datetime-local"
                      value={confirmedStartTime}
                      onChange={(e) => setConfirmedStartTime(e.target.value)}
                      min={toLocalDatetimeString(new Date((job as any).assignment.workerAvailableFrom))}
                      max={toLocalDatetimeString(new Date((job as any).assignment.workerAvailableTo))}
                      className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-primary/50"
                      data-testid="input-confirmed-start-time"
                    />
                  </div>
                </div>
              )}

              {(job as any).assignment?.confirmedStartTime && (
                <div className="bg-card rounded-xl border border-primary/20 p-3 flex items-center gap-2" data-testid="card-confirmed-time">
                  <Clock className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Confirmed start: <span className="text-foreground font-semibold">{new Date((job as any).assignment.confirmedStartTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={() => lockMutation.mutate(confirmedStartTime || undefined)} disabled={lockMutation.isPending}
                  className="flex-1 h-12 font-display tracking-wider bg-secondary text-secondary-foreground rounded-xl" data-testid="button-lock-job">
                  {lockMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Lock className="w-5 h-5 mr-2" />}
                  {job.category === "Barter Labor" ? "CONFIRM & LOCK" : "CONFIRM & PAY"}
                </Button>
                {(() => {
                  const sentAt = (job as any).assignment?.needMoreTimeSentAt;
                  const sentRecently = sentAt && (Date.now() - new Date(sentAt).getTime()) < 60 * 60 * 1000;
                  const isDisabled = needMoreTimeMutation.isPending || !!sentRecently;
                  return (
                    <Button
                      onClick={() => needMoreTimeMutation.mutate()}
                      disabled={isDisabled}
                      variant="outline"
                      className="h-12 px-4 font-display tracking-wider rounded-xl border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      data-testid="button-need-more-time"
                    >
                      {needMoreTimeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                      <span className="ml-1.5 text-[10px]">{isDisabled ? "SENT" : "NEED TIME"}</span>
                    </Button>
                  );
                })()}
              </div>
            </div>
          )}

          {(isHelper || isOwner) && (job as any).assignment?.confirmedStartTime && ["funded", "active", "in_progress"].includes(job.status) && (
            <div className="bg-card rounded-xl border border-primary/20 p-3 flex items-center gap-2" data-testid="card-scheduled-time">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">
                Scheduled start: <span className="text-foreground font-semibold">{new Date((job as any).assignment.confirmedStartTime).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </span>
            </div>
          )}

          {["in_progress", "active", "funded"].includes(job.status) && isHelper && !job.proofRequired && job.proofStatus !== "rejected" && (
            (job as any).helperConfirmed ? (
              <div className="bg-card rounded-2xl border border-amber-500/20 p-4 text-center" data-testid="card-helper-waiting-buyer">
                <Clock className="w-5 h-5 text-amber-400 mx-auto mb-2" />
                <p className="text-xs font-display text-muted-foreground font-semibold">You confirmed completion.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Waiting for the poster to confirm — your payout releases once both sides confirm.</p>
              </div>
            ) : !(job as any).arrivedAt ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-center" data-testid="card-gps-required">
                <MapPin className="w-5 h-5 text-amber-400 mx-auto mb-2" />
                <p className="text-xs font-display text-amber-400 font-semibold">GPS Check Required</p>
                <p className="text-xs text-muted-foreground/80 mt-1">Tap "I've Arrived" at the job location before you can confirm completion.</p>
              </div>
            ) : (
              <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}
                className="w-full h-12 font-display tracking-wider bg-primary text-primary-foreground rounded-xl" data-testid="button-confirm">
                {confirmMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                CONFIRM COMPLETION
              </Button>
            )
          )}

          {["in_progress", "active", "funded", "completion_submitted"].includes(job.status) && isOwner && !(job as any).buyerConfirmed && !job.proofRequired && job.proofStatus !== "rejected" && (
            (job as any).helperConfirmed ? (
              <>
                <button
                  onClick={() => confirmMutation.mutate()}
                  disabled={confirmMutation.isPending}
                  className="confirm-flash-btn w-full rounded-2xl font-display font-black text-black flex flex-col items-center justify-center gap-0.5 py-4 px-4 transition-opacity disabled:opacity-60"
                  data-testid="button-owner-confirm"
                >
                  {confirmMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                  ) : (
                    <>
                      <span className="flex items-center gap-2 text-sm tracking-widest uppercase leading-tight">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        CONFIRM WORK DONE
                      </span>
                      <span className="text-sm tracking-widest uppercase leading-tight">&amp; RELEASE PAYMENT</span>
                    </>
                  )}
                </button>
                <div className="flex justify-center mt-2">
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to dispute this job? GUBER admin will review and reach out to both parties.")) {
                        escalateMutation.mutate();
                      }
                    }}
                    disabled={escalateMutation.isPending}
                    className="text-[11px] text-muted-foreground/50 hover:text-destructive/70 transition-colors underline-offset-2 hover:underline"
                    data-testid="button-poster-dispute"
                  >
                    Not satisfied? File a dispute instead
                  </button>
                </div>
              </>
            ) : (
              <div className="bg-card rounded-2xl border border-border/20 p-4 text-center" data-testid="card-waiting-proof">
                <Clock className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs font-display text-muted-foreground">Worker is on their way. You'll be notified when they confirm completion.</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">Your payout is released after both parties confirm.</p>
              </div>
            )
          )}

          {(job.status === "completion_submitted" || job.status === "completed_paid") && isOwner && isBusinessUser && (
            <button
              onClick={handleDownloadReport}
              className="w-full flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(59,130,246,0.08))",
                border: "1.5px solid rgba(99,102,241,0.3)",
                boxShadow: "0 0 16px rgba(99,102,241,0.05)",
              }}
              data-testid="button-download-report"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
                <Download className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-indigo-400 mb-0.5">Download Verification Report</p>
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  Print or save as PDF — includes job details, proof photos, GPS data &amp; legal disclaimer.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-indigo-400/50 shrink-0" />
            </button>
          )}

          {(job.status === "completion_submitted" || job.status === "completed_paid") && isOwner && isVIJob && (
            <button
              onClick={() => setShowSellModal(true)}
              className="w-full flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: "linear-gradient(135deg, rgba(0,180,80,0.1), rgba(0,80,200,0.08))",
                border: "1.5px solid rgba(0,180,80,0.25)",
                boxShadow: "0 0 16px rgba(0,180,80,0.05)",
              }}
              data-testid="button-sell-this-item"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(0,180,80,0.12)", border: "1px solid rgba(0,180,80,0.25)" }}>
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-bold text-emerald-400 mb-0.5">Sell This Item in Marketplace</p>
                <p className="text-xs text-muted-foreground/60 leading-relaxed">
                  Inspection completed. List it with your GUBER Verified badge — all photos &amp; details auto-attached.
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-400/50 shrink-0" />
            </button>
          )}

          {(job.status === "completed_paid" || (job as any).payoutStatus === "payout_eligible") && isHelper && (() => {
            const isStripeJob = !!(job as any).stripePaymentIntentId;
            const transferSent = !!(job as any).stripeTransferId;
            if (isStripeJob) {
              return (
                <div className="rounded-2xl border border-emerald-500/20 p-5 space-y-3" style={{ background: "linear-gradient(135deg,rgba(6,30,15,0.9),rgba(2,20,10,0.95))" }} data-testid="card-payout-stripe-auto">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-display font-bold text-sm text-emerald-400">{transferSent ? "Payout Sent" : "Payout Ready"}</p>
                      <p className="text-[10px] text-muted-foreground/50">{transferSent ? "Transfer sent to your Stripe account" : "Your earnings are in your GUBER wallet"}</p>
                    </div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15 p-3">
                    <p className="text-[10px] text-emerald-400/70 leading-relaxed">
                      {transferSent
                        ? "Your earnings have been transferred to your Stripe Connect account. Funds typically arrive in your bank within 2–7 business days — handled entirely by Stripe."
                        : "Your payment was captured. Check your wallet — if your payout account is active, your earnings transfer automatically. Otherwise tap below to view your wallet and set up payouts."}
                    </p>
                  </div>
                  <Link href="/wallet">
                    <Button variant="outline" size="sm" className="w-full border-emerald-500/20 text-emerald-400 font-display text-xs" data-testid="button-view-wallet-stripe-auto">
                      View Wallet
                    </Button>
                  </Link>
                </div>
              );
            }
            return (
              <div className="rounded-2xl border border-emerald-500/20 p-5 space-y-4" style={{ background: "linear-gradient(135deg,rgba(6,30,15,0.9),rgba(2,20,10,0.95))" }} data-testid="card-payout-ready">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-display font-bold text-sm text-emerald-400">Payout Ready</p>
                      <p className="text-[10px] text-muted-foreground/50">Choose how you want to receive your earnings</p>
                    </div>
                  </div>
                  {payoutOptions?.trustLevel && (
                    <div className="shrink-0 px-2.5 py-1 rounded-full text-[9px] font-display font-black tracking-widest uppercase border"
                      style={{
                        background: payoutOptions.trustLevel === "trusted_worker" ? "rgba(34,197,94,0.12)" : payoutOptions.trustLevel === "verified_worker" ? "rgba(59,130,246,0.12)" : "rgba(100,116,139,0.12)",
                        borderColor: payoutOptions.trustLevel === "trusted_worker" ? "rgba(34,197,94,0.3)" : payoutOptions.trustLevel === "verified_worker" ? "rgba(59,130,246,0.3)" : "rgba(100,116,139,0.3)",
                        color: payoutOptions.trustLevel === "trusted_worker" ? "#86efac" : payoutOptions.trustLevel === "verified_worker" ? "#93c5fd" : "#94a3b8",
                      }}
                      data-testid="badge-trust-level"
                    >
                      {payoutOptions.trustLevel === "trusted_worker" ? "⭐ Trusted" : payoutOptions.trustLevel === "verified_worker" ? "✓ Verified" : "New Worker"}
                    </div>
                  )}
                </div>

                <div className="space-y-2" data-testid="payout-mode-selector">
                  {(["standard", "early", "instant"] as const).map((mode) => {
                    const availableModes: string[] = payoutOptions?.modes || ["standard"];
                    const isUnlocked = availableModes.includes(mode);
                    const modeAmount = payoutOptions?.amounts?.[mode] ?? 0;
                    const isSelected = selectedPayoutMode === mode && isUnlocked;
                    const modeColors = {
                      standard: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.3)", text: "#86efac" },
                      early: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)", text: "#fcd34d" },
                      instant: { bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.3)", text: "#c4b5fd" },
                    }[mode];
                    type ModeLabel = { label: string; sub: string; icon: React.ReactNode; requirement?: string };
                    const modeLabels: ModeLabel = ({
                      standard: { label: "Standard", sub: "2–5 business days · No fee", icon: <Banknote className="w-4 h-4" /> },
                      early: { label: "Early Cash-Out", sub: `~1 day before review timer · ${((payoutOptions?.fees?.earlyCashoutFee || 0.02) * 100).toFixed(0)}% fee`, icon: <Clock className="w-4 h-4" />, requirement: "Requires Verified (60+ trust score)" },
                      instant: { label: "Instant", sub: `Immediate transfer · ${((payoutOptions?.fees?.instantCashoutFee || 0.05) * 100).toFixed(0)}% fee`, icon: <Zap className="w-4 h-4" />, requirement: "Requires Trusted (80+ trust score)" },
                    } as Record<string, ModeLabel>)[mode];
                    return (
                      <button
                        key={mode}
                        onClick={() => isUnlocked && setSelectedPayoutMode(mode)}
                        disabled={!isUnlocked}
                        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left disabled:cursor-not-allowed"
                        style={{
                          background: isUnlocked ? (isSelected ? modeColors.bg : "rgba(255,255,255,0.02)") : "rgba(0,0,0,0.15)",
                          border: `1.5px solid ${isUnlocked ? (isSelected ? modeColors.border : "rgba(255,255,255,0.06)") : "rgba(255,255,255,0.04)"}`,
                          opacity: isUnlocked ? 1 : 0.6,
                        }}
                        data-testid={`button-payout-mode-${mode}`}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: isUnlocked ? modeColors.bg : "rgba(71,85,105,0.15)", color: isUnlocked ? modeColors.text : "#475569" }}>
                          {isUnlocked ? modeLabels.icon : <Lock className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-display font-bold" style={{ color: isUnlocked ? modeColors.text : "#475569" }}>{modeLabels.label}</p>
                          <p className="text-[10px] text-muted-foreground/50">{modeLabels.sub}</p>
                          {!isUnlocked && modeLabels.requirement && (
                            <p className="text-[9px] text-slate-500 mt-0.5 font-display">{modeLabels.requirement}</p>
                          )}
                        </div>
                        {isUnlocked ? (
                          <p className="font-display font-black text-sm shrink-0" style={{ color: modeColors.text }}>${modeAmount.toFixed(2)}</p>
                        ) : (
                          <Lock className="w-3 h-3 text-slate-600 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {!payoutOptions?.eligible && (
                  <div className="rounded-xl bg-muted/10 border border-border/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground/60">{payoutOptions?.reason || "Loading payout options…"}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {payoutOptions?.eligible && (
                    <Button
                      onClick={() => requestPayoutMutation.mutate(selectedPayoutMode)}
                      disabled={requestPayoutMutation.isPending}
                      className="flex-1 h-10 font-display tracking-wider text-xs rounded-xl"
                      style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)" }}
                      data-testid="button-request-payout"
                    >
                      {requestPayoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "REQUEST PAYOUT"}
                    </Button>
                  )}
                  <Link href="/wallet" className={payoutOptions?.eligible ? "" : "flex-1"}>
                    <Button variant="outline" className="w-full h-10 font-display tracking-wider text-xs rounded-xl border-emerald-500/20 text-emerald-400" data-testid="button-view-wallet-payout">
                      WALLET
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })()}

          {(job as any).payoutStatus === "payout_processing" && isHelper && (
            <div className="rounded-2xl border border-blue-500/20 p-5 space-y-3" style={{ background: "linear-gradient(135deg,rgba(3,15,35,0.9),rgba(2,10,25,0.95))" }} data-testid="card-payout-processing">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                </div>
                <div>
                  <p className="font-display font-bold text-sm text-blue-400">Payout Processing</p>
                  <p className="text-[10px] text-muted-foreground/50">Your earnings are being transferred to your payout account</p>
                </div>
              </div>
              <div className="rounded-xl bg-blue-500/[0.06] border border-blue-500/15 p-3">
                <p className="text-[10px] text-blue-400/70 leading-relaxed">
                  Standard transfers arrive in 2–5 business days. You'll receive a notification when your funds land. Check your Stripe dashboard for real-time status.
                </p>
              </div>
              <Link href="/wallet">
                <Button variant="outline" size="sm" className="w-full border-blue-500/20 text-blue-400 font-display text-xs" data-testid="button-view-wallet-processing">
                  View Wallet
                </Button>
              </Link>
            </div>
          )}

          {(job as any).payoutStatus === "paid_out" && isHelper && (
            <div className="rounded-2xl border border-emerald-500/30 p-6 text-center space-y-3" style={{ background: "linear-gradient(135deg,#001a0a,#002d12)" }} data-testid="card-payout-complete">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-display font-black text-lg text-emerald-300">Paid Out!</p>
                <p className="text-[11px] text-emerald-400/60 leading-relaxed mt-1">
                  Your earnings have been sent to your payout account. Check your bank or Stripe dashboard.
                </p>
              </div>
              <Link href="/wallet">
                <Button size="sm" className="font-display bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/20 text-xs" data-testid="button-view-wallet-paid">
                  View Wallet
                </Button>
              </Link>
            </div>
          )}

          {(job as any).payoutStatus === "capture_expired" && (
            <div className="rounded-2xl border border-rose-500/30 p-5 space-y-3" style={{ background: "linear-gradient(135deg,rgba(30,6,6,0.9),rgba(20,2,2,0.95))" }} data-testid="card-capture-expired">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <p className="font-display font-bold text-sm text-rose-400">Payment Authorization Expired</p>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-1">
                    The payment hold on this job expired before it could be captured. This typically happens when a job goes unconfirmed for more than 7 days. No funds were charged.
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-rose-500/[0.06] border border-rose-500/15 p-3">
                <p className="text-[10px] text-rose-400/60 leading-relaxed">
                  {isHelper
                    ? "Unfortunately your payout cannot be processed for this job. If you believe this is an error, please contact GUBER support."
                    : "The payment authorization has expired. No charge was made to your card. If work was completed, please contact GUBER support."}
                </p>
              </div>
            </div>
          )}

          {(job.status === "completion_submitted" || job.status === "completed_paid") && isHelper && (job as any).reviewTimerStartedAt && (() => {
            const startedAt = new Date((job as any).reviewTimerStartedAt).getTime();
            const expiresAt = startedAt + 12 * 60 * 60 * 1000;
            const msLeft = expiresAt - now;
            const hoursLeft = Math.max(0, Math.floor(msLeft / 1000 / 60 / 60));
            const minsLeft = Math.max(0, Math.floor((msLeft % (60 * 60 * 1000)) / 1000 / 60));
            const expired = msLeft <= 0;
            return (
              <div className="bg-card rounded-2xl border border-amber-500/20 p-4 space-y-2" data-testid="card-review-timer">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <p className="text-xs font-display font-semibold text-amber-400">Review Period Active</p>
                  </div>
                  {!expired && (
                    <div className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <p className="text-[10px] font-display font-bold text-amber-400 tabular-nums" data-testid="text-review-countdown">
                        {hoursLeft}h {minsLeft}m left
                      </p>
                    </div>
                  )}
                  {expired && (
                    <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[10px] font-display font-bold text-emerald-400">Completing soon…</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                  {expired
                    ? "The review window has expired. The job will auto-confirm and your earnings will be released shortly."
                    : "The poster has a review window to verify your work. If no dispute is filed, the job auto-confirms and your earnings become available."}
                </p>
              </div>
            );
          })()}

          {(job.status === "completion_submitted" || job.status === "completed_paid") && (isOwner || isHelper) && !reviewSubmitted && (
            <div className="bg-card rounded-2xl border border-border/20 p-5 space-y-3">
              <h3 className="font-display font-semibold text-sm">Leave a Review</h3>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => setReviewRating(s)} data-testid={`button-star-${s}`}>
                    <Star className={`w-6 h-6 ${s <= reviewRating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30"}`} />
                  </button>
                ))}
              </div>
              <Textarea value={reviewComment} onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share your experience..." className="bg-background border-border/30" data-testid="input-review-comment" />
              <Button onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}
                className="bg-secondary text-secondary-foreground font-display rounded-xl" data-testid="button-submit-review">
                Submit Review
              </Button>
            </div>
          )}
        </div>
      </div>

      {showNavModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={() => setShowNavModal(false)}>
          <div className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl p-5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}
            data-testid="modal-navigation">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-display font-extrabold">Launch Navigation</h2>
                <p className="text-xs text-muted-foreground/50 mt-0.5">GPS logged • Choose your nav app</p>
              </div>
              <button onClick={() => setShowNavModal(false)} className="p-1.5 rounded-full hover:bg-white/10">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {job && (
                <button
                  onClick={() => { setShowNavModal(false); openGoogleMapsForJob(job); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: "rgba(66,133,244,0.12)", border: "1px solid rgba(66,133,244,0.25)" }}
                  data-testid="link-google-maps">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(66,133,244,0.2)" }}>
                    <Navigation className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-display font-bold text-blue-400">Open in Google Maps</p>
                    <p className="text-xs text-muted-foreground/50">Turn-by-turn navigation</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-blue-400/50 ml-auto" />
                </button>
              )}

              {job && ((job as any).lat || job.location) && (
                <button
                  onClick={() => { setShowNavModal(false); openWazeForJob(job); }}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}
                  data-testid="link-waze">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                    <Car className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-display font-bold text-emerald-400">Open in Waze</p>
                    <p className="text-xs text-muted-foreground/50">Real-time traffic routing</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-400/50 ml-auto" />
                </button>
              )}

              {!job && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No address available for navigation.
                </div>
              )}
            </div>

            <Button onClick={() => setShowNavModal(false)} variant="outline"
              className="w-full rounded-2xl border-white/10 font-display tracking-wider" data-testid="button-close-nav">
              CLOSE
            </Button>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={() => setShowCancelModal(false)}>
          <div className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl p-5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}
            data-testid="modal-cancel-job">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-display font-extrabold text-destructive">Cancel This Job?</h2>
                <p className="text-xs text-muted-foreground/50 mt-0.5">This will re-open the job for other helpers</p>
              </div>
              <button onClick={() => setShowCancelModal(false)} className="p-1.5 rounded-full hover:bg-white/10">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">REASON (REQUIRED)</label>
                <Select value={cancelReason} onValueChange={setCancelReason}>
                  <SelectTrigger className="bg-background border-border/30 rounded-xl" data-testid="select-cancel-reason">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CANCEL_REASONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">ADDITIONAL NOTES (OPTIONAL)</label>
                <Textarea
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="Any additional context..."
                  className="bg-background border-border/30 rounded-xl text-sm min-h-[80px]"
                  data-testid="input-cancel-notes"
                />
              </div>
            </div>

            <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <p className="text-[11px] text-amber-400/80 leading-relaxed flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Repeated cancellations affect your reliability score and may reduce job visibility. This is logged and tracked.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCancelModal(false)}
                className="flex-1 rounded-xl border-white/10 font-display tracking-wider" data-testid="button-cancel-abort">
                GO BACK
              </Button>
              <Button
                onClick={handleCancel}
                disabled={!cancelReason || milestoneMutation.isPending}
                className="flex-1 rounded-xl font-display tracking-wider bg-destructive text-white"
                data-testid="button-cancel-confirm">
                {milestoneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "CONFIRM CANCEL"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showPosterCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={() => setShowPosterCancelModal(false)}>
          <div className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl p-5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}
            data-testid="modal-poster-cancel-job">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-display font-extrabold text-destructive">Cancel This Job?</h2>
                <p className="text-xs text-muted-foreground/50 mt-0.5">
                  {job && ["funded", "active", "in_progress"].includes(job.status)
                    ? "This job is already in progress — cancelling may affect your account"
                    : "The helper will be notified and the job will be closed"}
                </p>
              </div>
              <button onClick={() => setShowPosterCancelModal(false)} className="p-1.5 rounded-full hover:bg-white/10">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">REASON (REQUIRED)</label>
                <Select value={posterCancelReason} onValueChange={setPosterCancelReason}>
                  <SelectTrigger className="bg-background border-border/30 rounded-xl" data-testid="select-poster-cancel-reason">
                    <SelectValue placeholder="Select a reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {POSTER_CANCEL_REASONS.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">ADDITIONAL NOTES (OPTIONAL)</label>
                <Textarea
                  value={posterCancelNote}
                  onChange={(e) => setPosterCancelNote(e.target.value)}
                  placeholder="Any additional context..."
                  className="bg-background border-border/30 rounded-xl text-sm min-h-[80px]"
                  data-testid="input-poster-cancel-notes"
                />
              </div>
            </div>

            {job && ["funded", "active", "in_progress"].includes(job.status) && (
              <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
                <p className="text-[11px] text-amber-400/80 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Cancelling after a helper has been locked affects your reliability score. The helper has already committed time to this job.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowPosterCancelModal(false)}
                className="flex-1 rounded-xl border-white/10 font-display tracking-wider" data-testid="button-poster-cancel-abort">
                GO BACK
              </Button>
              <Button
                onClick={() => posterCancelMutation.mutate()}
                disabled={!posterCancelReason || posterCancelMutation.isPending}
                className="flex-1 rounded-xl font-display tracking-wider bg-destructive text-white"
                data-testid="button-poster-cancel-confirm">
                {posterCancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "CONFIRM CANCEL"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSellModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setShowSellModal(false)}>
          <div className="w-full max-w-lg bg-[#0d0d1a] rounded-t-3xl p-5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            onClick={e => e.stopPropagation()}
            data-testid="modal-sell-vi-item">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-display font-extrabold">List in Marketplace</h2>
                <p className="text-xs text-muted-foreground/50 mt-0.5">GUBER Verified badge auto-attached ✓</p>
              </div>
              <button onClick={() => setShowSellModal(false)} className="p-1.5 rounded-full hover:bg-white/10">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">ITEM CATEGORY</label>
                <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  value={sellForm.category} onChange={e => setSellForm(f => ({ ...f, category: e.target.value }))}
                  data-testid="select-sell-category">
                  <option value="">Select a category</option>
                  {["Vehicles", "Electronics", "Furniture", "Tools & Equipment", "Real Estate / Rental", "Clothing", "Sporting Goods", "Other"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">CONDITION</label>
                <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  value={sellForm.condition} onChange={e => setSellForm(f => ({ ...f, condition: e.target.value }))}
                  data-testid="select-sell-condition">
                  <option value="">Select condition</option>
                  {["New", "Like New", "Good", "Fair", "Poor"].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">ASKING TYPE</label>
                <div className="flex gap-2">
                  {[["fixed", "Fixed"], ["obo", "OBO"], ["free", "Free"]].map(([v, l]) => (
                    <button key={v} onClick={() => setSellForm(f => ({ ...f, askingType: v }))}
                      className="flex-1 py-2 rounded-xl text-xs font-display font-bold transition-all"
                      style={sellForm.askingType === v
                        ? { background: "rgba(0,229,118,0.15)", border: "1.5px solid rgba(0,229,118,0.4)", color: "#00e676" }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {sellForm.askingType !== "free" && (
                <div>
                  <label className="text-xs font-display font-bold text-muted-foreground/60 tracking-wider block mb-1.5">ASKING PRICE ($)</label>
                  <input type="number" placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50"
                    value={sellForm.price} onChange={e => setSellForm(f => ({ ...f, price: e.target.value }))}
                    data-testid="input-sell-price" />
                </div>
              )}
            </div>

            <div className="rounded-xl p-3 mb-4"
              style={{ background: "rgba(0,180,80,0.07)", border: "1px solid rgba(0,180,80,0.18)" }}>
              <p className="text-[11px] text-emerald-400/80 leading-relaxed">
                All inspection photos, notes, and the verified inspector's details will be auto-attached to your listing. It will display the <strong>GUBER Verified</strong> badge instantly.
              </p>
            </div>

            <Button onClick={() => fromVIMutation.mutate()} disabled={fromVIMutation.isPending}
              className="w-full premium-btn font-display" data-testid="button-confirm-sell">
              {fromVIMutation.isPending ? "Publishing..." : "PUBLISH TO MARKETPLACE — FREE"}
            </Button>
          </div>
        </div>
      )}
      {showRejectDialog && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4" data-testid="modal-reject-proof">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRejectDialog(false)} />
          <div className="relative bg-card rounded-3xl border border-border/20 p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base">Not Satisfied?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Tell the worker exactly what needs to be fixed. They'll get your feedback instantly.</p>
              </div>
              <button onClick={() => setShowRejectDialog(false)} className="p-2 rounded-full hover:bg-white/10" data-testid="button-close-reject-dialog">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <Textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="e.g. The lawn wasn't fully mowed — left side still needs work. Please resubmit with a photo showing the completed area."
              className="bg-background border-border/30 min-h-[100px] text-sm"
              data-testid="input-reject-feedback"
            />

            <p className="text-[11px] text-muted-foreground/70">
              Feedback is optional but helps the worker fix the issue. The worker can resubmit proof or request admin review.
            </p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowRejectDialog(false)}
                className="flex-1 rounded-xl"
                data-testid="button-cancel-reject"
              >
                Cancel
              </Button>
              <Button
                onClick={() => rejectProofMutation.mutate()}
                disabled={rejectProofMutation.isPending}
                className="flex-1 rounded-xl bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30"
                data-testid="button-confirm-reject"
              >
                {rejectProofMutation.isPending ? "Sending..." : "SEND BACK TO WORKER"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {showWaiverModal && job && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4" data-testid="modal-job-waiver">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowWaiverModal(false)} />
          <div className="relative bg-card rounded-3xl border border-border/20 p-6 w-full max-w-lg space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Shield className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-black text-base">Before You Accept</h3>
                  <p className="text-[11px] text-muted-foreground/60">Please read and acknowledge</p>
                </div>
              </div>
              <button onClick={() => setShowWaiverModal(false)} className="p-2 rounded-full hover:bg-white/10 text-muted-foreground" data-testid="button-close-waiver">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-3">
              <p className="text-[10px] font-display font-bold tracking-widest text-muted-foreground/60 uppercase">Contractor Acknowledgment</p>
              <ul className="space-y-2">
                {[
                  "I am acting as an independent contractor — not an employee of GUBER",
                  "GUBER does not supervise, direct, or control my work on this job",
                  "I accept the risks associated with performing this task",
                  "I am responsible for complying with all applicable laws, safety rules, licensing requirements, and insurance requirements",
                  "I will not perform work beyond my qualifications or physical ability",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[12px] text-muted-foreground leading-relaxed">
                    <span className="text-primary mt-0.5 flex-shrink-0">·</span>
                    {item}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-3 cursor-pointer group mt-3" data-testid="label-waiver-check">
                <div
                  onClick={() => setWaiverChecked(!waiverChecked)}
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    waiverChecked ? "bg-primary border-primary" : "border-white/60 bg-white/10 group-hover:border-primary/70"
                  }`}
                  data-testid="checkbox-waiver"
                >
                  {waiverChecked && <CheckCircle className="w-3 h-3 text-background" strokeWidth={3} />}
                </div>
                <span className="text-[12px] text-muted-foreground leading-relaxed font-medium">
                  I understand and accept these conditions
                </span>
              </label>
            </div>

            {(job.category === "Verify & Inspect" || job.category === "Skilled Labor" || job.category === "General Labor" || job.category === "On-Demand Help" || job.category === "Marketplace") && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3">
                <p className="text-[10px] font-display font-bold tracking-widest text-amber-400/80 uppercase">Category Notice</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {job.category === "Verify & Inspect"
                    ? "This task is limited to visual verification and documentation only. It does not constitute a mechanical diagnosis, fitment guarantee, safety certification, structural opinion, or any form of professional advice. I may only document what is visually present or absent."
                    : job.category === "Skilled Labor"
                    ? "This task may involve skilled physical labor. I am responsible for my personal safety, proper tool use, equipment operation, and task judgment. GUBER does not supervise the work. I confirm I hold any required licenses or credentials for this service."
                    : job.category === "General Labor"
                    ? "This task may involve physical activity. I am responsible for personal safety, proper lifting, equipment use, and task judgment. GUBER does not supervise the work."
                    : job.category === "Marketplace"
                    ? "This task may involve meeting another user in person or exchanging goods. I should exercise caution, meet in safe and public locations, and trust my instincts. GUBER does not guarantee the conduct of other users."
                    : "This task may involve meeting or interacting with another user. I should exercise caution and meet in safe, well-lit locations when possible. GUBER does not guarantee the conduct of other users."
                  }
                </p>
                <label className="flex items-start gap-3 cursor-pointer group mt-2" data-testid="label-category-waiver-check">
                  <div
                    onClick={() => setCategoryWaiverChecked(!categoryWaiverChecked)}
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      categoryWaiverChecked ? "bg-amber-500 border-amber-500" : "border-amber-400/70 bg-amber-500/10 group-hover:border-amber-400"
                    }`}
                    data-testid="checkbox-category-waiver"
                  >
                    {categoryWaiverChecked && <CheckCircle className="w-3 h-3 text-background" strokeWidth={3} />}
                  </div>
                  <span className="text-[12px] text-muted-foreground leading-relaxed font-medium">
                    I understand the scope and limitations of this category
                  </span>
                </label>
              </div>
            )}

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
              <p className="text-[10px] font-display font-bold tracking-widest text-emerald-400/80 uppercase">Your Availability</p>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                When are you available to do this job? The hirer will pick a start time within your window.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-bold">From</label>
                  <input
                    type="datetime-local"
                    value={availableFrom}
                    onChange={(e) => setAvailableFrom(e.target.value)}
                    min={toLocalDatetimeString(new Date())}
                    className="w-full mt-1 bg-background border border-border/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                    data-testid="input-available-from"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#00E5E5] uppercase tracking-wider font-bold">To</label>
                  <input
                    type="datetime-local"
                    value={availableTo}
                    onChange={(e) => setAvailableTo(e.target.value)}
                    min={availableFrom || toLocalDatetimeString(new Date())}
                    className="w-full mt-1 bg-background border border-border/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                    data-testid="input-available-to"
                  />
                </div>
              </div>
              {(job.urgentSwitch || job.category === "On-Demand Help") && (
                <p className="text-[10px] text-amber-400/80 font-medium">
                  {job.urgentSwitch ? "This is an urgent job" : "This is an on-demand job"} — your availability must start today.
                </p>
              )}
            </div>

            <Button
              onClick={() => acceptMutation.mutate({
                waiverAccepted: waiverChecked,
                categoryWaiverAccepted: categoryWaiverChecked,
                availableFrom: new Date(availableFrom).toISOString(),
                availableTo: new Date(availableTo).toISOString(),
              })}
              disabled={
                acceptMutation.isPending ||
                !waiverChecked ||
                !availableFrom ||
                !availableTo ||
                ((job.category === "Verify & Inspect" || job.category === "Skilled Labor" || job.category === "General Labor" || job.category === "On-Demand Help" || job.category === "Marketplace") && !categoryWaiverChecked)
              }
              className="w-full h-12 font-display tracking-wider bg-primary text-primary-foreground rounded-xl disabled:opacity-40"
              data-testid="button-confirm-accept-job"
            >
              {acceptMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "CONFIRM & ACCEPT JOB"}
            </Button>
          </div>
        </div>
      )}

      {/* ── EDIT JOB MODAL ──────────────────────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4" data-testid="modal-edit-job">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
          <div className="relative bg-card rounded-3xl border border-border/20 p-6 w-full max-w-lg space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base">Edit Post</h3>
              <button onClick={() => setShowEditModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-bold">Title</label>
                <input
                  className="w-full mt-1 bg-background border border-border/30 rounded-xl px-3 py-2.5 text-sm font-display focus:outline-none focus:border-primary/50"
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Job title"
                  data-testid="input-edit-title"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-bold">Description</label>
                <Textarea
                  className="w-full mt-1 bg-background border border-border/30 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary/50 min-h-[80px]"
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Additional details..."
                  data-testid="input-edit-description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-bold">Budget ($)</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full mt-1 bg-background border border-border/30 rounded-xl px-3 py-2.5 text-sm font-display focus:outline-none focus:border-primary/50"
                    value={editForm.budget}
                    onChange={e => setEditForm(f => ({ ...f, budget: e.target.value }))}
                    placeholder="0.00"
                    data-testid="input-edit-budget"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#00E5E5] uppercase tracking-wider font-bold">Location / Address</label>
                <div className="mt-1">
                  <PlacesAutocomplete
                    value={editForm.location}
                    onChange={v => setEditForm(f => ({ ...f, location: v, lat: null, lng: null }))}
                    onPlaceSelect={(place) => {
                      setEditForm(f => ({
                        ...f,
                        location: place.name ? `${place.name}, ${place.address}` : place.address,
                        zip: place.zip || f.zip,
                        lat: place.lat,
                        lng: place.lng,
                      }));
                    }}
                    placeholder="Search address or business name"
                    data-testid="input-edit-location"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowEditModal(false)} className="flex-1 font-display">
                Cancel
              </Button>
              <Button
                onClick={() => editMutation.mutate(editForm)}
                disabled={editMutation.isPending || !editForm.title.trim()}
                className="flex-1 font-display bg-primary text-primary-foreground"
                data-testid="button-confirm-edit"
              >
                {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ─────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center p-4" data-testid="modal-delete-confirm">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-card rounded-3xl border border-destructive/20 p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base">Delete Post?</h3>
                <p className="text-xs text-muted-foreground">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              "<span className="text-foreground font-medium">{job.title}</span>" will be permanently removed.
            </p>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)} className="flex-1 font-display">
                Keep It
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 font-display"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </GuberLayout>
  );
}
