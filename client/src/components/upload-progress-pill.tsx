import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { subscribeUploadState, getUploadState, resetUploadState } from "@/lib/upload-events";

export function UploadProgressPill() {
  const [state, setState] = useState(getUploadState());
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    return subscribeUploadState((s) => setState(s));
  }, []);

  useEffect(() => {
    if (state.status === "uploading") {
      setFadeOut(false);
      setVisible(true);
    } else if (state.status === "done") {
      setFadeOut(false);
      setVisible(true);
      const t = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => {
          setVisible(false);
          resetUploadState();
        }, 400);
      }, 2000);
      return () => clearTimeout(t);
    } else if (state.status === "error") {
      setFadeOut(false);
      setVisible(true);
      const t = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => {
          setVisible(false);
          resetUploadState();
        }, 400);
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [state.status]);

  if (!visible) return null;

  const isUploading = state.status === "uploading";
  const isDone = state.status === "done";
  const isError = state.status === "error";

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[9999] pointer-events-none"
      style={{ transform: "translateX(-50%)" }}
    >
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-semibold shadow-2xl transition-all duration-400"
        style={{
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(16px)",
          border: isError
            ? "1px solid rgba(239,68,68,0.55)"
            : isDone
            ? "1px solid rgba(0,230,118,0.55)"
            : "1px solid rgba(0,230,118,0.35)",
          opacity: fadeOut ? 0 : 1,
          transform: fadeOut ? "translateY(8px)" : "translateY(0)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
          minWidth: "160px",
        }}
      >
        {isUploading && (
          <>
            <Loader2
              className="w-4 h-4 shrink-0 animate-spin"
              style={{ color: "rgba(0,230,118,0.9)" }}
            />
            <span className="text-white/90">
              Uploading{state.pct > 0 && state.pct < 100 ? `… ${state.pct}%` : "…"}
            </span>
            {state.pct > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${state.pct}%`,
                    background: "rgba(0,230,118,0.7)",
                  }}
                />
              </div>
            )}
          </>
        )}
        {isDone && (
          <>
            <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "rgba(0,230,118,1)" }} />
            <span style={{ color: "rgba(0,230,118,1)" }}>Uploaded</span>
          </>
        )}
        {isError && (
          <>
            <XCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span className="text-red-400 truncate max-w-[180px]">
              {state.errorMsg || "Upload failed"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
