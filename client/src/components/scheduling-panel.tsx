import { useState, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Calendar as CalendarIcon, Clock, CheckCircle2, X, RefreshCw,
  AlertCircle, Send, ThumbsDown, Hourglass, ChevronRight,
} from "lucide-react";

type AvailabilityWindow = { date: string; startTime: string; endTime: string };

type SchedJob = {
  id: number;
  postedById: number;
  assignedHelperId: number | null;
  status: string;
  availabilityWindows?: AvailabilityWindow[] | null;
  scheduleStatus?: string | null;
  selectedWorkerTime?: string | null;
  selectedArrivalWindowStart?: string | null;
  selectedArrivalWindowEnd?: string | null;
  posterConfirmedTime?: string | null;
  workerAcceptedAt?: string | null;
  lastTimeSelectionAt?: string | null;
  rescheduleSuggestedWindow?: AvailabilityWindow | null;
  rescheduleRequestedBy?: string | null;
  rescheduleCountPoster?: number | null;
  rescheduleCountWorker?: number | null;
  paymentAuthorized?: boolean | null;
};

type Props = {
  job: SchedJob;
  viewerId: number | undefined;
};

const STATUS = {
  PENDING_WORKER_TIME: "pending_worker_time",
  PENDING_POSTER_CONFIRMATION: "pending_poster_confirmation",
  POSTER_SUGGESTED_WINDOW: "poster_suggested_window",
  SCHEDULED: "scheduled",
} as const;

const WORKER_PICK_TIMEOUT_MIN = 15;
const POSTER_CONFIRM_TIMEOUT_MIN = 30;
const MAX_RESCHEDULES_PER_SIDE = 1;

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function windowToDateRange(w: AvailabilityWindow): { start: Date; end: Date } {
  const [sh, sm] = w.startTime.split(":").map(Number);
  const [eh, em] = w.endTime.split(":").map(Number);
  const [y, mo, d] = w.date.split("-").map(Number);
  const start = new Date(y, (mo ?? 1) - 1, d ?? 1, sh ?? 0, sm ?? 0, 0, 0);
  const end = new Date(y, (mo ?? 1) - 1, d ?? 1, eh ?? 0, em ?? 0, 0, 0);
  return { start, end };
}

function isInsideAnyWindow(arrival: Date, windows: AvailabilityWindow[]): boolean {
  return windows.some(w => {
    const { start, end } = windowToDateRange(w);
    return arrival >= start && arrival <= end;
  });
}

function toLocalDatetimeString(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}

function formatWindow(w: AvailabilityWindow): string {
  const { start, end } = windowToDateRange(w);
  const dayLabel = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const endLabel = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${dayLabel}, ${startLabel} – ${endLabel}`;
}

// Live mm:ss until target. Returns null if expired.
function useCountdown(target: Date | null): { mmss: string | null; expired: boolean } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return { mmss: null, expired: false };
  const ms = target.getTime() - now;
  if (ms <= 0) return { mmss: "0:00", expired: true };
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { mmss: `${m}:${String(s).padStart(2, "0")}`, expired: false };
}

export function SchedulingPanel({ job, viewerId }: Props) {
  const { toast } = useToast();
  const isOwner = viewerId === job.postedById;
  const isHelper = viewerId === job.assignedHelperId;

  // Only show during the structured scheduling lifetime — once the job is
  // in_progress or completed, the rest of the screen takes over.
  const ALLOWED_STATUSES = new Set(["accepted_pending_payment", "funded", "active"]);
  if (!ALLOWED_STATUSES.has(job.status)) return null;
  if (!isOwner && !isHelper) return null;
  if (!job.scheduleStatus) return null; // legacy / not engaged

  const windows = (job.availabilityWindows || []) as AvailabilityWindow[];
  const status = job.scheduleStatus;

  // ── Mutations ──────────────────────────────────────────────────────────
  // job-detail.tsx subscribes with queryKey: ["/api/jobs", jobId] where jobId
  // is the **string** from useParams(). React Query matches keys structurally,
  // so we must invalidate with the same string form (not job.id which is a
  // number). We invalidate both shapes to also catch any consumer using the
  // numeric id, plus the list endpoint for browse/dashboard caches.
  const jobIdStr = String(job.id);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobIdStr] });
    queryClient.invalidateQueries({ queryKey: ["/api/jobs", job.id] });
    queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
  };

  const selectTimeMutation = useMutation({
    mutationFn: async (body: { mode: "exact" | "window"; arrivalTime: string; arrivalWindowEnd?: string }) => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/select-time`, body);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Time submitted", description: "Waiting for the poster to confirm." }); },
    onError: (e: any) => toast({ title: "Could not submit time", description: e.message, variant: "destructive" }),
  });

  const confirmTimeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/confirm-time`);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Time confirmed", description: "Address and navigation are now unlocked." }); },
    onError: (e: any) => toast({ title: "Could not confirm time", description: e.message, variant: "destructive" }),
  });

  const rejectTimeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/reject-time`);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Time rejected", description: "The worker will pick a new time." }); },
    onError: (e: any) => toast({ title: "Could not reject time", description: e.message, variant: "destructive" }),
  });

  const suggestWindowMutation = useMutation({
    mutationFn: async (body: AvailabilityWindow) => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/suggest-window`, body);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Counter-window sent", description: "Waiting for the worker to respond." }); setShowSuggestForm(false); },
    onError: (e: any) => toast({ title: "Could not send counter-window", description: e.message, variant: "destructive" }),
  });

  const respondSuggestedMutation = useMutation({
    mutationFn: async (body: { accept: boolean; arrivalTime?: string }) => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/respond-suggested-window`, body);
      return res.json();
    },
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast({ title: "Could not respond", description: e.message, variant: "destructive" }),
  });

  const rescheduleRequestMutation = useMutation({
    mutationFn: async (body: AvailabilityWindow & { arrivalTime?: string }) => {
      const res = await apiRequest("POST", `/api/jobs/${job.id}/reschedule-request`, body);
      return res.json();
    },
    onSuccess: () => { invalidate(); toast({ title: "Reschedule requested", description: "The other side will see your proposal." }); setShowRescheduleForm(false); },
    onError: (e: any) => toast({ title: "Could not reschedule", description: e.message, variant: "destructive" }),
  });

  // ── Local UI state ─────────────────────────────────────────────────────
  const [pickedDateTime, setPickedDateTime] = useState<string>("");
  const [pickedMode, setPickedMode] = useState<"exact" | "window">("exact");
  const [pickedWindowEnd, setPickedWindowEnd] = useState<string>("");
  const [pickError, setPickError] = useState<string>("");

  const [showSuggestForm, setShowSuggestForm] = useState(false);
  const [suggestWindow, setSuggestWindow] = useState<AvailabilityWindow>({ date: "", startTime: "", endTime: "" });

  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleWindow, setRescheduleWindow] = useState<AvailabilityWindow>({ date: "", startTime: "", endTime: "" });
  const [rescheduleArrival, setRescheduleArrival] = useState<string>("");

  const [showAcceptSuggested, setShowAcceptSuggested] = useState(false);
  const [acceptArrival, setAcceptArrival] = useState<string>("");

  // ── Derived bits ───────────────────────────────────────────────────────
  const workerPickDeadline = useMemo(() => {
    if (status !== STATUS.PENDING_WORKER_TIME) return null;
    if (!job.workerAcceptedAt) return null;
    return new Date(new Date(job.workerAcceptedAt).getTime() + WORKER_PICK_TIMEOUT_MIN * 60_000);
  }, [status, job.workerAcceptedAt]);

  const posterConfirmDeadline = useMemo(() => {
    if (status !== STATUS.PENDING_POSTER_CONFIRMATION) return null;
    if (!job.lastTimeSelectionAt) return null;
    return new Date(new Date(job.lastTimeSelectionAt).getTime() + POSTER_CONFIRM_TIMEOUT_MIN * 60_000);
  }, [status, job.lastTimeSelectionAt]);

  const workerCountdown = useCountdown(workerPickDeadline);
  const posterCountdown = useCountdown(posterConfirmDeadline);

  const posterReschedulesUsed = job.rescheduleCountPoster || 0;
  const workerReschedulesUsed = job.rescheduleCountWorker || 0;
  const canPosterReschedule = posterReschedulesUsed < MAX_RESCHEDULES_PER_SIDE;
  const canWorkerReschedule = workerReschedulesUsed < MAX_RESCHEDULES_PER_SIDE;

  // ── Submit helpers ─────────────────────────────────────────────────────
  const submitPickedTime = () => {
    setPickError("");
    if (!pickedDateTime) { setPickError("Pick a start time."); return; }
    const arrival = new Date(pickedDateTime);
    if (isNaN(arrival.getTime())) { setPickError("Invalid date/time."); return; }
    if (windows.length > 0 && !isInsideAnyWindow(arrival, windows)) {
      setPickError("That time isn't inside any of the poster's windows.");
      return;
    }
    if (pickedMode === "window") {
      if (!pickedWindowEnd) { setPickError("Pick an end time for your window."); return; }
      const end = new Date(pickedWindowEnd);
      if (isNaN(end.getTime()) || end <= arrival) { setPickError("End time must be after start time."); return; }
      if (end.getTime() - arrival.getTime() > 60 * 60_000) { setPickError("Arrival window can't exceed 60 minutes."); return; }
      selectTimeMutation.mutate({ mode: "window", arrivalTime: arrival.toISOString(), arrivalWindowEnd: end.toISOString() });
    } else {
      selectTimeMutation.mutate({ mode: "exact", arrivalTime: arrival.toISOString() });
    }
  };

  const submitSuggestWindow = () => {
    if (!suggestWindow.date || !suggestWindow.startTime || !suggestWindow.endTime) {
      toast({ title: "Fill the window", variant: "destructive" }); return;
    }
    if (suggestWindow.startTime >= suggestWindow.endTime) {
      toast({ title: "End must be after start", variant: "destructive" }); return;
    }
    suggestWindowMutation.mutate(suggestWindow);
  };

  const submitAcceptSuggested = () => {
    if (!acceptArrival) { toast({ title: "Pick a start time", variant: "destructive" }); return; }
    const arrival = new Date(acceptArrival);
    if (isNaN(arrival.getTime())) { toast({ title: "Invalid time", variant: "destructive" }); return; }
    const sw = job.rescheduleSuggestedWindow;
    if (sw) {
      const { start, end } = windowToDateRange(sw);
      if (arrival < start || arrival > end) {
        toast({ title: "Time must be inside the suggested window", variant: "destructive" });
        return;
      }
    }
    respondSuggestedMutation.mutate({ accept: true, arrivalTime: arrival.toISOString() });
  };

  const submitWorkerReschedule = () => {
    if (!rescheduleWindow.date || !rescheduleWindow.startTime || !rescheduleWindow.endTime) {
      toast({ title: "Fill the proposed window", variant: "destructive" }); return;
    }
    if (rescheduleWindow.startTime >= rescheduleWindow.endTime) {
      toast({ title: "End must be after start", variant: "destructive" }); return;
    }
    if (!rescheduleArrival) { toast({ title: "Pick a start time", variant: "destructive" }); return; }
    const arrival = new Date(rescheduleArrival);
    if (isNaN(arrival.getTime())) { toast({ title: "Invalid time", variant: "destructive" }); return; }
    const { start, end } = windowToDateRange(rescheduleWindow);
    if (arrival < start || arrival > end) {
      toast({ title: "Start time must be inside the window", variant: "destructive" }); return;
    }
    rescheduleRequestMutation.mutate({ ...rescheduleWindow, arrivalTime: arrival.toISOString() });
  };

  const submitPosterReschedule = () => {
    if (!rescheduleWindow.date || !rescheduleWindow.startTime || !rescheduleWindow.endTime) {
      toast({ title: "Fill the proposed window", variant: "destructive" }); return;
    }
    if (rescheduleWindow.startTime >= rescheduleWindow.endTime) {
      toast({ title: "End must be after start", variant: "destructive" }); return;
    }
    rescheduleRequestMutation.mutate(rescheduleWindow);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const headerLabel: Record<string, string> = {
    [STATUS.PENDING_WORKER_TIME]: isHelper ? "Pick your start time" : "Waiting for worker to pick a time",
    [STATUS.PENDING_POSTER_CONFIRMATION]: isOwner ? "Confirm the worker's time" : "Waiting for poster to confirm",
    [STATUS.POSTER_SUGGESTED_WINDOW]: isHelper ? "Poster suggested a different window" : "Waiting for worker to respond",
    [STATUS.SCHEDULED]: "Scheduled",
  };

  return (
    <div className="bg-card rounded-2xl border border-border/20 p-5 mb-4 space-y-4" data-testid="section-scheduling">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-emerald-400" />
          <h3 className="font-display font-bold text-sm uppercase tracking-wider">{headerLabel[status] || "Scheduling"}</h3>
        </div>
        {(workerCountdown.mmss && status === STATUS.PENDING_WORKER_TIME) && (
          <span className="text-[11px] font-display font-bold text-amber-400 flex items-center gap-1" data-testid="text-worker-countdown">
            <Hourglass className="w-3 h-3" /> {workerCountdown.mmss}
          </span>
        )}
        {(posterCountdown.mmss && status === STATUS.PENDING_POSTER_CONFIRMATION) && (
          <span className="text-[11px] font-display font-bold text-amber-400 flex items-center gap-1" data-testid="text-poster-countdown">
            <Hourglass className="w-3 h-3" /> {posterCountdown.mmss}
          </span>
        )}
      </div>

      {/* ── Show poster's offered windows for context (worker view only) ── */}
      {windows.length > 0 && (status === STATUS.PENDING_WORKER_TIME) && isHelper && (
        <div className="space-y-1.5" data-testid="list-poster-windows">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Poster's availability</p>
          <div className="space-y-1">
            {windows.map((w, i) => (
              <div key={i} className="bg-background rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                <span data-testid={`text-window-${i}`}>{formatWindow(w)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Worker @ pending_worker_time: pick a slot ─────────────────── */}
      {isHelper && status === STATUS.PENDING_WORKER_TIME && (
        <div className="space-y-3" data-testid="form-worker-pick-time">
          {workerCountdown.expired && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-xs text-destructive flex gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Pick window expired — the job may re-open if you don't submit a time soon.</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPickedMode("exact")}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-display font-bold uppercase tracking-wider transition-colors ${pickedMode === "exact" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-background border border-border/30 text-muted-foreground"}`}
              data-testid="button-mode-exact"
            >
              Exact time
            </button>
            <button
              type="button"
              onClick={() => setPickedMode("window")}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-display font-bold uppercase tracking-wider transition-colors ${pickedMode === "window" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-background border border-border/30 text-muted-foreground"}`}
              data-testid="button-mode-window"
            >
              Within a window
            </button>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">Start time</label>
            <input
              type="datetime-local"
              value={pickedDateTime}
              onChange={(e) => setPickedDateTime(e.target.value)}
              className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
              data-testid="input-arrival-time"
            />
          </div>
          {pickedMode === "window" && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">End of arrival window (≤ 60 min later)</label>
              <input
                type="datetime-local"
                value={pickedWindowEnd}
                onChange={(e) => setPickedWindowEnd(e.target.value)}
                className="w-full bg-background border border-border/30 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                data-testid="input-arrival-window-end"
              />
            </div>
          )}
          {pickError && <p className="text-[11px] text-destructive font-medium">{pickError}</p>}
          <Button
            onClick={submitPickedTime}
            disabled={selectTimeMutation.isPending}
            className="w-full h-10 font-display tracking-wider rounded-xl"
            data-testid="button-submit-time"
          >
            {selectTimeMutation.isPending ? "Submitting..." : "SUBMIT START TIME"}
          </Button>
        </div>
      )}

      {/* ── Worker @ pending_worker_time but is poster (just informational) ─ */}
      {isOwner && status === STATUS.PENDING_WORKER_TIME && (
        <div className="text-xs text-muted-foreground" data-testid="text-poster-waiting-pick">
          The worker has accepted and is choosing a start time inside one of your windows.
        </div>
      )}

      {/* ── Poster @ pending_poster_confirmation: confirm/reject/suggest ── */}
      {status === STATUS.PENDING_POSTER_CONFIRMATION && (
        <div className="space-y-3">
          <div className="bg-background rounded-xl p-3 space-y-1" data-testid="block-worker-selected-time">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Worker proposes</p>
            <p className="text-sm font-display font-bold flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              {job.selectedArrivalWindowStart && job.selectedArrivalWindowEnd ? (
                <>
                  {formatLocal(job.selectedArrivalWindowStart)} – {new Date(job.selectedArrivalWindowEnd).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </>
              ) : (
                formatLocal(job.selectedWorkerTime)
              )}
            </p>
          </div>

          {isOwner && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => confirmTimeMutation.mutate()}
                  disabled={confirmTimeMutation.isPending}
                  className="h-10 rounded-xl font-display tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                  data-testid="button-confirm-time"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" /> CONFIRM
                </Button>
                <Button
                  onClick={() => rejectTimeMutation.mutate()}
                  disabled={rejectTimeMutation.isPending}
                  variant="outline"
                  className="h-10 rounded-xl font-display tracking-wider border-destructive/40 text-destructive hover:bg-destructive/10"
                  data-testid="button-reject-time"
                >
                  <ThumbsDown className="w-4 h-4 mr-1.5" /> REJECT
                </Button>
              </div>
              {!showSuggestForm ? (
                <Button
                  onClick={() => setShowSuggestForm(true)}
                  variant="outline"
                  className="w-full h-9 rounded-xl text-xs font-display tracking-wider border-border/30"
                  data-testid="button-open-suggest"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Or suggest a different window
                </Button>
              ) : (
                <div className="space-y-2 bg-background rounded-xl p-3" data-testid="form-suggest-window">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Counter-suggest a window</p>
                  <input
                    type="date"
                    value={suggestWindow.date}
                    onChange={(e) => setSuggestWindow(w => ({ ...w, date: e.target.value }))}
                    className="w-full bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                    data-testid="input-suggest-date"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={suggestWindow.startTime}
                      onChange={(e) => setSuggestWindow(w => ({ ...w, startTime: e.target.value }))}
                      className="bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                      data-testid="input-suggest-start"
                    />
                    <input
                      type="time"
                      value={suggestWindow.endTime}
                      onChange={(e) => setSuggestWindow(w => ({ ...w, endTime: e.target.value }))}
                      className="bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                      data-testid="input-suggest-end"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={submitSuggestWindow}
                      disabled={suggestWindowMutation.isPending}
                      className="flex-1 h-9 rounded-xl text-xs font-display tracking-wider"
                      data-testid="button-submit-suggest"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" /> SEND
                    </Button>
                    <Button
                      onClick={() => setShowSuggestForm(false)}
                      variant="outline"
                      className="h-9 rounded-xl text-xs font-display tracking-wider border-border/30"
                      data-testid="button-cancel-suggest"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {isHelper && (
            <p className="text-xs text-muted-foreground" data-testid="text-worker-waiting-confirmation">
              Waiting for the poster to confirm. They have {posterCountdown.mmss || `${POSTER_CONFIRM_TIMEOUT_MIN} min`} to respond.
            </p>
          )}
        </div>
      )}

      {/* ── Worker @ poster_suggested_window ──────────────────────────── */}
      {status === STATUS.POSTER_SUGGESTED_WINDOW && job.rescheduleSuggestedWindow && (
        <div className="space-y-3">
          <div className="bg-background rounded-xl p-3 space-y-1" data-testid="block-suggested-window">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Poster suggests</p>
            <p className="text-sm font-display font-bold flex items-center gap-2">
              <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
              {formatWindow(job.rescheduleSuggestedWindow)}
            </p>
          </div>

          {isHelper && !showAcceptSuggested && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  const { start } = windowToDateRange(job.rescheduleSuggestedWindow!);
                  setAcceptArrival(toLocalDatetimeString(start));
                  setShowAcceptSuggested(true);
                }}
                className="h-10 rounded-xl font-display tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30"
                data-testid="button-open-accept-suggested"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> ACCEPT
              </Button>
              <Button
                onClick={() => respondSuggestedMutation.mutate({ accept: false })}
                disabled={respondSuggestedMutation.isPending}
                variant="outline"
                className="h-10 rounded-xl font-display tracking-wider border-destructive/40 text-destructive hover:bg-destructive/10"
                data-testid="button-reject-suggested"
              >
                <X className="w-4 h-4 mr-1.5" /> REJECT
              </Button>
            </div>
          )}

          {isHelper && showAcceptSuggested && (
            <div className="space-y-2 bg-background rounded-xl p-3" data-testid="form-accept-suggested">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Pick a start time inside the suggested window</p>
              <input
                type="datetime-local"
                value={acceptArrival}
                onChange={(e) => setAcceptArrival(e.target.value)}
                className="w-full bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                data-testid="input-accept-arrival"
              />
              <div className="flex gap-2">
                <Button
                  onClick={submitAcceptSuggested}
                  disabled={respondSuggestedMutation.isPending}
                  className="flex-1 h-9 rounded-xl text-xs font-display tracking-wider"
                  data-testid="button-submit-accept-suggested"
                >
                  CONFIRM ACCEPT
                </Button>
                <Button
                  onClick={() => setShowAcceptSuggested(false)}
                  variant="outline"
                  className="h-9 rounded-xl text-xs font-display tracking-wider border-border/30"
                  data-testid="button-cancel-accept-suggested"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {isOwner && (
            <p className="text-xs text-muted-foreground" data-testid="text-poster-waiting-suggested-response">
              Waiting for the worker to accept or reject your counter-suggestion.
            </p>
          )}
        </div>
      )}

      {/* ── Both @ scheduled ──────────────────────────────────────────── */}
      {status === STATUS.SCHEDULED && (
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 space-y-1" data-testid="block-scheduled-time">
            <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-400">Confirmed start</p>
            <p className="text-sm font-display font-bold flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {job.selectedArrivalWindowStart && job.selectedArrivalWindowEnd ? (
                <>
                  {formatLocal(job.selectedArrivalWindowStart)} – {new Date(job.selectedArrivalWindowEnd).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </>
              ) : (
                formatLocal(job.posterConfirmedTime || job.selectedWorkerTime)
              )}
            </p>
          </div>

          {/* Reschedule (per-side counter) */}
          {!showRescheduleForm && (
            <>
              {isOwner && (
                <Button
                  onClick={() => {
                    setRescheduleWindow({ date: "", startTime: "", endTime: "" });
                    setShowRescheduleForm(true);
                  }}
                  disabled={!canPosterReschedule}
                  variant="outline"
                  className="w-full h-9 rounded-xl text-xs font-display tracking-wider border-border/30 disabled:opacity-50"
                  data-testid="button-open-reschedule-poster"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  {canPosterReschedule ? "RESCHEDULE (1 LEFT)" : "RESCHEDULE LIMIT REACHED"}
                </Button>
              )}
              {isHelper && (
                <Button
                  onClick={() => {
                    setRescheduleWindow({ date: "", startTime: "", endTime: "" });
                    setRescheduleArrival("");
                    setShowRescheduleForm(true);
                  }}
                  disabled={!canWorkerReschedule}
                  variant="outline"
                  className="w-full h-9 rounded-xl text-xs font-display tracking-wider border-border/30 disabled:opacity-50"
                  data-testid="button-open-reschedule-worker"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  {canWorkerReschedule ? "REQUEST RESCHEDULE (1 LEFT)" : "RESCHEDULE LIMIT REACHED"}
                </Button>
              )}
            </>
          )}

          {showRescheduleForm && (
            <div className="space-y-2 bg-background rounded-xl p-3" data-testid="form-reschedule">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {isOwner ? "Propose a new window" : "Propose a new window + start time"}
              </p>
              <input
                type="date"
                value={rescheduleWindow.date}
                onChange={(e) => setRescheduleWindow(w => ({ ...w, date: e.target.value }))}
                className="w-full bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                data-testid="input-reschedule-date"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={rescheduleWindow.startTime}
                  onChange={(e) => setRescheduleWindow(w => ({ ...w, startTime: e.target.value }))}
                  className="bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                  data-testid="input-reschedule-start"
                />
                <input
                  type="time"
                  value={rescheduleWindow.endTime}
                  onChange={(e) => setRescheduleWindow(w => ({ ...w, endTime: e.target.value }))}
                  className="bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                  data-testid="input-reschedule-end"
                />
              </div>
              {isHelper && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">Your new start time</label>
                  <input
                    type="datetime-local"
                    value={rescheduleArrival}
                    onChange={(e) => setRescheduleArrival(e.target.value)}
                    className="w-full bg-card border border-border/30 rounded-lg px-3 py-2 text-sm"
                    data-testid="input-reschedule-arrival"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={isOwner ? submitPosterReschedule : submitWorkerReschedule}
                  disabled={rescheduleRequestMutation.isPending}
                  className="flex-1 h-9 rounded-xl text-xs font-display tracking-wider"
                  data-testid="button-submit-reschedule"
                >
                  <Send className="w-3.5 h-3.5 mr-1.5" /> SEND
                </Button>
                <Button
                  onClick={() => setShowRescheduleForm(false)}
                  variant="outline"
                  className="h-9 rounded-xl text-xs font-display tracking-wider border-border/30"
                  data-testid="button-cancel-reschedule"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export the gating helper so consumers don't have to duplicate the rule.
export function isJobAddressUnlocked(job: {
  paymentAuthorized?: boolean | null;
  assignedHelperId?: number | null;
  scheduleStatus?: string | null;
  status?: string | null;
}): boolean {
  if (job.paymentAuthorized && job.assignedHelperId && job.scheduleStatus === "scheduled") {
    return true;
  }
  const LEGACY_UNLOCKED = new Set(["funded", "active", "in_progress", "completion_submitted", "proof_submitted"]);
  return !!(job.status && LEGACY_UNLOCKED.has(job.status));
}
