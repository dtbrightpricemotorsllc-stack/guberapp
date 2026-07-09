/**
 * /bg-location-demo
 *
 * Screen-record helper for Google Play's Background Location declaration.
 * Walks through the three steps Google requires on video:
 *   1. In-app disclosure (BackgroundLocationModal, triggered by real event)
 *   2. OS permission request (ACCESS_BACKGROUND_LOCATION)
 *   3. Active job with continuous live GPS updates visible on screen
 *
 * Accessible without auth via DemoRoute. Open on the device, hit record,
 * tap "Begin Demo", complete the permission flow, watch the live pings.
 * Aim for 20–30 seconds of recording.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Navigation, Wifi, CheckCircle2, Clock, Radio } from "lucide-react";
import { ensureBackgroundLocation } from "@/lib/background-location";
import { startForegroundTracking, stopForegroundTracking } from "@/lib/foreground-tracking";
import { Capacitor } from "@capacitor/core";

type Phase = "intro" | "permission" | "tracking" | "done";

interface Ping {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
}

const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

export default function BgLocationDemo() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [pings, setPings] = useState<Ping[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const watchRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTsRef = useRef<number>(0);

  const stopTracking = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopForegroundTracking();
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  const startLiveTracking = useCallback(() => {
    setPhase("tracking");
    startTsRef.current = Date.now();

    startForegroundTracking({
      title: "GUBER GPS Active",
      text: "Live location tracking — active job in progress.",
    });

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTsRef.current) / 1000));
    }, 1000);

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPings((prev) => [
          {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            ts: Date.now(),
          },
          ...prev.slice(0, 19),
        ]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }, []);

  const handleBegin = useCallback(async () => {
    setPhase("permission");
    const granted = await ensureBackgroundLocation("job", { forceReprompt: true });
    setPermGranted(granted);
    // Small pause so the user can see the result before live tracking starts
    setTimeout(startLiveTracking, 800);
  }, [startLiveTracking]);

  const fmtCoord = (n: number, decimals = 5) => n.toFixed(decimals);
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const latestPing = pings[0] ?? null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #050a0f 0%, #0a1520 100%)" }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(0,229,229,0.15)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0,229,229,0.15)", border: "1px solid rgba(0,229,229,0.3)" }}
          >
            <Navigation className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <span className="text-xs font-display font-black tracking-widest text-cyan-400 uppercase">
            GUBER
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">
          Background Location Demo
        </span>
      </div>

      {/* ── INTRO ────────────────────────────────────────────────────── */}
      {phase === "intro" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
          {/* Pulse icon */}
          <div className="relative">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: "rgba(0,229,229,0.1)", border: "2px solid rgba(0,229,229,0.35)" }}
            >
              <MapPin className="w-9 h-9 text-cyan-400" />
            </div>
            <span
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-400 animate-ping opacity-75"
            />
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-2xl font-display font-black text-foreground tracking-tight">
              Background Location
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              GUBER tracks your location during active jobs so hirers receive live updates — even when the app is minimized.
            </p>
          </div>

          {/* What you'll see */}
          <div
            className="w-full max-w-xs rounded-2xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,229,0.2)" }}
          >
            {[
              { n: "1", label: "In-app disclosure", sub: "Explains why & how we use your location" },
              { n: "2", label: "OS permission prompt", sub: 'Select "Allow all the time"' },
              { n: "3", label: "Live job tracking", sub: "GPS pings stream in real time" },
            ].map((step) => (
              <div key={step.n} className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-black text-cyan-400"
                  style={{ background: "rgba(0,229,229,0.12)", border: "1px solid rgba(0,229,229,0.3)" }}
                >
                  {step.n}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground">{step.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleBegin}
            data-testid="button-bg-demo-begin"
            className="w-full max-w-xs rounded-2xl py-4 text-sm font-display font-black tracking-widest text-black transition-all active:scale-[0.97]"
            style={{ background: "linear-gradient(135deg, #00E5E5, #0099AA)" }}
          >
            BEGIN DEMO
          </button>

          <p className="text-[10px] text-muted-foreground text-center">
            Start your screen recording, then tap Begin Demo
          </p>
        </div>
      )}

      {/* ── PERMISSION WAITING ───────────────────────────────────────── */}
      {phase === "permission" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
            style={{ background: "rgba(0,229,229,0.12)", border: "2px solid rgba(0,229,229,0.4)" }}
          >
            <Navigation className="w-8 h-8 text-cyan-400" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Review the disclosure above, then tap{" "}
            <span className="text-foreground font-semibold">Enable Background Location</span>
          </p>
          <p className="text-[10px] text-muted-foreground/60 text-center">
            On Android 11+: when Settings opens, choose{" "}
            <span className="text-cyan-400">"Allow all the time"</span>
          </p>
        </div>
      )}

      {/* ── LIVE TRACKING ────────────────────────────────────────────── */}
      {phase === "tracking" && (
        <div className="flex-1 flex flex-col px-4 pt-4 pb-6 gap-3 overflow-hidden">

          {/* Job card */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(0,229,229,0.25)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-display">Active Job</p>
                <p className="text-sm font-display font-black text-foreground">Local Delivery #J-4821</p>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{ background: "rgba(0,229,229,0.12)", border: "1px solid rgba(0,229,229,0.3)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-display font-black text-cyan-400 tracking-wider">LIVE</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className="font-mono">{fmtTime(elapsed)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Radio className="w-3 h-3" />
                <span>{pings.length} ping{pings.length !== 1 ? "s" : ""} sent</span>
              </div>
              {permGranted !== null && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className={`w-3 h-3 ${permGranted ? "text-green-400" : "text-yellow-400"}`} />
                  <span className={permGranted ? "text-green-400" : "text-yellow-400"}>
                    {permGranted ? "BG granted" : "FG only"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Live coords */}
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(0,229,229,0.05)", border: "1px solid rgba(0,229,229,0.2)" }}
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-display mb-2">
              Current Position
            </p>
            {latestPing ? (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-mono">LAT</span>
                  <span className="text-cyan-300 font-mono font-semibold">
                    {fmtCoord(latestPing.lat)}°
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-mono">LNG</span>
                  <span className="text-cyan-300 font-mono font-semibold">
                    {fmtCoord(latestPing.lng)}°
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-mono">ACC</span>
                  <span className="text-cyan-300 font-mono font-semibold">
                    ±{latestPing.accuracy}m
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Acquiring GPS fix…
              </div>
            )}
          </div>

          {/* Notification bar replica */}
          <div
            className="rounded-2xl p-3 flex items-center gap-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,229,229,0.15)" }}
            >
              <Navigation className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">GUBER GPS Active</p>
              <p className="text-[10px] text-muted-foreground truncate">
                Tracking your location for an active job. Tap to return to GUBER.
              </p>
            </div>
          </div>

          {/* Recent pings log */}
          <div className="flex-1 overflow-hidden rounded-2xl"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="p-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] font-display font-bold text-foreground tracking-widest uppercase">
                  Location Feed
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">{pings.length}/20</span>
            </div>
            <div className="overflow-y-auto h-full max-h-44">
              {pings.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-4">
                  Waiting for first fix…
                </p>
              )}
              {pings.map((p, i) => (
                <div
                  key={p.ts}
                  className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono"
                  style={{
                    background: i === 0 ? "rgba(0,229,229,0.07)" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span className="text-muted-foreground">
                    {new Date(p.ts).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className={i === 0 ? "text-cyan-300" : "text-muted-foreground"}>
                    {fmtCoord(p.lat, 4)}, {fmtCoord(p.lng, 4)}
                  </span>
                  <span className="text-muted-foreground/60">±{p.accuracy}m</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
