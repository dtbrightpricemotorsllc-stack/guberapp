import { Switch, Route, Redirect, useLocation, useSearch } from "wouter";
import { useEffect, useState, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import SplashScreen from "@/components/splash-screen";
import InstallPrompt from "@/components/install-prompt";
import AnnouncementPopup from "@/components/announcement-popup";
import { Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  lockBiometricSession,
  getBiometricEnabled,
  ensureBiometricUnlocked,
  isBiometricSessionUnlocked,
} from "@/lib/biometric";

// Core pages — eagerly loaded (fast path for first-visit users)
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import AuthSuccess from "@/pages/auth-success";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import AcceptableUse from "@/pages/acceptable-use";
import DeleteAccount from "@/pages/delete-account";
import JoinPage from "@/pages/join";

// Authenticated consumer pages — lazy loaded
const Dashboard = lazy(() => import("@/pages/dashboard"));
const BrowseJobs = lazy(() => import("@/pages/browse-jobs"));
const JobDetail = lazy(() => import("@/pages/job-detail"));
const JobNavigate = lazy(() => import("@/pages/job-navigate"));
const PostJob = lazy(() => import("@/pages/post-job"));
const MyJobs = lazy(() => import("@/pages/my-jobs"));
const Profile = lazy(() => import("@/pages/profile"));
const AccountSettings = lazy(() => import("@/pages/account-settings"));
const NotificationsPage = lazy(() => import("@/pages/notifications-page"));
const WalletPage = lazy(() => import("@/pages/wallet"));
const JobPaymentSuccess = lazy(() => import("@/pages/job-payment-success"));
const OGSuccess = lazy(() => import("@/pages/og-success"));
const WorkerClipboard = lazy(() => import("@/pages/worker-clipboard"));
const VIRequests = lazy(() => import("@/pages/vi-requests"));
const Marketplace = lazy(() => import("@/pages/marketplace"));
const MarketplacePreview = lazy(() => import("@/pages/marketplace-preview"));
const MapExplore = lazy(() => import("@/pages/map-explore"));
const CashDropDetail = lazy(() => import("@/pages/cash-drop-detail"));
const ResumePage = lazy(() => import("@/pages/resume"));
const SubmitObservation = lazy(() => import("@/pages/submit-observation"));
const ObservationMarketplace = lazy(() => import("@/pages/observation-marketplace"));
const HostDropNew = lazy(() => import("@/pages/host-drop-new"));

// Feature pages — lazy loaded
const Admin = lazy(() => import("@/pages/admin"));
const AiOrNot = lazy(() => import("@/pages/ai-or-not"));
const VerifyInspect = lazy(() => import("@/pages/verify-inspect"));
const BusinessOnboarding = lazy(() => import("@/pages/business-onboarding"));
const BusinessSignup = lazy(() => import("@/pages/business-signup"));

// Business portal pages — lazy loaded
const BizDashboard = lazy(() => import("@/pages/biz-dashboard"));
const BizPostJob = lazy(() => import("@/pages/biz-post-job"));
const BizBulkPost = lazy(() => import("@/pages/biz-bulk-post"));
const BizTemplates = lazy(() => import("@/pages/biz-templates"));
const BizAccount = lazy(() => import("@/pages/biz-account"));
const BizObservations = lazy(() => import("@/pages/biz-observations"));
const BizSponsorDrop = lazy(() => import("@/pages/biz-sponsor-drop"));
const BizSponsorDropSuccess = lazy(() => import("@/pages/biz-sponsor-drop-success"));
const BizSponsorDropCancel = lazy(() => import("@/pages/biz-sponsor-drop-cancel"));
const BizTalentExplorer = lazy(() => import("@/pages/biz-talent-explorer"));
const BizVerification = lazy(() => import("@/pages/biz-verification"));
const BizOffers = lazy(() => import("@/pages/biz-offers"));


function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function BizLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#09090B" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#C9A84C" }} />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [currentPath] = useLocation();

  if (isLoading) return <PageLoader />;
  if (!user) {
    const returnTo = encodeURIComponent(currentPath);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function BizRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <BizLoader />;
  if (!user) return <Redirect to="/login" />;
  if (user.accountType !== "business") return <Redirect to="/dashboard" />;

  return (
    <Suspense fallback={<BizLoader />}>
      <Component />
    </Suspense>
  );
}

function ConsumerRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [currentPath] = useLocation();

  if (isLoading) return <PageLoader />;
  if (!user) {
    const returnTo = encodeURIComponent(currentPath);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }
  if (user.accountType === "business") return <Redirect to="/biz/dashboard" />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function RootRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Redirect to="/login" />;
  if (user.accountType === "business") return <Redirect to="/biz/dashboard" />;
  return <Redirect to="/dashboard" />;
}

function PublicOnly({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const search = useSearch();

  if (isLoading) return <PageLoader />;
  if (user) {
    const rawReturnTo = new URLSearchParams(search).get("returnTo");
    const returnTo = rawReturnTo && rawReturnTo.startsWith("/") ? rawReturnTo : null;
    if (returnTo) return <Redirect to={returnTo} />;
    if (user.accountType === "business") return <Redirect to="/biz/dashboard" />;
    return <Redirect to="/dashboard" />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/login" component={() => <PublicOnly component={Login} />} />
      <Route path="/signup" component={() => <PublicOnly component={Signup} />} />
      <Route path="/business-signup" component={() => <PublicOnly component={BusinessSignup} />} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/oauth-landing" component={() => {
        const s = useSearch();
        const [, nav] = useLocation();
        useEffect(() => { const t = new URLSearchParams(s).get("t"); nav(t ? `/login?t=${t}` : "/login"); }, []);
        return null;
      }} />
      <Route path="/dashboard" component={() => <ConsumerRoute component={Dashboard} />} />
      <Route path="/browse-jobs" component={() => <ProtectedRoute component={BrowseJobs} />} />
      <Route path="/jobs/:id/navigate" component={() => <ProtectedRoute component={JobNavigate} />} />
      <Route path="/jobs/:id" component={() => <ProtectedRoute component={JobDetail} />} />
      <Route path="/post-job" component={() => <ConsumerRoute component={PostJob} />} />
      <Route path="/my-jobs" component={() => <ConsumerRoute component={MyJobs} />} />
      <Route path="/profile" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/profile/:id" component={() => <ProtectedRoute component={Profile} />} />
      <Route path="/account-settings" component={() => <ConsumerRoute component={AccountSettings} />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={NotificationsPage} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
      <Route path="/ai-or-not" component={() => <ProtectedRoute component={AiOrNot} />} />
      <Route path="/verify-inspect" component={() => <ProtectedRoute component={VerifyInspect} />} />
      <Route path="/wallet" component={() => <ConsumerRoute component={WalletPage} />} />
      <Route path="/job-payment-success" component={() => <ProtectedRoute component={JobPaymentSuccess} />} />
      <Route path="/og-success" component={() => <ProtectedRoute component={OGSuccess} />} />
      <Route path="/worker-clipboard/:id" component={() => <ProtectedRoute component={WorkerClipboard} />} />
      <Route path="/vi-requests" component={() => <ProtectedRoute component={VIRequests} />} />
      <Route path="/marketplace" component={() => <ProtectedRoute component={Marketplace} />} />
      <Route path="/marketplace-preview" component={() => <ProtectedRoute component={MarketplacePreview} />} />
      <Route path="/map" component={() => <ProtectedRoute component={MapExplore} />} />
      <Route path="/cash-drop/:id" component={() => <ProtectedRoute component={CashDropDetail} />} />
      <Route path="/business-onboarding" component={() => <ProtectedRoute component={BusinessOnboarding} />} />
      <Route path="/business-templates" component={() => <Redirect to="/biz/templates" />} />
      <Route path="/business-bulk-post" component={() => <Redirect to="/biz/bulk-post" />} />
      <Route path="/business-dashboard" component={() => <Redirect to="/biz/dashboard" />} />
      <Route path="/resume" component={() => <ProtectedRoute component={ResumePage} />} />
      <Route path="/resume/:userId" component={() => <ProtectedRoute component={ResumePage} />} />
      <Route path="/submit-observation" component={() => <ProtectedRoute component={SubmitObservation} />} />
      <Route path="/observations" component={() => <ProtectedRoute component={ObservationMarketplace} />} />
      <Route path="/host-drop/new" component={() => <ProtectedRoute component={HostDropNew} />} />
      <Route path="/host-drop/edit/:id" component={() => <ProtectedRoute component={HostDropNew} />} />
      <Route path="/biz/login" component={() => <Redirect to="/login" />} />
      <Route path="/biz/dashboard" component={() => <BizRoute component={BizDashboard} />} />
      <Route path="/biz/post-job" component={() => <BizRoute component={BizPostJob} />} />
      <Route path="/biz/bulk-post" component={() => <BizRoute component={BizBulkPost} />} />
      <Route path="/biz/templates" component={() => <BizRoute component={BizTemplates} />} />
      <Route path="/biz/observations" component={() => <BizRoute component={BizObservations} />} />
      <Route path="/biz/sponsor-drop/success" component={() => <BizRoute component={BizSponsorDropSuccess} />} />
      <Route path="/biz/sponsor-drop/cancel" component={() => <BizRoute component={BizSponsorDropCancel} />} />
      <Route path="/biz/sponsor-drop" component={() => <BizRoute component={BizSponsorDrop} />} />
      <Route path="/biz/talent-explorer" component={() => <BizRoute component={BizTalentExplorer} />} />
      <Route path="/biz/verification" component={() => <BizRoute component={BizVerification} />} />
      <Route path="/biz/offers" component={() => <BizRoute component={BizOffers} />} />
      <Route path="/biz/account" component={() => <BizRoute component={BizAccount} />} />
      <Route path="/auth-success" component={AuthSuccess} />
      <Route path="/join/:code" component={JoinPage} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/acceptable-use" component={AcceptableUse} />
      <Route path="/delete-account" component={DeleteAccount} />
      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function NativeDeepLinkHandler() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const [biometricLocked, setBiometricLocked] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let urlHandle: { remove: () => void } | null = null;
    let stateHandle: { remove: () => void } | null = null;

    CapApp.addListener("appUrlOpen", (event: { url: string }) => {
      const url = event.url;

      try {
        const parsed = new URL(url);

        // guber:// custom scheme (Android/iOS native OAuth callback)
        // e.g. guber://auth-success?token=... → host="auth-success", pathname=""
        if (parsed.protocol === "guber:") {
          const path = "/" + parsed.host + (parsed.search || "");
          if (path.startsWith("/auth-success")) {
            // Close the Chrome Custom Tab so it doesn't linger behind the app.
            // Do this before setLocation so the WebView is foregrounded first.
            Browser.close().catch(() => {});
            setLocation("/auth-success" + (parsed.search || ""));
          }
          return;
        }

        // Universal Links: https://guberapp.app/<path>
        const path = parsed.pathname + (parsed.search || "");
        if (path.startsWith("/auth-success")) {
          setLocation("/auth-success" + (parsed.search || ""));
        } else if (
          path.startsWith("/login") ||
          path.startsWith("/join/") ||
          path.startsWith("/dashboard") ||
          path.startsWith("/biz/")
        ) {
          setLocation(path);
        }
      } catch {
        // Non-URL format — ignore
      }
    }).then((h) => { urlHandle = h; });

    CapApp.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
      if (!isActive) {
        lockBiometricSession();
        return;
      }

      // App returned to foreground — re-prompt if biometric is enabled and session is locked
      (async () => {
        try {
          const enabled = await getBiometricEnabled();
          if (!enabled || isBiometricSessionUnlocked()) return;

          setBiometricLocked(true);
          const unlocked = await ensureBiometricUnlocked();
          if (unlocked) {
            setBiometricLocked(false);
          } else {
            // Failed or cancelled — sign the user out before clearing overlay
            // so content is never visible in an unauthenticated state
            try {
              await logout();
            } finally {
              setBiometricLocked(false);
            }
          }
        } catch {
          // Unexpected error — fail closed: keep locked and attempt sign-out
          try {
            await logout();
          } finally {
            setBiometricLocked(false);
          }
        }
      })();
    }).then((h) => { stateHandle = h; });

    return () => {
      urlHandle?.remove();
      stateHandle?.remove();
    };
  }, [logout]);

  if (biometricLocked) {
    return (
      <div
        data-testid="biometric-lock-overlay"
        className="fixed inset-0 z-[9999] bg-background"
        aria-hidden="true"
      />
    );
  }

  return null;
}

function App() {
  const [splashDone, setSplashDone] = useState(() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("nosplash")) return true;
    }
    return false;
  });

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
            <InstallPrompt />
            <AnnouncementPopup />
            <NativeDeepLinkHandler />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
