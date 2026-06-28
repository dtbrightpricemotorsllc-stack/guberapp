import { useToast } from "@/hooks/use-toast";

const KNOWN_ERRORS: Record<string, { title: string; description: string }> = {
  STRIPE_CONNECT_REQUIRED: {
    title: "Stripe Setup Required",
    description: "Complete your payout setup before accepting jobs. Go to Profile → Payouts.",
  },
  ID_REQUIRED: {
    title: "ID Verification Required",
    description: "Verify your ID to accept jobs. Go to Profile → Trust & Credentials.",
  },
  DISCLAIMER_REQUIRED: {
    title: "Agreement Required",
    description: "Please review and accept the liability disclaimer to continue.",
  },
  SAFETY_CONFIRM_REQUIRED: {
    title: "Confirmation Required",
    description: "Please confirm you're ready to start before proceeding.",
  },
  DEMO_GUARD: {
    title: "Demo Mode",
    description: "This action is not available in demo mode.",
  },
  SUSPENDED: {
    title: "Account Suspended",
    description: "Your account has been suspended. Contact GUBER support.",
  },
  NOT_AUTHENTICATED: {
    title: "Session Expired",
    description: "Please log in again to continue.",
  },
};

export function useErrorToast() {
  const { toast } = useToast();

  return function showError(err: any, fallbackTitle = "Something went wrong") {
    const known = KNOWN_ERRORS[err?.message];
    if (known) {
      toast({ title: known.title, description: known.description, variant: "guber-error" });
      return;
    }
    const title = fallbackTitle;
    const description =
      err?.detail ??
      (typeof err?.message === "string" && err.message.length < 100 ? err.message : undefined);
    toast({ title, description, variant: "guber-error" });
  };
}
