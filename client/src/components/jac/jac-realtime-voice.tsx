/**
 * JAC Realtime Voice — WebRTC-powered voice UI.
 * Uses OpenAI Realtime API for streaming audio + interruption support.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { JacRealtimeClient, type JacRealtimeStatus, type JacRealtimeMetrics } from "@/lib/jac-realtime";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, PhoneOff, Zap, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onClose?: () => void;
  /** If provided, inject this as the first user message (demo/test mode) */
  initialPrompt?: string;
  showMetrics?: boolean;
}

export function JacRealtimeVoice({ onClose, initialPrompt, showMetrics }: Props) {
  const [status, setStatus] = useState<JacRealtimeStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [metrics, setMetrics] = useState<JacRealtimeMetrics | null>(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolName, setToolName] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const clientRef = useRef<JacRealtimeClient | null>(null);
  const promptInjectedRef = useRef(false);

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    promptInjectedRef.current = false;
    setTranscript("");
    setUserTranscript("");
    setError(null);
    setToolName(null);

    const client = new JacRealtimeClient();
    clientRef.current = client;

    client.on((event) => {
      switch (event.type) {
        case "status":
          setStatus(event.payload.status);
          if (event.payload.status === "ready" && initialPrompt && !promptInjectedRef.current) {
            promptInjectedRef.current = true;
            setTimeout(() => client.injectUserMessage(initialPrompt), 400);
          }
          break;
        case "transcript_delta":
          setTranscript(event.payload.text);
          break;
        case "transcript_done":
          setTranscript(event.payload.text);
          break;
        case "user_transcript":
          setUserTranscript(event.payload.text);
          break;
        case "tool_call":
          setToolName(event.payload.name);
          break;
        case "tool_result":
          setToolName(null);
          break;
        case "navigate":
          navigate(event.payload.route);
          break;
        case "metrics":
          setMetrics(event.payload);
          break;
        case "error":
          setError(event.payload.message);
          break;
      }
    });

    await client.connect();
  }, [initialPrompt, navigate]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setStatus("idle");
    setTranscript("");
    setUserTranscript("");
    setToolName(null);
  }, []);

  const toggleMute = useCallback(() => {
    if (!clientRef.current) return;
    const next = !muted;
    clientRef.current.setMuted(next);
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  // ── Derived UI state ───────────────────────────────────────────────────────

  const isConnected = status === "ready" || status === "listening" || status === "speaking" || status === "tool_calling";
  const isLoading = status === "connecting";

  const statusLabel: Record<JacRealtimeStatus, string> = {
    idle: "Tap to connect",
    connecting: "Connecting…",
    ready: "Listening",
    listening: "Listening…",
    speaking: "JAC is speaking",
    tool_calling: toolName ? `Checking ${toolName.replace(/_/g, " ")}…` : "Looking up…",
    interrupted: "You interrupted — listening",
    error: error || "Connection error",
    closed: "Session ended",
  };

  const pulseClass = {
    idle: "",
    connecting: "animate-pulse",
    ready: "animate-pulse",
    listening: "animate-[pulse_0.8s_ease-in-out_infinite]",
    speaking: "animate-[pulse_1.2s_ease-in-out_infinite]",
    tool_calling: "animate-pulse",
    interrupted: "animate-pulse",
    error: "",
    closed: "",
  }[status];

  const orb = {
    idle: "bg-zinc-800",
    connecting: "bg-zinc-700",
    ready: "bg-emerald-600/80",
    listening: "bg-blue-500/90",
    speaking: "bg-violet-600/90",
    tool_calling: "bg-amber-500/80",
    interrupted: "bg-orange-500/80",
    error: "bg-red-700/80",
    closed: "bg-zinc-800",
  }[status];

  return (
    <div className="flex flex-col items-center gap-6 py-6 select-none">

      {/* Central orb */}
      <div className="relative flex items-center justify-center">
        {isConnected && (
          <div className={cn(
            "absolute rounded-full opacity-30",
            orb,
            pulseClass,
          )} style={{ width: 140, height: 140 }} />
        )}
        <button
          onClick={isConnected ? disconnect : connect}
          disabled={isLoading}
          data-testid="button-jac-realtime-toggle"
          className={cn(
            "relative z-10 flex items-center justify-center rounded-full transition-all duration-300 focus:outline-none",
            "w-24 h-24 shadow-xl",
            orb,
            isLoading && "opacity-60 cursor-not-allowed",
            isConnected && "hover:scale-95",
            !isConnected && !isLoading && "hover:scale-105",
          )}
        >
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          ) : isConnected ? (
            <PhoneOff className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </button>
      </div>

      {/* Status label */}
      <p className="text-sm text-muted-foreground font-medium tracking-wide text-center">
        {statusLabel[status]}
      </p>

      {/* Tool call indicator */}
      {toolName && (
        <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-full border border-amber-400/20">
          <Zap className="w-3 h-3" />
          {toolName.replace(/_/g, " ")}
        </div>
      )}

      {/* JAC transcript */}
      {transcript && (
        <div
          data-testid="text-jac-transcript"
          className="max-w-xs text-center text-sm text-foreground bg-muted/60 rounded-2xl px-4 py-3 leading-relaxed"
        >
          {transcript}
        </div>
      )}

      {/* User transcript */}
      {userTranscript && (
        <div className="max-w-xs text-center text-xs text-muted-foreground italic">
          You: "{userTranscript}"
        </div>
      )}

      {/* Error */}
      {error && status === "error" && (
        <p className="text-xs text-destructive text-center max-w-xs">{error}</p>
      )}

      {/* Controls when connected */}
      {isConnected && (
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={toggleMute}
            data-testid="button-jac-realtime-mute"
            className={cn(muted && "border-destructive text-destructive")}
          >
            {muted ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { disconnect(); onClose?.(); }}
            data-testid="button-jac-realtime-end"
          >
            <PhoneOff className="w-4 h-4 mr-1" />
            End
          </Button>
        </div>
      )}

      {/* Metrics panel */}
      {showMetrics && metrics && (
        <div className="w-full max-w-xs rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-semibold text-muted-foreground mb-2">Session Metrics</p>
          <Row label="Time to first audio" value={metrics.timeToFirstAudioMs != null ? `${metrics.timeToFirstAudioMs} ms` : "—"} />
          <Row label="Interruptions" value={String(metrics.interruptionCount)} />
          <Row label="Tool calls" value={String(metrics.toolCallCount)} />
          <Row label="Avg tool latency" value={metrics.toolCallCount > 0 ? `${Math.round(metrics.toolCallTotalMs / metrics.toolCallCount)} ms` : "—"} />
          <Row label="JAC messages" value={String(metrics.messageCount)} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
