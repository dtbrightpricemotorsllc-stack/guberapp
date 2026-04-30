import { useCallback, useEffect, useRef, useState } from "react";
import splashLogoSrc from "@assets/file_00000000393871f7b00a6d0df976e6f7_1777519348995.png";

const SAFETY_CAP_MS = 12000;

interface SplashScreenProps {
  onDone: () => void;
  appReady?: boolean;
}

export default function SplashScreen({ onDone, appReady = false }: SplashScreenProps) {
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [exiting, setExiting] = useState(false);

  const finishedRef = useRef(false);
  const completedRef = useRef(false);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appReadyRef = useRef(appReady);

  useEffect(() => { appReadyRef.current = appReady; }, [appReady]);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
    setProgressPct(100);
    setExiting(true);
    setTimeout(() => onDone(), 480);
  }, [onDone]);

  useEffect(() => {
    if (appReady && completedRef.current) finish();
  }, [appReady, finish]);

  useEffect(() => {
    const t1 = setTimeout(() => setDoorsOpen(true), 300);
    const t2 = setTimeout(() => {
      setShowBar(true);
      let pct = 4;
      progressRef.current = setInterval(() => {
        pct = Math.min(pct + (Math.random() * 5 + 1.5), 92);
        setProgressPct(pct);
        if (!completedRef.current && pct >= 90) {
          completedRef.current = true;
        }
        if (completedRef.current && appReadyRef.current) {
          finish();
        }
      }, 280);
    }, 900);

    safetyRef.current = setTimeout(finish, SAFETY_CAP_MS);

    return () => {
      clearTimeout(t1); clearTimeout(t2);
      if (progressRef.current) clearInterval(progressRef.current);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    };
  }, [finish]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: exiting ? "opacity 0.44s cubic-bezier(0.4,0,1,1)" : "none",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* ── Full splash image — fitted to viewport height ── */}
      <div style={{
        position: "relative",
        height: "100%",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <img
          src={splashLogoSrc}
          alt="GUBER"
          style={{
            height: "100%",
            width: "auto",
            maxWidth: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />

        {/* ── Animated progress bar overlay ── */}
        {/* Layered on top of the static bar drawn in the design image.
            Positioned at ~53% of the image height (where the LOADING bar lives
            in the reference design). width matches the bar width in the image. */}
        <div
          style={{
            position: "absolute",
            top: "53%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "58%",
            maxWidth: 300,
            opacity: showBar ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}
        >
          <div style={{
            height: 4,
            borderRadius: 99,
            background: "rgba(0,0,0,0.4)",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${progressPct}%`,
              borderRadius: 99,
              background: "linear-gradient(90deg, #6c3eff 0%, #0099ff 28%, #00e5ff 50%, #00ff88 72%, #ffd600 88%, #ff3d6e 100%)",
              transition: "width 0.3s ease-out",
              boxShadow: "0 0 14px rgba(0,229,255,0.9), 0 0 32px rgba(0,229,255,0.4)",
            }} />
          </div>
        </div>

        {/* ── Glow pulse behind logo ── */}
        <div
          style={{
            position: "absolute",
            top: "15%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "55%",
            aspectRatio: "1 / 1",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(100,60,255,0.18) 0%, rgba(0,229,255,0.08) 50%, transparent 70%)",
            animation: "guber-halo-breathe 3s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* ── Door panels (unchanged logic) ── */}
      <div
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "50%", height: "65%",
          overflow: "hidden",
          zIndex: 10,
          transform: doorsOpen ? "translateX(-100%)" : "translateX(0)",
          transition: doorsOpen ? "transform 1.2s ease-in-out" : "none",
          willChange: "transform",
        }}
      >
        <div style={{
          position: "absolute",
          top: 0, left: 0,
          width: "200%", height: "100%",
          backgroundImage: "url('/doors.png')",
          backgroundSize: "cover",
          backgroundPosition: "left top",
          backgroundRepeat: "no-repeat",
        }} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 0, right: 0,
          width: "50%", height: "65%",
          overflow: "hidden",
          zIndex: 10,
          transform: doorsOpen ? "translateX(100%)" : "translateX(0)",
          transition: doorsOpen ? "transform 1.2s ease-in-out" : "none",
          willChange: "transform",
        }}
      >
        <div style={{
          position: "absolute",
          top: 0, right: 0,
          width: "200%", height: "100%",
          backgroundImage: "url('/doors.png')",
          backgroundSize: "cover",
          backgroundPosition: "right top",
          backgroundRepeat: "no-repeat",
        }} />
      </div>

      <style>{`
        @keyframes guber-halo-breathe {
          0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(0.92); }
          50%       { opacity: 1;   transform: translateX(-50%) scale(1.08); }
        }
      `}</style>
    </div>
  );
}
