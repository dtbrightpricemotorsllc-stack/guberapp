import { useCallback, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Navigation, Car, Map as MapIcon, AlertTriangle, Shield, Check } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import shieldLogo from "@assets/__favicon_1773034423924.png";

export type NavProvider = "google" | "waze" | "apple";

type NavUrls = Partial<Record<NavProvider, string>>;

export type NavLaunchOpts = {
  destLabel: string;
  destAddress?: string;
  payoutDollars?: number;
  warning?: string;
  urls: NavUrls;
};

type SheetState = (NavLaunchOpts & { open: boolean }) | null;

const PROVIDER_META: Record<NavProvider, { name: string; tagline: string; color: string; Icon: typeof Navigation }> = {
  google: { name: "Open in Google Maps", tagline: "Turn-by-turn navigation", color: "#4285F4", Icon: Navigation },
  waze: { name: "Open in Waze", tagline: "Real-time traffic routing", color: "#22C55E", Icon: Car },
  apple: { name: "Open in Apple Maps", tagline: "Apple Maps", color: "#94A3B8", Icon: MapIcon },
};

const PREF_TO_PROVIDER: Record<string, NavProvider> = {
  google_maps: "google",
  waze: "waze",
  apple_maps: "apple",
};

const PROVIDER_TO_PREF: Record<NavProvider, string> = {
  google: "google_maps",
  waze: "waze",
  apple: "apple_maps",
};

function launchExternal(url: string) {
  try {
    if (url.startsWith("waze://") || url.startsWith("comgooglemaps://") || url.startsWith("maps://")) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener");
    }
  } catch {
    // ignore — sheet still closes
  }
}

function isIOS() {
  if (typeof window === "undefined") return false;
  if (Capacitor.getPlatform?.() === "ios") return true;
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent);
}

function NavigationLaunchSheet({
  state,
  preferredProvider,
  onSetPreference,
  onOpenChange,
}: {
  state: NavLaunchOpts;
  preferredProvider: NavProvider | null;
  onSetPreference: (provider: NavProvider | null) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const handleLaunch = (url: string) => {
    setTimeout(() => launchExternal(url), 600);
    setTimeout(() => onOpenChange(false), 950);
  };

  return (
    <Sheet open={true} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        side="bottom"
        hideOverlay
        hideCloseButton
        className="bg-transparent border-0 p-0 shadow-none focus:outline-none"
        data-testid="sheet-navigation-launch"
      >
        <div
          className="mx-auto w-full max-w-md rounded-3xl border border-white/10 shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
          style={{
            background: "linear-gradient(180deg, rgba(20,22,28,0.96) 0%, rgba(10,12,16,0.98) 100%)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
          }}
        >
          <div className="pt-3 pb-1 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-white/15" />
          </div>

          <div className="px-5 pb-5 pt-2 space-y-4">
            {/* Header: brand badge + destination */}
            <div className="flex items-start gap-3">
              <img
                src={shieldLogo}
                alt="GUBER"
                className="h-11 w-11 flex-shrink-0 object-contain"
                style={{ filter: "drop-shadow(0 0 12px rgba(180,60,255,0.45)) drop-shadow(0 0 8px rgba(0,230,200,0.35))" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-display font-bold tracking-[0.18em] text-emerald-400/90 uppercase">
                  Heading out
                </p>
                <h2
                  className="font-display font-black text-base leading-tight text-white truncate"
                  data-testid="text-nav-sheet-title"
                >
                  {state.destLabel}
                </h2>
                {state.destAddress ? (
                  <p
                    className="text-[11px] text-white/60 mt-0.5 truncate"
                    data-testid="text-nav-sheet-address"
                  >
                    {state.destAddress}
                  </p>
                ) : null}
              </div>
              {typeof state.payoutDollars === "number" ? (
                <div
                  className="flex-shrink-0 px-2.5 py-1 rounded-lg border border-emerald-500/40"
                  style={{ background: "rgba(34,197,94,0.12)" }}
                  data-testid="badge-nav-sheet-payout"
                >
                  <span className="font-display font-black text-emerald-300 text-sm">
                    ${state.payoutDollars.toFixed(state.payoutDollars % 1 === 0 ? 0 : 2)}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Optional warning banner */}
            {state.warning ? (
              <div
                className="flex items-start gap-2.5 p-3 rounded-2xl border border-amber-500/40"
                style={{ background: "rgba(245,158,11,0.10)" }}
                data-testid="banner-nav-sheet-warning"
              >
                <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-200 leading-snug font-medium">
                  {state.warning}
                </p>
              </div>
            ) : null}

            {/* Provider buttons — Google + Waze only. Apple Maps is shown */}
            {/* below as a small "More options" link on iOS only.            */}
            <div className="space-y-2">
              {(["google", "waze"] as NavProvider[]).map((provider) => {
                const url = state.urls[provider];
                if (!url) return null;
                const meta = PROVIDER_META[provider];
                const Icon = meta.Icon;
                const isDefault = preferredProvider === provider;
                return (
                  <div key={provider} className="space-y-1">
                    <button
                      onClick={() => handleLaunch(url)}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: isDefault ? `${meta.color}26` : `${meta.color}1A`,
                        border: `1px solid ${isDefault ? meta.color + "88" : meta.color + "55"}`,
                      }}
                      data-testid={`button-nav-launch-${provider}`}
                    >
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${meta.color}26` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-sm" style={{ color: meta.color }}>
                          {meta.name}
                        </p>
                        <p className="text-[11px] text-white/55">{meta.tagline}</p>
                      </div>
                      {isDefault ? (
                        <div
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md"
                          style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}55` }}
                          data-testid={`badge-nav-default-${provider}`}
                        >
                          <Check className="h-3 w-3" style={{ color: meta.color }} />
                          <span className="text-[10px] font-display font-bold tracking-wide" style={{ color: meta.color }}>
                            Default
                          </span>
                        </div>
                      ) : null}
                    </button>
                    {/* Set/change default row */}
                    {isDefault ? (
                      <button
                        onClick={() => onSetPreference(null)}
                        className="w-full text-center text-[11px] text-white/40 hover:text-white/60 transition-colors py-0.5"
                        data-testid={`button-nav-clear-default-${provider}`}
                      >
                        Always use {meta.name.replace("Open in ", "")} · <span className="underline underline-offset-2">Change</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onSetPreference(provider)}
                        className="w-full text-center text-[11px] text-white/40 hover:text-white/60 transition-colors py-0.5"
                        data-testid={`button-nav-set-default-${provider}`}
                      >
                        Always use {meta.name.replace("Open in ", "")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Apple Maps tertiary link — iOS only (Apple Maps doesn't make sense on Android) */}
            {isIOS() && state.urls.apple ? (
              <div className="pt-1 space-y-1">
                <button
                  onClick={() => handleLaunch(state.urls.apple!)}
                  className="w-full text-center text-[12px] font-display font-semibold tracking-wide text-white/55 hover:text-white/80 transition-colors py-2"
                  data-testid="button-nav-launch-apple"
                >
                  {preferredProvider === "apple" ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Check className="h-3 w-3 text-slate-400" />
                      <span>Default · Open in Apple Maps</span>
                    </span>
                  ) : (
                    "More options · Open in Apple Maps"
                  )}
                </button>
                {preferredProvider === "apple" ? (
                  <button
                    onClick={() => onSetPreference(null)}
                    className="w-full text-center text-[11px] text-white/40 hover:text-white/60 transition-colors py-0.5"
                    data-testid="button-nav-clear-default-apple"
                  >
                    Always use Apple Maps · <span className="underline underline-offset-2">Change</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onSetPreference("apple")}
                    className="w-full text-center text-[11px] text-white/40 hover:text-white/60 transition-colors py-0.5"
                    data-testid="button-nav-set-default-apple"
                  >
                    Always use Apple Maps
                  </button>
                )}
              </div>
            ) : null}

            {/* Reassurance + cancel */}
            <div className="pt-1 space-y-3">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-white/55">
                <Shield className="h-3.5 w-3.5 text-emerald-400/80" />
                <span>Your job is still active in GUBER.</span>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="w-full py-3 rounded-2xl font-display font-bold text-[12px] tracking-[0.12em] uppercase text-white/70 hover:text-white border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                data-testid="button-nav-sheet-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function useNavigationCover() {
  const [state, setState] = useState<SheetState>(null);

  const { data: user } = useQuery<any>({ queryKey: ["/api/auth/me"] });

  const prefMutation = useMutation({
    mutationFn: async (provider: NavProvider | null) => {
      const apiValue = provider ? PROVIDER_TO_PREF[provider] : null;
      const r = await apiRequest("POST", "/api/users/me/preferred-map-app", { app: apiValue });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const storedPref: string | null = user?.preferredMapApp ?? null;
  const preferredProvider: NavProvider | null = storedPref ? (PREF_TO_PROVIDER[storedPref] ?? null) : null;

  const launch = useCallback(
    (opts: NavLaunchOpts) => {
      const currentPref: string | null = (user as any)?.preferredMapApp ?? null;
      const currentProvider: NavProvider | null = currentPref ? (PREF_TO_PROVIDER[currentPref] ?? null) : null;

      // Don't auto-launch Apple Maps on non-iOS platforms — its URL only opens
      // a useless web page on Android. Fall through to the sheet instead.
      const canAutoLaunch = currentProvider && (currentProvider !== "apple" || isIOS());

      if (canAutoLaunch && currentProvider) {
        const url = opts.urls[currentProvider];
        if (url) {
          launchExternal(url);
          return;
        }
      }
      setState({ ...opts, open: true });
    },
    [user],
  );

  const close = useCallback(() => setState(null), []);

  const cover =
    state && state.open ? (
      <NavigationLaunchSheet
        state={state}
        preferredProvider={preferredProvider}
        onSetPreference={(provider) => prefMutation.mutate(provider)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
    ) : null;

  return { cover, launch };
}
