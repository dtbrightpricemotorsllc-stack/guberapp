/**
 * Native Diagnostics — admin-only tool for testing GPS and microphone on the
 * physical Android/iOS device without needing adb, Android Studio, or logcat.
 *
 * Route: /admin/native-diagnostics  (AdminRoute — admin login required)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import {
  MapPin, Mic, Wifi, WifiOff, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Copy, ArrowLeft, Activity, Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "running" | "pass" | "fail" | "warn";

interface GpsResult {
  capabilityPermission: string;   // @capacitor/geolocation checkPermissions result
  webviewPermission: string;       // navigator.geolocation probe result
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  timestamp: string | null;
  age: string | null;             // how old the fix is
  source: string;                 // "capacitor-native" | "navigator.geolocation" | "denied"
  isCached: boolean;
  city: string | null;
  error: string | null;
}

interface MicResult {
  recordAudioPermission: string;      // inferred from getUserMedia result
  webviewAudioPermission: string;     // inferred from getUserMedia result
  getUserMediaStatus: string;
  trackCount: number;
  tracks: {
    label: string;
    enabled: boolean;
    muted: boolean;
    readyState: string;
  }[];
  rtcAddTrackStatus: string;
  jacApiStatus: string;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pill(status: Status, label: string) {
  const styles: Record<Status, string> = {
    idle:    "bg-zinc-800 text-zinc-300",
    running: "bg-blue-900 text-blue-200 animate-pulse",
    pass:    "bg-green-900 text-green-200",
    fail:    "bg-red-900 text-red-200",
    warn:    "bg-yellow-900 text-yellow-200",
  };
  const icons: Record<Status, React.ReactNode> = {
    idle:    null,
    running: <RefreshCw className="w-3 h-3 animate-spin" />,
    pass:    <CheckCircle className="w-3 h-3" />,
    fail:    <XCircle className="w-3 h-3" />,
    warn:    <AlertTriangle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono font-medium ${styles[status]}`}>
      {icons[status]} {label}
    </span>
  );
}

function Row({ label, value, status }: { label: string; value: React.ReactNode; status?: Status }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-zinc-400 shrink-0 w-44">{label}</span>
      <span className="text-xs text-white font-mono text-right flex-1 flex items-center justify-end gap-1.5">
        {status ? pill(status, String(value)) : String(value ?? "—")}
      </span>
    </div>
  );
}

// ─── Audio Level Meter ────────────────────────────────────────────────────────

function AudioMeter({ level }: { level: number }) {
  // level: 0–100
  const bars = 20;
  const filled = Math.round((level / 100) * bars);
  return (
    <div className="flex items-center gap-0.5 h-6 mt-1">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="rounded-sm transition-all duration-75"
          style={{
            width: 8,
            height: i < filled ? `${50 + i * 2.5}%` : "20%",
            background: i < filled
              ? i < 12 ? "#22c55e" : i < 17 ? "#eab308" : "#ef4444"
              : "rgba(255,255,255,0.1)",
          }}
        />
      ))}
      <span className="ml-2 text-[11px] font-mono text-zinc-400">{level.toFixed(0)}%</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NativeDiagnostics() {
  const { toast } = useToast();
  const isNative = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<Status>("idle");
  const [gps, setGps] = useState<GpsResult | null>(null);

  // Mic state
  const [micStatus, setMicStatus] = useState<Status>("idle");
  const [mic, setMic] = useState<MicResult | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMicLive, setIsMicLive] = useState(false);

  // Refs for cleanup
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Stop mic on unmount
  useEffect(() => {
    return () => {
      stopMicMeter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopMicMeter() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    try { audioCtxRef.current?.close(); } catch {}
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    audioCtxRef.current = null;
    setAudioLevel(0);
    setIsMicLive(false);
  }

  // ── GPS Test ────────────────────────────────────────────────────────────────

  const testGps = useCallback(async () => {
    setGpsStatus("running");
    setGps(null);

    const result: GpsResult = {
      capabilityPermission: "unknown",
      webviewPermission: "unknown",
      latitude: null,
      longitude: null,
      accuracy: null,
      altitudeAccuracy: null,
      timestamp: null,
      age: null,
      source: "unknown",
      isCached: false,
      city: null,
      error: null,
    };

    // 1. Check @capacitor/geolocation permission
    try {
      const perm = await Geolocation.checkPermissions();
      result.capabilityPermission = perm.location;
    } catch (e: any) {
      result.capabilityPermission = `error: ${e?.message}`;
    }

    // 2. Probe navigator.geolocation (tests WebView onGeolocationPermissionsShowPrompt)
    const webviewTest = await new Promise<string>((resolve) => {
      if (!navigator.geolocation) { resolve("not available"); return; }
      navigator.geolocation.getCurrentPosition(
        () => resolve("granted"),
        (err) => resolve(err.code === 1 ? "denied" : `error-${err.code}`),
        { timeout: 5000, maximumAge: 60000, enableHighAccuracy: false },
      );
    });
    result.webviewPermission = webviewTest;

    // 3. Get actual position via @capacitor/geolocation (native path on device)
    const fetchStart = Date.now();
    try {
      if (result.capabilityPermission !== "granted") {
        const req = await Geolocation.requestPermissions();
        result.capabilityPermission = req.location;
      }
      if (result.capabilityPermission === "granted") {
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
        const now = Date.now();
        const fixAge = now - pos.timestamp;
        result.latitude = pos.coords.latitude;
        result.longitude = pos.coords.longitude;
        result.accuracy = pos.coords.accuracy;
        result.altitudeAccuracy = pos.coords.altitudeAccuracy ?? null;
        result.timestamp = new Date(pos.timestamp).toLocaleTimeString();
        result.age = fixAge < 3000 ? "fresh" : `${Math.round(fixAge / 1000)}s old`;
        result.isCached = fixAge > 5000;
        result.source = isNative ? "capacitor-native" : "navigator.geolocation";

        // Reverse-geocode to city
        try {
          const r = await fetch(
            `/api/places/reverse-geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&caller=native-diag`,
            { signal: AbortSignal.timeout(6000) }
          );
          if (r.ok) {
            const data = await r.json();
            result.city = [data?.city, data?.state].filter(Boolean).join(", ") || data?.zip || null;
          }
        } catch {}
      } else {
        result.error = `Location permission ${result.capabilityPermission} — enable in Settings`;
        result.source = "denied";
      }
    } catch (e: any) {
      result.error = e?.message ?? "GPS error";
    }

    setGps(result);
    setGpsStatus(result.error ? "fail" : result.latitude !== null ? "pass" : "warn");
  }, [isNative]);

  // ── Microphone Test ──────────────────────────────────────────────────────────

  const testMic = useCallback(async () => {
    // Stop any existing session
    stopMicMeter();
    setMicStatus("running");
    setMic(null);

    const result: MicResult = {
      recordAudioPermission: "unknown",
      webviewAudioPermission: "unknown",
      getUserMediaStatus: "pending",
      trackCount: 0,
      tracks: [],
      rtcAddTrackStatus: "not tested",
      jacApiStatus: "not tested",
      error: null,
    };

    // 1. getUserMedia — this implicitly tests RECORD_AUDIO + WebView audio permission
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      result.getUserMediaStatus = "success";
      result.recordAudioPermission = "granted";
      result.webviewAudioPermission = "granted";
      result.trackCount = stream.getAudioTracks().length;
      result.tracks = stream.getAudioTracks().map(t => ({
        label: t.label || "(no label)",
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      }));
    } catch (err: any) {
      result.getUserMediaStatus = `FAILED: ${err?.name} — ${err?.message}`;
      result.recordAudioPermission = err?.name === "NotAllowedError" ? "denied" : "unknown";
      result.webviewAudioPermission = err?.name === "NotAllowedError" ? "denied" : "unknown";
      result.error = `getUserMedia failed: ${err?.name ?? "unknown error"}`;
      setMic(result);
      setMicStatus("fail");
      return;
    }

    // 2. RTCPeerConnection.addTrack test
    try {
      const pc = new RTCPeerConnection();
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        pc.addTrack(audioTrack, stream);
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track?.kind === "audio");
        result.rtcAddTrackStatus = audioSender ? "audio track added successfully" : "no audio sender found";
      } else {
        result.rtcAddTrackStatus = "no audio track to add";
      }
      pc.close();
    } catch (e: any) {
      result.rtcAddTrackStatus = `error: ${e?.message}`;
    }

    // 3. JAC API reachability (tests ElevenLabs session endpoint, not the full connection)
    try {
      const r = await fetch("/api/jac/convai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: isNative ? "android_native" : "web", diagCheck: true }),
        signal: AbortSignal.timeout(8000),
      });
      // 200 or 401 (not logged in) = server reachable; 5xx = broken
      if (r.ok) result.jacApiStatus = "reachable — session OK";
      else if (r.status === 401) result.jacApiStatus = "reachable (sign-in required for full session)";
      else result.jacApiStatus = `HTTP ${r.status}`;
    } catch (e: any) {
      result.jacApiStatus = `unreachable: ${e?.message}`;
    }

    setMic(result);
    setMicStatus(result.tracks[0]?.readyState === "live" ? "pass" : "warn");

    // 4. Live audio level meter — keep stream open and animate
    micStreamRef.current = stream;
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      setIsMicLive(true);

      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += (buf[i] - 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        setAudioLevel(Math.min(100, rms * 5));
        animFrameRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      console.warn("[NativeDiag] AnalyserNode failed:", e);
    }
  }, [isNative]);

  // ── Copy Diagnostics ──────────────────────────────────────────────────────────

  const copyDiagnostics = useCallback(async () => {
    const lines: string[] = [
      "=== GUBER NATIVE DIAGNOSTICS ===",
      `Date: ${new Date().toISOString()}`,
      `Platform: ${isNative ? "native" : "web/PWA"}`,
      `Capacitor: ${(window as any)?.Capacitor?.getPlatform?.() ?? "unknown"}`,
      "",
      "--- GPS ---",
    ];

    if (gps) {
      lines.push(`Capacitor permission: ${gps.capabilityPermission}`);
      lines.push(`WebView geolocation: ${gps.webviewPermission}`);
      lines.push(`Latitude: ${gps.latitude ?? "—"}`);
      lines.push(`Longitude: ${gps.longitude ?? "—"}`);
      lines.push(`Accuracy: ${gps.accuracy != null ? `${gps.accuracy.toFixed(0)}m` : "—"}`);
      lines.push(`Timestamp: ${gps.timestamp ?? "—"}`);
      lines.push(`Fix age: ${gps.age ?? "—"}`);
      lines.push(`Source: ${gps.source}`);
      lines.push(`Cached: ${gps.isCached}`);
      lines.push(`City: ${gps.city ?? "—"}`);
      if (gps.error) lines.push(`Error: ${gps.error}`);
    } else {
      lines.push("GPS not yet tested — press Test Current GPS first");
    }

    lines.push("");
    lines.push("--- MICROPHONE ---");

    if (mic) {
      lines.push(`RECORD_AUDIO permission: ${mic.recordAudioPermission}`);
      lines.push(`WebView audio permission: ${mic.webviewAudioPermission}`);
      lines.push(`getUserMedia: ${mic.getUserMediaStatus}`);
      lines.push(`Audio tracks: ${mic.trackCount}`);
      mic.tracks.forEach((t, i) => {
        lines.push(`  track[${i}]: label="${t.label}" enabled=${t.enabled} muted=${t.muted} readyState=${t.readyState}`);
      });
      lines.push(`RTCPeerConnection.addTrack: ${mic.rtcAddTrackStatus}`);
      lines.push(`JAC API: ${mic.jacApiStatus}`);
      if (mic.error) lines.push(`Error: ${mic.error}`);
    } else {
      lines.push("Mic not yet tested — press Test Microphone first");
    }

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Diagnostics copied", description: "Paste into your issue report or chat." });
    } catch {
      // Fallback: show in an alert (works on all platforms)
      prompt("Copy the diagnostics below:", text);
    }
  }, [gps, mic, isNative, toast]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const gpsOk  = gps?.latitude !== null && gps?.error === null;
  const micOk  = mic?.tracks?.[0]?.readyState === "live";

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-zinc-950/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Link href="/admin/qa">
          <button className="p-1.5 rounded-lg hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-sm font-semibold font-display">Native Diagnostics</h1>
          <p className="text-[10px] text-zinc-400">
            {isNative ? `Native · ${(window as any)?.Capacitor?.getPlatform?.() ?? "unknown"}` : "Web / PWA"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={copyDiagnostics}
          className="h-8 gap-1.5 text-xs border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          <Copy className="w-3.5 h-3.5" /> Copy Report
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-xl mx-auto">

        {/* Platform banner */}
        {!isNative && (
          <div className="flex items-center gap-2 bg-yellow-950/60 border border-yellow-700/40 rounded-xl px-3 py-2.5 text-xs text-yellow-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-400" />
            Running in browser/PWA — some native permission checks will differ from the installed APK.
            Install the Android APK to test native behaviour.
          </div>
        )}

        {/* ── GPS Card ──────────────────────────────────────────────────────── */}
        <Card className="bg-zinc-900 border-white/10">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <CardTitle className="text-sm font-display text-white">GPS / Location</CardTitle>
              {gpsStatus !== "idle" && (
                <Badge className={
                  gpsStatus === "pass" ? "bg-emerald-900 text-emerald-200 text-[10px]" :
                  gpsStatus === "fail" ? "bg-red-900 text-red-200 text-[10px]" :
                  gpsStatus === "running" ? "bg-blue-900 text-blue-200 text-[10px]" :
                  "bg-yellow-900 text-yellow-200 text-[10px]"
                }>
                  {gpsStatus === "running" ? "testing…" : gpsStatus}
                </Badge>
              )}
            </div>
            <Button
              size="sm"
              onClick={testGps}
              disabled={gpsStatus === "running"}
              className="h-7 text-xs bg-emerald-700 hover:bg-emerald-600 text-white gap-1"
            >
              {gpsStatus === "running"
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Testing…</>
                : <><MapPin className="w-3 h-3" /> Test GPS</>}
            </Button>
          </CardHeader>

          <CardContent className="px-4 pb-4">
            {!gps && gpsStatus === "idle" && (
              <p className="text-xs text-zinc-500 py-2">Press "Test GPS" to check location permissions and get coordinates.</p>
            )}

            {gps && (
              <div className="divide-y divide-white/5">
                <Row label="Capacitor permission"
                  value={gps.capabilityPermission}
                  status={gps.capabilityPermission === "granted" ? "pass" : "fail"}
                />
                <Row label="WebView geolocation"
                  value={gps.webviewPermission}
                  status={gps.webviewPermission === "granted" ? "pass" : gps.webviewPermission === "denied" ? "fail" : "warn"}
                />
                <Row label="Latitude"
                  value={gps.latitude != null ? gps.latitude.toFixed(6) : "—"}
                  status={gps.latitude != null ? "pass" : "fail"}
                />
                <Row label="Longitude"
                  value={gps.longitude != null ? gps.longitude.toFixed(6) : "—"}
                  status={gps.longitude != null ? "pass" : "fail"}
                />
                <Row label="Accuracy"
                  value={gps.accuracy != null ? `±${gps.accuracy.toFixed(0)} m` : "—"}
                  status={
                    gps.accuracy == null ? "fail" :
                    gps.accuracy < 50 ? "pass" :
                    gps.accuracy < 500 ? "warn" : "fail"
                  }
                />
                {gps.altitudeAccuracy != null && (
                  <Row label="Altitude accuracy" value={`±${gps.altitudeAccuracy.toFixed(0)} m`} />
                )}
                <Row label="Timestamp" value={gps.timestamp ?? "—"} />
                <Row label="Fix age"
                  value={gps.age ?? "—"}
                  status={!gps.age ? "fail" : gps.isCached ? "warn" : "pass"}
                />
                <Row label="Source" value={gps.source} />
                {gps.city && (
                  <Row label="City / State"
                    value={gps.city}
                    status="pass"
                  />
                )}
                {gps.error && (
                  <div className="mt-2 rounded-lg bg-red-950/50 border border-red-700/30 px-3 py-2 text-xs text-red-300 font-mono">
                    {gps.error}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Microphone Card ───────────────────────────────────────────────── */}
        <Card className="bg-zinc-900 border-white/10">
          <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-violet-400" />
              <CardTitle className="text-sm font-display text-white">Microphone</CardTitle>
              {micStatus !== "idle" && (
                <Badge className={
                  micStatus === "pass" ? "bg-emerald-900 text-emerald-200 text-[10px]" :
                  micStatus === "fail" ? "bg-red-900 text-red-200 text-[10px]" :
                  micStatus === "running" ? "bg-blue-900 text-blue-200 text-[10px]" :
                  "bg-yellow-900 text-yellow-200 text-[10px]"
                }>
                  {micStatus === "running" ? "testing…" : micStatus}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              {isMicLive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={stopMicMeter}
                  className="h-7 text-xs border-red-700/50 text-red-300 hover:bg-red-950/50 gap-1"
                >
                  Stop
                </Button>
              )}
              <Button
                size="sm"
                onClick={testMic}
                disabled={micStatus === "running"}
                className="h-7 text-xs bg-violet-700 hover:bg-violet-600 text-white gap-1"
              >
                {micStatus === "running"
                  ? <><RefreshCw className="w-3 h-3 animate-spin" /> Testing…</>
                  : <><Mic className="w-3 h-3" /> Test Mic</>}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-4">
            {!mic && micStatus === "idle" && (
              <p className="text-xs text-zinc-500 py-2">Press "Test Mic" to check microphone permissions and open the mic stream.</p>
            )}

            {mic && (
              <div className="divide-y divide-white/5">
                <Row label="RECORD_AUDIO permission"
                  value={mic.recordAudioPermission}
                  status={mic.recordAudioPermission === "granted" ? "pass" : "fail"}
                />
                <Row label="WebView audio capture"
                  value={mic.webviewAudioPermission}
                  status={mic.webviewAudioPermission === "granted" ? "pass" : "fail"}
                />
                <Row label="getUserMedia()"
                  value={mic.getUserMediaStatus}
                  status={mic.getUserMediaStatus === "success" ? "pass" : "fail"}
                />
                <Row label="Audio tracks returned"
                  value={String(mic.trackCount)}
                  status={mic.trackCount > 0 ? "pass" : "fail"}
                />
                {mic.tracks.map((t, i) => (
                  <div key={i} className="py-2 space-y-1">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Track {i}</div>
                    <Row label="  label" value={t.label} />
                    <Row label="  enabled"
                      value={String(t.enabled)}
                      status={t.enabled ? "pass" : "fail"}
                    />
                    <Row label="  muted"
                      value={String(t.muted)}
                      status={t.muted ? "warn" : "pass"}
                    />
                    <Row label="  readyState"
                      value={t.readyState}
                      status={t.readyState === "live" ? "pass" : "fail"}
                    />
                  </div>
                ))}
                <Row label="RTCPeerConnection.addTrack"
                  value={mic.rtcAddTrackStatus}
                  status={mic.rtcAddTrackStatus.includes("successfully") ? "pass" : mic.rtcAddTrackStatus.includes("error") ? "fail" : "warn"}
                />
                <Row label="JAC session API"
                  value={mic.jacApiStatus}
                  status={mic.jacApiStatus.includes("reachable") ? "pass" : mic.jacApiStatus.includes("HTTP") ? "fail" : "warn"}
                />
                {mic.error && (
                  <div className="mt-2 rounded-lg bg-red-950/50 border border-red-700/30 px-3 py-2 text-xs text-red-300 font-mono">
                    {mic.error}
                  </div>
                )}
              </div>
            )}

            {/* Live audio level meter */}
            {isMicLive && (
              <div className="mt-4 bg-zinc-800/60 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                  <span className="text-[11px] font-mono text-zinc-300">Live mic level — speak to confirm audio is captured</span>
                </div>
                <AudioMeter level={audioLevel} />
                <p className="text-[10px] text-zinc-500 mt-2">
                  {audioLevel > 5
                    ? "✅ Audio detected — mic is capturing sound"
                    : "⚠ No audio — speak into the mic or check if it's muted"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Summary ────────────────────────────────────────────────────────── */}
        {(gps || mic) && (
          <Card className="bg-zinc-900 border-white/10">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-display text-white flex items-center gap-2">
                <Radio className="w-4 h-4 text-sky-400" /> Test Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">GPS fix obtained</span>
                {gpsOk
                  ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Pass</span>
                  : <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {gps ? "Fail" : "Not tested"}</span>}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Location is real (not Alabama)</span>
                {gps?.latitude != null
                  ? gps.latitude > 33 && gps.latitude < 37
                    ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Looks like NC</span>
                    : gps.latitude > 30 && gps.latitude < 32 && gps.longitude != null && gps.longitude > -88 && gps.longitude < -84
                      ? <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Alabama range!</span>
                      : <span className="text-sky-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {gps.city ?? "Outside Alabama"}</span>
                  : <span className="text-zinc-500">Not tested</span>}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Mic permission granted</span>
                {micOk
                  ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Pass</span>
                  : <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {mic ? "Fail" : "Not tested"}</span>}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Audio captured (non-zero level)</span>
                {isMicLive
                  ? audioLevel > 5
                    ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Audio detected</span>
                    : <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Speak to test</span>
                  : <span className="text-zinc-500">{mic ? "Stopped" : "Not tested"}</span>}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">WebRTC audio track added</span>
                {mic?.rtcAddTrackStatus.includes("successfully")
                  ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Pass</span>
                  : <span className="text-zinc-500">{mic ? mic.rtcAddTrackStatus : "Not tested"}</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bottom spacer */}
        <div className="h-8" />
      </div>
    </div>
  );
}
