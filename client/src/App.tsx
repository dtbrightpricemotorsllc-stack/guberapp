import { Switch, Route, Redirect, useLocation, useSearch } from "wouter";
import { useEffect, useState, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { parsePurchaseUrl } from "@/lib/purchase-toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { UploadProgressPill } from "@/components/upload-progress-pill";
import { useToast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { taskTrackingService } from "@/services/location/TaskTrackingService";
import { ThemeProvider } from "@/lib/theme-context";
import InstallPrompt from "@/components/install-prompt";
import { GoogleAuthOverlay } from "@/components/google-auth-overlay";
import AnnouncementPopup from "@/components/announcement-popup";
import { Capacitor } from "@capacitor/core";
import { isStoreBuild } from "@/lib/platform";
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
import GetStarted from "@/pages/get-started";
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
import { LoadingSplash } from "@/components/loading-splash";

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
const MarketplaceListing = lazy(() => import("@/pages/marketplace-listing"));
const MarketplaceDeal = lazy(() => import("@/pages/marketplace-deal"));
const MapExplore = lazy(() => import("@/pages/map-explore"));
const CashDropsList = lazy(() => import("@/pages/cash-drops-list"));
const CashDropDetail = lazy(() => import("@/pages/cash-drop-detail"));
const ResumePage = lazy(() => import("@/pages/resume"));
const SubmitObservation = lazy(() => import("@/pages/submit-observation"));
const ObservationMarketplace = lazy(() => import("@/pages/observation-marketplace"));
const HostDropNew = lazy(() => import("@/pages/host-drop-new"));
const Studio = lazy(() => import("@/pages/studio"));
const StudioCredits = lazy(() => import("@/pages/studio-credits"));
const StudioExplore = lazy(() => import("@/pages/studio-explore"));
const StudioMirrorMotion = lazy(() => import("@/pages/studio-mirror-motion"));
const StudioCommercial = lazy(() => import("@/pages/studio-commercial"));
const StudioTextToVideo = lazy(() => import("@/pages/studio-text-to-video"));
const StudioMusic = lazy(() => import("@/pages/studio-music"));
const StudioAvatar = lazy(() => import("@/pages/studio-avatar"));
const StudioListingVideo = lazy(() => import("@/pages/studio-listing-video"));
const StudioPromoClip = lazy(() => import("@/pages/studio-promo-clip"));
const StudioQuickPic = lazy(() => import("@/pages/studio-quick-pic"));
const StudioAiDirector = lazy(() => import("@/pages/studio-ai-director"));
const Investors = lazy(() => import("@/pages/investors"));
const MobileCheckout = lazy(() => import("@/pages/mobile-checkout"));
const BuyerOrderPreview = lazy(() => import("@/pages/buyer-order-preview"));

// GUBER OS pages — lazy loaded, admin-only
const OSDashboard = lazy(() => import("@/pages/os/os-dashboard"));
const OSApprove = lazy(() => import("@/pages/os/os-approve"));
const OSMemory = lazy(() => import("@/pages/os/os-memory"));
const OSAgents = lazy(() => import("@/pages/os/os-agents"));
const OSLogs = lazy(() => import("@/pages/os/os-logs"));
const OSEvents = lazy(() => import("@/pages/os/os-events"));
const OSCommandCenter = lazy(() => import("@/pages/os/os-command-center"));
const OSBriefing = lazy(() => import("@/pages/os/os-briefing"));
const OSCOOAgent = lazy(() => import("@/pages/os/os-coo"));
const OSCFOAgent = lazy(() => import("@/pages/os/os-cfo"));
const OSGrowthAgent = lazy(() => import("@/pages/os/os-growth"));
const OSMissionControl = lazy(() => import("@/pages/os/os-mission-control"));

// Feature pages — lazy loaded
const Admin = lazy(() => import("@/pages/admin"));
const AdminQa = lazy(() => import("@/pages/admin-qa"));
const AdminQaInspect = lazy(() => import("@/pages/admin-qa-inspect"));
const AdminQaCashdropDebug = lazy(() => import("@/pages/admin-qa-cashdrop-debug"));
const AdminQaFlags = lazy(() => import("@/pages/admin-qa-flags"));
const AdminQaPush = lazy(() => import("@/pages/admin-qa-push"));
const AdminUserProfile = lazy(() => import("@/pages/admin-user-profile"));
const AdminStudio = lazy(() => import("@/pages/admin-studio"));
const AdminGuberScout = lazy(() => import("@/pages/admin-guber-scout"));
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
const BizVerifyInspect = lazy(() => import("@/pages/biz-verify-inspect"));
const LoadBoard = lazy(() => import("@/pages/load-board"));
const LoadBoardPost = lazy(() => import("@/pages/load-board-post"));
const LoadBoardDetail = lazy(() => import("@/pages/load-board-detail"));
const LoadBoardEdit = lazy(() => import("@/pages/load-board-edit"));
const LoadBoardCarrierHub = lazy(() => import("@/pages/load-board-carrier-hub"));
const FoundersClub = lazy(() => import("@/pages/founders-club"));
const CustodyCarrier = lazy(() => import("@/pages/custody-carrier"));
const CustodyAsset = lazy(() => import("@/pages/custody-asset"));
const CustodyWitness = lazy(() => import("@/pages/custody-witness"));
const AdminAssetProtection = lazy(() => import("@/pages/admin-asset-protection"));
const GrowthTasks = lazy(() => import("@/pages/growth-tasks"));
const GrowthLeaderboard = lazy(() => import("@/pages/leaderboard"));
const AdminGrowthEngine = lazy(() => import("@/pages/admin-growth-engine"));
const AdminLocalBusinesses = lazy(() => import("@/pages/admin-local-businesses"));
const OgAdvantage = lazy(() => import("@/pages/og-advantage"));
const CreditsPage = lazy(() => import("@/pages/credits"));
const CarrierProfilePage = lazy(() => import("@/pages/carrier-profile"));


// Universal GUBER loading splash — replaces the legacy spinner-based loaders
// so that every route-guard auth check and every lazy-loaded page Suspense
// fallback shows the panda + neon shield splash with rotating messages.
// Using `loading` literal-true here is intentional: the parent unmounts this
// element when work is done, which provides a fast hand-off to the next view.
function PageLoader() {
  return <LoadingSplash loading />;
}

function BizLoader() {
  return <LoadingSplash loading />;
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

// Admin-only route wrapper (task-462). Backend already gates every
// /api/admin/* route, but we also block the client surface so non-admins
// don't see the dashboard load-and-flash empty data, and so navigation never
// dead-ends a regular user.
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [currentPath] = useLocation();

  if (isLoading) return <PageLoader />;
  if (!user) {
    const returnTo = encodeURIComponent(currentPath);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }
  if (user.role !== "admin") return <Redirect to="/dashboard" />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

function OSAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [currentPath] = useLocation();

  if (isLoading) return <PageLoader />;
  if (!user) {
    const returnTo = encodeURIComponent(currentPath);
    return <Redirect to={`/login?returnTo=${returnTo}`} />;
  }
  if (user.role !== "admin") {
    fetch("/api/os/unauthorized", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath, role: user.role }),
      credentials: "include",
    }).catch(() => {});
    return <Redirect to="/dashboard" />;
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
  if (!user) return isStoreBuild ? <Redirect to="/login" /> : <Home />;
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
      <Route path="/get-started" component={GetStarted} />
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
      <Route path="/os/command-center" component={() => <OSAdminRoute component={OSCommandCenter} />} />
      <Route path="/os/briefing" component={() => <OSAdminRoute component={OSBriefing} />} />
      <Route path="/os/coo" component={() => <OSAdminRoute component={OSCOOAgent} />} />
      <Route path="/os/cfo" component={() => <OSAdminRoute component={OSCFOAgent} />} />
      <Route path="/os/growth" component={() => <OSAdminRoute component={OSGrowthAgent} />} />
      <Route path="/os/mission-control" component={() => <OSAdminRoute component={OSMissionControl} />} />
      <Route path="/os/dashboard" component={() => <OSAdminRoute component={OSDashboard} />} />
      <Route path="/os/approve" component={() => <OSAdminRoute component={OSApprove} />} />
      <Route path="/os/memory" component={() => <OSAdminRoute component={OSMemory} />} />
      <Route path="/os/agents" component={() => <OSAdminRoute component={OSAgents} />} />
      <Route path="/os/logs" component={() => <OSAdminRoute component={OSLogs} />} />
      <Route path="/os/events" component={() => <OSAdminRoute component={OSEvents} />} />
      <Route path="/admin" component={() => <AdminRoute component={Admin} />} />
      <Route path="/admin/qa" component={() => <AdminRoute component={AdminQa} />} />
      <Route path="/admin/qa/flags" component={() => <AdminRoute component={AdminQaFlags} />} />
      <Route path="/admin/qa/push" component={() => <AdminRoute component={AdminQaPush} />} />
      <Route path="/admin/qa/cashdrops/:id/debug" component={() => <AdminRoute component={AdminQaCashdropDebug} />} />
      <Route path="/admin/qa/inspect/:type/:id" component={() => <AdminRoute component={AdminQaInspect} />} />
      <Route path="/admin/users/:id" component={() => <AdminRoute component={AdminUserProfile} />} />
      <Route path="/admin/studio" component={() => <AdminRoute component={AdminStudio} />} />
      <Route path="/admin/guber-scout" component={() => <AdminRoute component={AdminGuberScout} />} />
      <Route path="/admin/asset-protection" component={() => <AdminRoute component={AdminAssetProtection} />} />
      <Route path="/admin/growth-engine" component={() => <AdminRoute component={AdminGrowthEngine} />} />
      <Route path="/admin/local-businesses" component={() => <AdminRoute component={AdminLocalBusinesses} />} />
      <Route path="/og-advantage" component={() => <Suspense fallback={<PageLoader />}><OgAdvantage /></Suspense>} />
      <Route path="/community-tasks" component={() => <ProtectedRoute component={GrowthTasks} />} />
      <Route path="/growth/leaderboard" component={GrowthLeaderboard} />
      <Route path="/ai-or-not" component={() => <ProtectedRoute component={AiOrNot} />} />
      <Route path="/verify-inspect" component={() => <ProtectedRoute component={VerifyInspect} />} />
      <Route path="/wallet" component={() => <ConsumerRoute component={WalletPage} />} />
      <Route path="/job-payment-success" component={() => <ProtectedRoute component={JobPaymentSuccess} />} />
      <Route path="/og-success" component={() => <ProtectedRoute component={OGSuccess} />} />
      <Route path="/worker-clipboard/:id" component={() => <ProtectedRoute component={WorkerClipboard} />} />
      <Route path="/vi-requests" component={() => <ProtectedRoute component={VIRequests} />} />
      <Route path="/marketplace" component={() => <ProtectedRoute component={Marketplace} />} />
      <Route path="/marketplace/deals/:id" component={() => <ProtectedRoute component={MarketplaceDeal} />} />
      <Route path="/marketplace/p/:slug" component={() => <Suspense fallback={<PageLoader />}><MarketplaceListing /></Suspense>} />
      <Route path="/buyer-order-preview/:id" component={() => <Suspense fallback={<PageLoader />}><BuyerOrderPreview /></Suspense>} />
      <Route path="/marketplace-preview" component={() => <Redirect to="/marketplace" />} />
      <Route path="/map" component={() => <ProtectedRoute component={MapExplore} />} />
      <Route path="/cash-drops" component={() => <ConsumerRoute component={CashDropsList} />} />
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
      <Route path="/studio" component={() => <ProtectedRoute component={Studio} />} />
      <Route path="/studio/credits" component={() => <ProtectedRoute component={StudioCredits} />} />
      <Route path="/studio/explore" component={() => <ProtectedRoute component={StudioExplore} />} />
      <Route path="/studio/mirror-motion" component={() => <ProtectedRoute component={StudioMirrorMotion} />} />
      <Route path="/studio/commercial" component={() => <ProtectedRoute component={StudioCommercial} />} />
      <Route path="/studio/text-to-video" component={() => <ProtectedRoute component={StudioTextToVideo} />} />
      <Route path="/studio/music" component={() => <ProtectedRoute component={StudioMusic} />} />
      <Route path="/studio/avatar" component={() => <ProtectedRoute component={StudioAvatar} />} />
      <Route path="/studio/listing-video" component={() => <ProtectedRoute component={StudioListingVideo} />} />
      <Route path="/studio/promo-clip" component={() => <ProtectedRoute component={StudioPromoClip} />} />
      <Route path="/studio/quick-pic" component={() => <ProtectedRoute component={StudioQuickPic} />} />
      <Route path="/studio/ai-director" component={() => <ProtectedRoute component={StudioAiDirector} />} />
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
      <Route path="/biz/verify-inspect" component={() => <BizRoute component={BizVerifyInspect} />} />
      <Route path="/biz/account" component={() => <BizRoute component={BizAccount} />} />
      <Route path="/load-board/carrier" component={() => <ProtectedRoute component={LoadBoardCarrierHub} />} />
      <Route path="/load-board/post" component={() => <ProtectedRoute component={LoadBoardPost} />} />
      <Route path="/load-board/:id/edit" component={() => <ProtectedRoute component={LoadBoardEdit} />} />
      <Route path="/load-board/:id" component={() => <ProtectedRoute component={LoadBoardDetail} />} />
      <Route path="/load-board" component={() => <ProtectedRoute component={LoadBoard} />} />
      <Route path="/custody/carrier" component={() => <ProtectedRoute component={CustodyCarrier} />} />
      <Route path="/custody/witness" component={() => <ProtectedRoute component={CustodyWitness} />} />
      <Route path="/custody/asset/:id" component={() => <ProtectedRoute component={CustodyAsset} />} />
      <Route path="/founders" component={() => <ProtectedRoute component={FoundersClub} />} />
      <Route path="/carrier-profile" component={() => <ProtectedRoute component={CarrierProfilePage} />} />
      <Route path="/auth-success" component={AuthSuccess} />
      <Route path="/join/:code" component={JoinPage} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/acceptable-use" component={AcceptableUse} />
      <Route path="/delete-account" component={DeleteAccount} />
      <Route path="/investors" component={Investors} />
      <Route path="/guber-investor-deck" component={Investors} />
      <Route path="/credits" component={() => <ProtectedRoute component={CreditsPage} />} />
      <Route path="/mobile-checkout" component={() => <Suspense fallback={<PageLoader />}><MobileCheckout /></Suspense>} />
      <Route component={NotFound} />
    </Switch>
    </>
  );
}

export function NativeDeepLinkHandler() {
  const [, setLocation] = useLocation();
  const { logout } = useAuth();
  const { toast } = useToast();
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
          const host = parsed.host;
          const path = "/" + host + (parsed.search || "");
          if (path.startsWith("/auth-success")) {
            // Close the Chrome Custom Tab so it doesn't linger behind the app.
            // Do this before setLocation so the WebView is foregrounded first.
            Browser.close().catch(() => {});
            setLocation("/auth-success" + (parsed.search || ""));
          } else if (host === "purchase-complete") {
            // User tapped "Return to GUBER app" on the Stripe success page.
            // Close the SFSafariViewController popover and immediately refresh
            // the user record so updated credits / tier appear without delay.
            Browser.close().catch(() => {});
            queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            const purchaseToast = parsePurchaseUrl(url);
            if (purchaseToast) toast(purchaseToast);
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

// Thin wrapper rendered inside AuthProvider so it can read isLoading and
// drive the universal badger LoadingSplash. The splash keeps animating
// until auth resolves AND its built-in minVisibleMs (one full message
// cycle) has elapsed, then fades out smoothly via onDone.
//
// On the very first cold-start splash of a session we also fire the
// signature GUBER ping (once per tab session). This is gated by
// sessionStorage so it never replays on hot reloads, route changes, or
// in-app loading splashes — only the true app-launch moment. iOS
// requires a prior user gesture for audio playback, so the call may be
// silently no-op'd on the first ever launch; that's intentional.
const COLD_START_PING_KEY = "guber_cold_start_pinged";
function SplashWrapper({ onDone }: { onDone: () => void }) {
  const { isLoading } = useAuth();
  useEffect(() => {
    try {
      if (sessionStorage.getItem(COLD_START_PING_KEY) === "1") return;
      sessionStorage.setItem(COLD_START_PING_KEY, "1");
    } catch {
      return;
    }
    import("@/lib/notification-sound")
      .then(({ playGuberPing }) => playGuberPing())
      .catch(() => {});
  }, []);
  return <LoadingSplash loading={isLoading} onDone={onDone} />;
}

// Resume an in-progress live-location task after a reload / app relaunch. Only
// fires once we have an authenticated user; the service no-ops if nothing was
// being tracked, and the server tears it down if the job has since ended.
function TaskTrackingResumer() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) {
      void taskTrackingService.resumeIfActive();
    } else {
      // User logged out — stop any active tracking immediately.
      void taskTrackingService.stopTask();
    }
  }, [user?.id]);
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
            <TaskTrackingResumer />
            <Toaster />
            <UploadProgressPill />
            <GoogleAuthOverlay />
            {!splashDone && <SplashWrapper onDone={() => setSplashDone(true)} />}
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
