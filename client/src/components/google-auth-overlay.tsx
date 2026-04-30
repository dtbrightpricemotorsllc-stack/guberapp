import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { GuberLogo } from "@/components/guber-logo";

export type GoogleAuthPhase = null | "connecting" | "completing";

let _phase: GoogleAuthPhase = null;
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((l) => l());
}

export function setGoogleAuthPhase(phase: GoogleAuthPhase) {
  if (_phase === phase) return;
  _phase = phase;
  notify();
}

export function getGoogleAuthPhase(): GoogleAuthPhase {
  return _phase;
}

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

function getSnapshot() {
  return _phase;
}

function getServerSnapshot() {
  return null as GoogleAuthPhase;
}

export function useGoogleAuthPhase(): GoogleAuthPhase {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function GoogleAuthOverlay() {
  const phase = useGoogleAuthPhase();
  if (!phase) return null;
  return (
    <div
      className="fixed inset-0 z-[120] bg-background flex flex-col items-center justify-center"
      data-testid="overlay-google-auth"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(152 100% 44% / 0.08), transparent 65%)",
          }}
        />
        <div
          className="absolute bottom-[20%] right-[10%] w-[300px] h-[300px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(275 85% 62% / 0.05), transparent 65%)",
          }}
        />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-8 text-center px-8">
        <GuberLogo size="xl" />
        {phase === "connecting" ? (
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-xl font-display font-semibold tracking-wide text-foreground">
              Connecting to Google…
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
              You'll return to GUBER automatically
            </p>
            <Loader2 className="w-5 h-5 animate-spin text-primary/50 mt-2" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-xl font-display font-semibold tracking-wide text-foreground">
              Signing you in…
            </h2>
            <Loader2 className="w-5 h-5 animate-spin text-primary/50 mt-2" />
          </div>
        )}
      </div>
    </div>
  );
}
