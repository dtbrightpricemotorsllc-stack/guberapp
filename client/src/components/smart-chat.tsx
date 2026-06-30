/**
 * SmartChat — structured quick-action panel for active job participants.
 *
 * All actions hit real backend endpoints.  No fake messages.
 * - Worker actions: status transitions + notifications
 * - Requester actions: proof review + notifications
 * - V&I proof requests: structured retake triggers
 * - Load Board: carrier progress + shipper confirmations
 * - Marketplace: meetup/handoff status
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";

type ActionResult = { ok: boolean; message?: string };

interface QuickAction {
  id: string;
  label: string;
  emoji: string;
  variant?: "default" | "primary" | "success" | "warn" | "danger";
  confirm?: string;
}

const WORKER_ACTIONS: QuickAction[] = [
  { id: "on_the_way",       label: "I'm on my way",       emoji: "🚗", variant: "primary" },
  { id: "arrived",          label: "I've arrived",        emoji: "📍", variant: "success" },
  { id: "running_late",     label: "Running late",        emoji: "⏳", variant: "warn" },
  { id: "need_clarification", label: "Need clarification", emoji: "❓" },
  { id: "proof_uploaded",   label: "Proof uploaded",      emoji: "📸", variant: "success" },
  { id: "job_complete",     label: "Job complete",        emoji: "✅", variant: "success" },
];

const REQUESTER_ACTIONS: QuickAction[] = [
  { id: "looks_good",       label: "Looks good",          emoji: "✅", variant: "success" },
  { id: "retake_photo",     label: "Request retake",      emoji: "📷", variant: "warn" },
  { id: "reviewing_now",    label: "Reviewing now",       emoji: "👀" },
  { id: "approved",         label: "Approved",            emoji: "🎉", variant: "success" },
  { id: "issue_found",      label: "Issue found",         emoji: "⚠️", variant: "danger" },
];

const VI_PROOF_REQUESTS: QuickAction[] = [
  { id: "req_vin",          label: "VIN",                 emoji: "🔢" },
  { id: "req_odometer",     label: "Odometer",            emoji: "🔢" },
  { id: "req_driver_seat",  label: "Driver seat",         emoji: "🪑" },
  { id: "req_passenger",    label: "Passenger seat",      emoji: "🪑" },
  { id: "req_engine",       label: "Engine bay",          emoji: "🔧" },
  { id: "req_tires",        label: "Tires",               emoji: "⭕" },
  { id: "req_roof",         label: "Roof",                emoji: "🏠" },
  { id: "req_windshield",   label: "Windshield",          emoji: "🪟" },
  { id: "req_trunk",        label: "Trunk",               emoji: "📦" },
  { id: "req_undercarriage",label: "Undercarriage",       emoji: "🔩" },
];

const CARRIER_ACTIONS: QuickAction[] = [
  { id: "leaving_pickup",   label: "Leaving for pickup",  emoji: "🚛", variant: "primary" },
  { id: "arrived_pickup",   label: "Arrived at pickup",   emoji: "📍", variant: "primary" },
  { id: "loaded",           label: "Loaded",              emoji: "✅", variant: "success" },
  { id: "in_transit",       label: "In transit",          emoji: "🛣️" },
  { id: "fuel_stop",        label: "Fuel stop",           emoji: "⛽" },
  { id: "delay",            label: "Delay",               emoji: "⏳", variant: "warn" },
  { id: "mechanical_issue", label: "Mechanical issue",    emoji: "🔧", variant: "danger" },
  { id: "delivered",        label: "Delivered",           emoji: "🎉", variant: "success" },
];

const SHIPPER_ACTIONS: QuickAction[] = [
  { id: "gate_code",        label: "Gate code",           emoji: "🔑" },
  { id: "dock_number",      label: "Dock number",         emoji: "🏭" },
  { id: "loading_ready",    label: "Loading ready",       emoji: "✅", variant: "success" },
  { id: "delivery_confirmed", label: "Delivery confirmed", emoji: "📬", variant: "success" },
];

const MARKETPLACE_ACTIONS: QuickAction[] = [
  { id: "leaving_now",      label: "Leaving now",         emoji: "🚗", variant: "primary" },
  { id: "im_here",          label: "I'm here",            emoji: "📍", variant: "primary" },
  { id: "running_late",     label: "Running late",        emoji: "⏳", variant: "warn" },
  { id: "cash_ready",       label: "Cash ready",          emoji: "💵", variant: "success" },
  { id: "title_ready",      label: "Title ready",         emoji: "📄", variant: "success" },
  { id: "meeting_complete", label: "Meeting complete",    emoji: "🤝", variant: "success" },
  { id: "vehicle_sold",     label: "Vehicle sold",        emoji: "🎉", variant: "success" },
];

type FlowType = "job" | "vi" | "load_board" | "marketplace";
type ParticipantRole = "worker" | "requester" | "carrier" | "shipper" | "buyer" | "seller";

interface SmartChatProps {
  jobId: number;
  role: ParticipantRole;
  flowType?: FlowType;
  proofSubmissionId?: number;
  className?: string;
}

function variantStyle(v?: string) {
  switch (v) {
    case "primary": return { background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.35)", color: "rgb(147,197,253)" };
    case "success": return { background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)", color: "rgb(110,231,183)" };
    case "warn":    return { background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.35)", color: "rgb(253,224,71)" };
    case "danger":  return { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "rgb(252,165,165)" };
    default:        return { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)" };
  }
}

function ActionButton({
  action, onTap, disabled, fired,
}: {
  action: QuickAction;
  onTap: (action: QuickAction) => void;
  disabled: boolean;
  fired: boolean;
}) {
  return (
    <button
      onClick={() => onTap(action)}
      disabled={disabled || fired}
      className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
      style={variantStyle(action.variant)}
      data-testid={`smart-action-${action.id}`}
    >
      {fired
        ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
        : <span className="text-sm leading-none">{action.emoji}</span>}
      <span>{action.label}</span>
    </button>
  );
}

export function SmartChat({ jobId, role, flowType = "job", proofSubmissionId, className = "" }: SmartChatProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [fired, setFired] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const quickActionMutation = useMutation({
    mutationFn: async ({ actionId }: { actionId: string }) => {
      // Status transitions → real job status endpoint
      if (actionId === "on_the_way" || actionId === "arrived") {
        const r = await apiRequest("POST", `/api/jobs/${jobId}/status`, { statusType: actionId });
        return r.json() as Promise<ActionResult>;
      }
      // Proof review actions → real proof review endpoint
      if ((actionId === "looks_good" || actionId === "approved") && proofSubmissionId) {
        const r = await apiRequest("POST", `/api/proof-submissions/${proofSubmissionId}/review`, { decision: "satisfied" });
        return r.json() as Promise<ActionResult>;
      }
      if (actionId === "retake_photo" && proofSubmissionId) {
        const r = await apiRequest("POST", `/api/proof-submissions/${proofSubmissionId}/review`, { decision: "retake_requested" });
        return r.json() as Promise<ActionResult>;
      }
      // All other structured actions → quick-action endpoint (logs + notifies)
      const r = await apiRequest("POST", `/api/jobs/${jobId}/quick-action`, { action: actionId, flowType, role });
      return r.json() as Promise<ActionResult>;
    },
    onSuccess: (data, { actionId }) => {
      setFired(prev => new Set(prev).add(actionId));
      qc.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`] });
      toast({ title: "Sent", description: data?.message || "Status update delivered." });
    },
    onError: (e: any, { actionId }) => {
      setPending(null);
      toast({ title: "Couldn't send", description: e?.message || "Try again.", variant: "destructive" });
    },
    onSettled: () => setPending(null),
  });

  function handleTap(action: QuickAction) {
    setPending(action.id);
    quickActionMutation.mutate({ actionId: action.id });
  }

  function getActions(): QuickAction[] {
    if (flowType === "load_board") return role === "carrier" ? CARRIER_ACTIONS : SHIPPER_ACTIONS;
    if (flowType === "marketplace") return MARKETPLACE_ACTIONS;
    if (flowType === "vi" && role === "requester") return [...REQUESTER_ACTIONS, ...VI_PROOF_REQUESTS];
    if (role === "worker") return WORKER_ACTIONS;
    return REQUESTER_ACTIONS;
  }

  const actions = getActions();

  return (
    <div className={`space-y-2 ${className}`} data-testid="smart-chat-panel">
      <p className="text-[10px] font-display font-bold tracking-widest uppercase text-muted-foreground px-1">
        Quick Actions
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map(a => (
          <ActionButton
            key={a.id}
            action={a}
            onTap={handleTap}
            disabled={quickActionMutation.isPending}
            fired={fired.has(a.id)}
          />
        ))}
        {quickActionMutation.isPending && pending && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Sending…
          </div>
        )}
      </div>
    </div>
  );
}
