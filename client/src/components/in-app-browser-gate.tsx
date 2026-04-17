import { useState } from "react";
import { GuberLogo } from "@/components/guber-logo";
import { Button } from "@/components/ui/button";
import { ExternalLink, ShieldAlert, Copy, Check } from "lucide-react";

function detectInAppBrowser(): { detected: boolean; name: string; isAndroid: boolean } {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  if (/FBAN|FBAV/i.test(ua)) return { detected: true, name: "Facebook", isAndroid };
  if (/Instagram/i.test(ua)) return { detected: true, name: "Instagram", isAndroid };
  if (/Messenger/i.test(ua)) return { detected: true, name: "Messenger", isAndroid };
  return { detected: false, name: "", isAndroid };
}

function openInSystemBrowser(isAndroid: boolean) {
  const url = window.location.href;
  if (isAndroid) {
    const intentUrl = url.replace(/^https?:\/\//, "intent://") +
      "#Intent;scheme=https;package=com.android.chrome;end";
    window.location.href = intentUrl;
  } else {
    window.location.href = url;
  }
}

export function InAppBrowserGate({ children }: { children: React.ReactNode }) {
  const [iab] = useState(() => detectInAppBrowser());
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  if (!iab.detected) return <>{children}</>;

  const url = window.location.href;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 relative" data-testid="page-iab-gate">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-[25%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, hsl(152 100% 44%), transparent 65%)" }}
        />
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col items-center text-center gap-8">
        <GuberLogo size="lg" />

        <div className="glass-card rounded-2xl p-8 premium-border-glow w-full flex flex-col items-center gap-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.3)" }}
          >
            <ShieldAlert className="w-7 h-7" style={{ color: "#C9A84C" }} />
          </div>

          <div className="space-y-2">
            <p className="font-display font-black text-base tracking-wider text-foreground">
              OPEN IN YOUR BROWSER
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Google Sign-In doesn't work inside {iab.name}. Tap the button to open Chrome.
              If it doesn't open, copy the link below and paste it into Chrome or Safari.
            </p>
          </div>

          <Button
            className="w-full h-12 font-display text-sm font-black tracking-wider gap-2"
            style={{ background: "linear-gradient(135deg,#C9A84C,#a8873c)", color: "#000" }}
            onClick={() => openInSystemBrowser(iab.isAndroid)}
            data-testid="button-open-in-browser"
          >
            <ExternalLink className="w-4 h-4" />
            OPEN IN BROWSER
          </Button>

          <div className="w-full space-y-2">
            <p className="text-[10px] text-muted-foreground/40 font-display tracking-widest uppercase">
              Or copy this link
            </p>
            <div
              className="w-full rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <p
                className="text-left text-xs text-muted-foreground select-all break-all"
                data-testid="text-referral-url"
              >
                {url}
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="w-full h-10 rounded-xl font-display text-xs font-black tracking-widest flex items-center justify-center gap-2 transition-colors"
              style={{
                border: "1px solid rgba(201,168,76,0.4)",
                color: copied ? "#22C55E" : "#C9A84C",
                background: "rgba(201,168,76,0.06)",
              }}
              data-testid="button-copy-link"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "COPIED!" : "COPY LINK"}
            </button>
            {copied && (
              <p className="text-[11px] text-green-500 font-display tracking-wider">
                Paste it into Chrome or Safari to continue.
              </p>
            )}
            {copyFailed && (
              <p className="text-[11px] text-muted-foreground font-display tracking-wider">
                Copy failed — long-press the link above to copy manually.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
