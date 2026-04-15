import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard, FileText, Settings, LogOut,
  Menu, X, Building2, ChevronRight, ChevronLeft, Flame, Search,
  ShieldCheck, Send, ClipboardList, Eye
} from "lucide-react";

const GOLD = "#C6A85C";
const GOLD_DK = "#A88A43";

type NavItem =
  | { label: string; href: string; icon: any }
  | { section: "divider" }
  | { sectionLabel: string };

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/biz/dashboard", icon: LayoutDashboard },
  { section: "divider" },
  { sectionLabel: "SCOUTING" },
  { label: "Talent Explorer", href: "/biz/talent-explorer", icon: Search },
  { label: "Sent Offers", href: "/biz/offers", icon: Send },
  { label: "Verification", href: "/biz/verification", icon: ShieldCheck },
  { section: "divider" },
  { sectionLabel: "OPERATIONS" },
  { label: "Assignments", href: "/biz/post-job", icon: ClipboardList },
  { label: "Inspection Standards", href: "/biz/templates", icon: FileText },
  { section: "divider" },
  { sectionLabel: "CAMPAIGNS" },
  { label: "Field Observations", href: "/biz/observations", icon: Eye },
  { label: "Sponsor a Drop", href: "/biz/sponsor-drop", icon: Flame },
  { section: "divider" },
  { label: "Account", href: "/biz/account", icon: Settings },
];

function BizSidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#000000", width: "100%", borderRight: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between px-5 pb-5" style={{ paddingTop: "max(1.75rem, env(safe-area-inset-top, 1.75rem))" }}>
        <Link href="/biz/dashboard">
          <div className="flex items-center gap-2.5 cursor-pointer group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-shadow group-hover:shadow-lg"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, boxShadow: "0 2px 8px rgba(168,138,67,0.25)" }}
            >
              <Building2 className="w-4 h-4 text-black" />
            </div>
            <div>
              <p className="text-white font-black text-[15px] tracking-tight leading-none">GUBER</p>
              <p style={{ color: GOLD_DK, fontSize: "9px", letterSpacing: "0.22em", fontWeight: 700, marginTop: 1 }}>BUSINESS</p>
            </div>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors lg:hidden" data-testid="biz-mobile-close">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="px-3 flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        {NAV.map((item, idx) => {
          if ("section" in item) {
            return <div key={`div-${idx}`} className="h-px mx-2 my-2" style={{ background: "rgba(255,255,255,0.04)" }} />;
          }
          if ("sectionLabel" in item) {
            return (
              <p
                key={`label-${idx}`}
                className="px-3 pt-2 pb-1.5"
                style={{ color: "#3F3F46", fontSize: "9px", fontWeight: 700, letterSpacing: "0.2em" }}
              >
                {item.sectionLabel}
              </p>
            );
          }
          const { label, href, icon: Icon } = item;
          const active = location === href || (href !== "/biz/dashboard" && location.startsWith(href));
          return (
            <Link key={href} href={href} onClick={onClose}>
              <button
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left group relative"
                style={{
                  background: active ? "rgba(168,138,67,0.10)" : "transparent",
                  color: active ? GOLD : "#52525B",
                }}
                data-testid={`biz-nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                    style={{ height: "55%", background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DK})` }}
                  />
                )}
                <Icon className="w-[15px] h-[15px] flex-shrink-0" style={{ opacity: active ? 1 : 0.7 }} />
                <span style={{ fontSize: "12.5px", fontWeight: active ? 600 : 400, letterSpacing: "0.01em" }}>
                  {label}
                </span>
                {active && (
                  <span className="ml-auto w-1 h-1 rounded-full" style={{ background: GOLD }} />
                )}
              </button>
            </Link>
          );
        })}
      </div>

      <div className="px-3 pb-5 mt-2 border-t border-white/[0.04] pt-3 space-y-0.5">
        <Link href="/dashboard">
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left hover:bg-white/[0.02]"
            style={{ color: "#3F3F46" }}
            data-testid="biz-nav-consumer-app"
          >
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 rotate-180" />
            <span style={{ fontSize: "11.5px", letterSpacing: "0.01em" }}>Consumer App</span>
          </button>
        </Link>
        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left hover:bg-red-500/[0.04]"
          style={{ color: "#3F3F46" }}
          data-testid="biz-nav-logout"
        >
          <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
          <span style={{ fontSize: "11.5px", letterSpacing: "0.01em" }}>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

export function BizLayout({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [location, navigate] = useLocation();
  const isSubPage = location !== "/biz/dashboard";

  return (
    <div className="min-h-screen flex" style={{ background: "#050505" }}>
      <div className="hidden lg:block flex-shrink-0" style={{ width: "240px" }}>
        <div className="fixed top-0 left-0 h-screen overflow-hidden" style={{ width: "240px" }}>
          <BizSidebar />
        </div>
      </div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="absolute left-0 top-0 h-full" style={{ width: "240px", zIndex: 51 }}>
            <BizSidebar onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="lg:hidden flex items-center gap-3 px-4 sticky top-0 z-40"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", paddingBottom: "0.75rem" }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            style={{ color: "#52525B" }}
            data-testid="biz-mobile-menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          {isSubPage && (
            <button
              onClick={() => navigate("/biz/dashboard")}
              className="flex items-center gap-1 transition-colors hover:text-zinc-300"
              style={{ color: "#71717A", fontSize: "12px", fontWeight: 500 }}
              data-testid="biz-back-button"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <p className="text-white font-black text-sm tracking-tight">GUBER</p>
            <p style={{ color: GOLD_DK, fontSize: "9px", letterSpacing: "0.22em", fontWeight: 700 }}>BUSINESS</p>
          </div>
        </div>

        <main className="flex-1 p-5 lg:p-8 relative">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none opacity-[0.015] rounded-full"
            style={{ background: `radial-gradient(circle, ${GOLD}, transparent 70%)`, transform: "translate(30%, -30%)" }} />
          <div className="relative z-[1]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
